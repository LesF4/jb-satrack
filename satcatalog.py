"""Catalogue automatique des satellites radioamateurs trafiquables, + ISS.

Source unique pour JB-SATRACK et pour l'horloge JB-PIXBAR (qui en embarque une
copie) : les deux doivent montrer exactement les mêmes satellites.

    1. Liste : statut AMSAT (https://www.amsat.org/status/), les satellites
       radioamateurs actifs, avec leurs catégories de trafic. On garde ceux qu'on
       peut TRAFIQUER : répéteur FM, transpondeur linéaire, digipeater. Les balises,
       la télémétrie, la SSTV ou la musique ne s'écoutent que : écartés.
    2. NORAD : fichier TLE d'AMSAT (mêmes noms), sinon base SatNOGS.
    3. Fréquences : émetteurs SatNOGS du satellite. Sans voie montante ET descendante
       sur une bande radioamateur, il n'est pas trafiquable : écarté.
    4. Les entrées écrites à la main dans `data/satellites.json` (fréquences et
       CTCSS vérifiés sur AMSAT) priment sur SatNOGS, et l'ISS y est toujours.

Reconstruit une fois par jour ; hors ligne, la dernière liste reste en service,
et à défaut le fichier écrit à la main. Bibliothèque standard uniquement.
"""
import json
import os
import re
import time

AMSAT_STATUS = "https://www.amsat.org/status/"
AMSAT_TLE = "https://www.amsat.org/tle/current/nasabare.txt"
SATNOGS_SATS = "https://db.satnogs.org/api/satellites/?format=json"
SATNOGS_TX = "https://db.satnogs.org/api/transmitters/?format=json"
MAX_AGE = 24 * 3600
ISS_NORAD = 25544

# Catégories AMSAT qu'on peut trafiquer. « U/v », « V/u », « V/a »… = transpondeur
# linéaire ; « NB/WB » = QO-100, géostationnaire : il n'a pas de passages.
_FM = {"FM"}
_DIGI = re.compile(r"Digi$")
_LINEAR = re.compile(r"^[A-Z]/[a-z]$")

# Bandes radioamateur où un satellite peut se trafiquer (MHz).
_BANDS = [(28.0, 30.0), (144.0, 148.0), (430.0, 440.0), (1240.0, 1300.0)]
_LINEAR_MODES = {"USB", "LSB", "SSB", "CW", "LINEAR"}


def amsat_categories(html):
    """{nom AMSAT: {catégories}} depuis la liste déroulante de la page de statut."""
    out = {}
    for name, cat in re.findall(r'option value="([^"]+?)_\[([^\]]+)\]"', html):
        out.setdefault(name, set()).add(cat)
    return out


def workable_categories(cats):
    return bool(cats & _FM) or any(_DIGI.search(c) or _LINEAR.match(c) for c in cats)


def amsat_norads(tle_text):
    """{NOM EN MAJUSCULES: NORAD} depuis le fichier TLE d'AMSAT (3 lignes)."""
    lines = [l.strip() for l in tle_text.splitlines() if l.strip()]
    out = {}
    for i in range(len(lines) - 2):
        if lines[i + 1].startswith("1 ") and lines[i + 2].startswith("2 "):
            try:
                out[lines[i].upper()] = int(lines[i + 1][2:7])
            except ValueError:
                pass
    return out


def satnogs_norads(sats):
    """{NOM ou ALIAS EN MAJUSCULES: NORAD} depuis la base SatNOGS (satellites en orbite)."""
    out = {}
    for s in sats:
        n = s.get("norad_cat_id")
        if not n or s.get("status") != "in orbit" or n >= 90000:     # 9xxxx = NORAD provisoire
            continue
        for alias in [s.get("name") or ""] + re.split(r"[,\s]+", s.get("names") or ""):
            if alias:
                out.setdefault(alias.upper(), n)
    return out


def _in_band(hz):
    return bool(hz) and any(lo <= hz / 1e6 <= hi for lo, hi in _BANDS)


def _tone(desc):
    m = re.search(r"(?:ctcss|pl|tone)\D{0,3}(\d{2,3}(?:\.\d)?)|(\d{2,3}\.\d)\s*hz", desc or "", re.I)
    return float(m.group(1) or m.group(2)) if m else None


def modes_from_transmitters(txs):
    """Modes au format de satellites.json, depuis les émetteurs SatNOGS d'un satellite :
    seulement ceux en service qui ont une montée ET une descente sur une bande
    radioamateur. Le répéteur FM phonie d'abord, puis le linéaire, puis le numérique."""
    modes = []
    for t in txs:
        if not t.get("alive") or t.get("status") != "active":
            continue
        up, down = t.get("uplink_low"), t.get("downlink_low")
        if not (_in_band(up) and _in_band(down)):
            continue
        mod = (t.get("mode") or "").upper()
        desc = (t.get("description") or "").strip()
        if mod == "FM":
            typ = "fm"
        elif mod in _LINEAR_MODES or t.get("type") == "Transponder":
            typ = "linear"
        else:
            typ = "digi"
        modes.append({"label": desc[:60] or typ, "type": typ, "up": round(up / 1e6, 4),
                      "down": round(down / 1e6, 4), "mod": t.get("mode") or "",
                      "ctcss": _tone(desc) if typ == "fm" else None,
                      "note": "Fréquences SatNOGS, non vérifiées à la main."})
    order = {"fm": 0, "linear": 1, "digi": 2}
    # À type égal, un vrai répéteur (montée ≠ descente, « voice/repeater ») avant un canal simplex.
    modes.sort(key=lambda m: (order[m["type"]], m["up"] == m["down"],
                              not re.search(r"voice|repeater|transponder", m["label"], re.I)))
    return modes


def build(curated, get, log=print):
    """Construit le catalogue. `curated` : contenu de satellites.json (écrit à la main).
    `get(url)` : texte de l'URL. Lève une exception si AMSAT est injoignable."""
    cats = amsat_categories(get(AMSAT_STATUS))
    if not cats:
        raise ValueError("statut AMSAT vide ou illisible")
    names = amsat_norads(get(AMSAT_TLE))
    try:
        names_sn = satnogs_norads(json.loads(get(SATNOGS_SATS)))
    except Exception as e:
        log("catalogue : base SatNOGS des satellites indisponible (%s)" % e)
        names_sn = {}
    txs = {}
    for t in json.loads(get(SATNOGS_TX)):
        if t.get("norad_cat_id"):
            txs.setdefault(t["norad_cat_id"], []).append(t)

    hand = {s["norad"]: s for s in curated.get("satellites", []) if s.get("norad")}
    out, seen = [], set()
    # L'ISS d'abord, toujours, telle qu'écrite à la main.
    if ISS_NORAD in hand:
        out.append(hand[ISS_NORAD])
        seen.add(ISS_NORAD)
    skipped = []
    for name in sorted(cats):
        if not workable_categories(cats[name]):
            continue
        n = names.get(name.upper()) or names_sn.get(name.upper())
        if not n or n in seen:
            if not n:
                skipped.append(name)
            continue
        if n in hand:                                  # fréquences vérifiées à la main
            out.append(hand[n])
            seen.add(n)
            continue
        modes = modes_from_transmitters(txs.get(n, []))
        if not modes:
            skipped.append(name)
            continue
        out.append({"id": name, "name": name, "norad": n, "match": [name],
                    "priority": 50, "modes": modes, "source": "auto"})
        seen.add(n)
    # Les entrées écrites à la main restent toujours, même absentes du statut AMSAT
    # (IO-117 n'y figure pas) : la liste automatique complète, elle ne retire rien.
    for n, sat in hand.items():
        if n not in seen:
            out.append(sat)
            seen.add(n)
    out.sort(key=lambda s: (s.get("priority", 50), s["id"]))
    log("catalogue : %d satellites trafiquables (%d écartés sans NORAD ou sans voie montante)"
        % (len(out), len(skipped)))
    return {"_note": "Généré automatiquement (statut AMSAT + SatNOGS), entrées manuelles "
                     "prioritaires. Voir satcatalog.py.",
            "generated_at": time.time(), "satellites": out}


def load(cache_path, curated_path, get, log=print, max_age=MAX_AGE, force=False):
    """Catalogue en cache s'il a moins de `max_age`, sinon reconstruit ; en cas
    d'échec, le dernier cache, puis le fichier écrit à la main."""
    curated = _read(curated_path) or {"satellites": []}
    cache = _read(cache_path)
    if cache and cache.get("satellites") and not force \
            and time.time() - cache.get("generated_at", 0) < max_age:
        return cache
    try:
        cat = build(curated, get, log)
        tmp = cache_path + ".tmp"
        os.makedirs(os.path.dirname(cache_path) or ".", exist_ok=True)
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cat, f, ensure_ascii=False, indent=1)
        os.replace(tmp, cache_path)
        return cat
    except Exception as e:
        log("catalogue : reconstruction impossible (%s), dernière liste conservée" % e)
    return cache if cache and cache.get("satellites") else curated


def _read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def selftest():
    """Décisions qui échoueraient en silence : un satellite écarté à tort, ou gardé à tort."""
    html = ('<option value="SO-50_[FM]"><option value="RS-44_[V/u]"><option value="LO-19_[TLM]">'
            '<option value="QO-100_[NB]"><option value="NO-44_[VHF_Digi]"><option value="RS18S_[SSTV]">')
    cats = amsat_categories(html)
    assert workable_categories(cats["SO-50"]) and workable_categories(cats["RS-44"])
    assert workable_categories(cats["NO-44"]), "digipeater écarté à tort"
    assert not workable_categories(cats["LO-19"]), "balise de télémétrie gardée"
    assert not workable_categories(cats["QO-100"]), "géostationnaire gardé (pas de passages)"
    assert not workable_categories(cats["RS18S"]), "SSTV seule gardée"
    tx = [{"alive": True, "status": "active", "mode": "FM", "uplink_low": 145850000,
           "downlink_low": 436795000, "description": "Mode V/U FM Voice CTCSS 67.0 Hz"},
          {"alive": True, "status": "active", "mode": "CW", "uplink_low": None,
           "downlink_low": 437000000, "description": "Beacon"},
          {"alive": False, "status": "active", "mode": "FM", "uplink_low": 145900000,
           "downlink_low": 435000000, "description": "dead"}]
    m = modes_from_transmitters(tx)
    assert len(m) == 1 and m[0]["type"] == "fm" and m[0]["ctcss"] == 67.0, m
    assert modes_from_transmitters([tx[1]]) == [], "balise sans montée gardée"
    lin = modes_from_transmitters([{"alive": True, "status": "active", "mode": "USB", "type": "Transponder",
                                    "uplink_low": 145950000, "downlink_low": 435850000, "description": "Linear"}])
    assert lin[0]["type"] == "linear"
    bare = "SO-50\n1 27607U 02058C   26266.5  .0  00000-0  0 0  9990\n2 27607  64.5 1 1 1 1 14.7 1\n"
    assert amsat_norads(bare) == {"SO-50": 27607}

    # build() : ISS toujours présente, entrée manuelle prioritaire, balise écartée.
    pages = {AMSAT_STATUS: html + '<option value="ISS_[FM]">', AMSAT_TLE: bare + "NO-44\n1 26931U x\n2 26931 x\n",
             SATNOGS_SATS: "[]",
             SATNOGS_TX: json.dumps([dict(tx[0], norad_cat_id=26931, mode="AFSK", uplink_low=145825000,
                                          downlink_low=145825000, description="APRS")])}
    curated = {"satellites": [{"id": "ISS", "norad": ISS_NORAD, "priority": 1, "modes": [{"type": "fm"}]},
                              {"id": "SO-50", "norad": 27607, "priority": 2, "modes": [{"type": "fm"}]}]}
    cat = build(curated, pages.__getitem__, log=lambda *_: None)
    ids = [s["id"] for s in cat["satellites"]]
    assert ids[0] == "ISS", ids
    assert "SO-50" in ids and cat["satellites"][1] is curated["satellites"][1], "entrée manuelle non prioritaire"
    assert "NO-44" in ids and "LO-19" not in ids and "QO-100" not in ids, ids
    curated["satellites"].append({"id": "IO-117", "norad": 53106, "priority": 9, "modes": [{"type": "digi"}]})
    ids = [s["id"] for s in build(curated, pages.__getitem__, log=lambda *_: None)["satellites"]]
    assert "IO-117" in ids, "entrée manuelle absente d'AMSAT retirée à tort"
    return True


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        print("satcatalog selftest OK" if selftest() else "ECHEC")
