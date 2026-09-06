#!/usr/bin/env python3
"""
JB-SATRACK — serveur de suivi satellites radioamateur + ISS
Station F4MAJ / JN37QS

Aucune dépendance : bibliothèque standard Python 3.8+ uniquement.
    python3 app.py                 -> http://0.0.0.0:873
    python3 app.py --port 9000     -> autre port

Le serveur :
  * sert l'interface web (dossier web/)
  * télécharge et met en cache les TLE CelesTrak (rafraîchis toutes les 6 h)
  * récupère une fois satellite.js (calcul SGP4 côté navigateur) et le met en cache
  * stocke la configuration station et le journal de trafic (QSO) en JSON
  * exporte le journal en ADIF
"""

import argparse
import copy
import hashlib
import json
import os
import re
import shutil
import ssl
import sys
import threading
import time
import urllib.request
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

if getattr(sys, "frozen", False):
    # exécutable PyInstaller : ressources embarquées (lecture seule) dans le
    # dossier temporaire d'extraction ; données persistantes ailleurs.
    BUNDLE = sys._MEIPASS
    _exe_dir = os.path.dirname(sys.executable)
    _portable = os.path.join(_exe_dir, "data")
    if os.path.isdir(_portable) and os.access(_portable, os.W_OK):
        # mode "portable" : un dossier data/ inscriptible est posé à côté du .exe
        # (clé USB, dossier perso) -> tout reste groupé, rien dans le profil.
        ROOT = _exe_dir
    else:
        # installé (p. ex. sous C:\Program Files, non inscriptible) : profil user.
        ROOT = os.path.join(os.environ.get("LOCALAPPDATA")
                            or os.path.join(os.path.expanduser("~"), ".local", "share"),
                            "JB-SATRACK")
    os.environ.setdefault("JB_SATRACK_DATA", ROOT)   # visible dans les logs / debug
else:
    BUNDLE = ROOT = os.path.dirname(os.path.abspath(__file__))

WEB = os.path.join(BUNDLE, "web")
SEED = os.path.join(BUNDLE, "data")      # catalogue satellites + TLE de secours : embarqués, lecture seule
DATA = os.path.join(ROOT, "data")        # station.json, qso.json, caches, vendor/ : persistants
VENDOR = os.path.join(DATA, "vendor")

# Certaines sources filtrent selon le User-Agent : un client qui ne se présente
# pas comme un navigateur peut recevoir un 403. On se présente comme Chrome,
# comme pour Google Fonts (voir FONTS_UA plus bas).
TLE_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
          "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
# PLUSIEURS sources indépendantes, TOUTES fusionnées (dédoublées par NORAD, la 1re
# source qui fournit un satellite gagne) — l'objectif est la couverture LA PLUS
# LARGE possible du segment radioamateur + ISS.
#   - AMSAT nasabare : liste radioamateur canonique, curatée, MAJ quotidienne.
#   - SatNOGS DB     : base de la communauté (>1600 objets), JSON, sans clé.
#   - R4UAB          : redondance, large.
#   - CelesTrak      : souvent injoignable depuis une box FAI (blocage réseau) ;
#                      tenté seulement si les autres ont peu donné.
TLE_SOURCES = [
    "https://www.amsat.org/tle/current/nasabare.txt",
    "https://db.satnogs.org/api/tle/?format=json",
    "https://r4uab.ru/satonline.txt",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
]
TLE_MIN_OK = 50                # en-dessous, on tente aussi CelesTrak (repli)
TLE_MAX_AGE = 3600            # 1 h — rafraîchissement automatique
TLE_CACHE = os.path.join(DATA, "tle_cache.json")
TLE_FALLBACK = os.path.join(SEED, "tle_fallback.txt")

# statut radio de l'ISS (page officielle ARISS)
ISS_STATUS_URL = "https://www.ariss.org/current-status-of-iss-stations.html"
ISS_STATUS_CACHE = os.path.join(DATA, "iss_status.json")
ISS_MAX_AGE = 3600              # 1 h

SATJS_URLS = [
    "https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js",
    "https://cdn.jsdelivr.net/npm/satellite.js@4.1.4/dist/satellite.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/satellite.js/4.1.3/satellite.min.js",
]
SATJS_FILE = os.path.join(VENDOR, "satellite.min.js")

# carte : tuiles réelles via Leaflet (mises en cache localement au 1er lancement)
LEAFLET_JS_URLS = [
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",
]
LEAFLET_CSS_URLS = [
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css",
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css",
]
LEAFLET_JS_FILE = os.path.join(VENDOR, "leaflet.js")
LEAFLET_CSS_FILE = os.path.join(VENDOR, "leaflet.css")

# banque d'icônes : Reicon (https://reicon.dev), graisse Filled, licence MIT.
# Chaque icône est récupérée à l'unité depuis le paquet npm « reicon », son
# tracé Filled est extrait et mis en cache en SVG local dans data/vendor/icons/.
REICON_VERSION = "1.2.4"
REICON_ICON_SOURCES = [
    "https://cdn.jsdelivr.net/npm/reicon@%s/icons/%s.js",
    "https://unpkg.com/reicon@%s/icons/%s.js",
]
ICONS_DIR = os.path.join(VENDOR, "icons")
_ICON_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9]{0,63}$")

# polices : Inter (les mots) + JetBrains Mono (les nombres), socle visuel arrêté.
# L'exécutable Windows tourne hors ligne : un lien vers fonts.googleapis.com lui
# ferait perdre sa typographie alors que tout le reste est déjà en cache local.
# On demande donc une fois la feuille css2, on télécharge les woff2 et on réécrit
# les src: vers /vendor/font/… — même schéma que Leaflet et les icônes Reicon.
FONTS_CSS_URL = ("https://fonts.googleapis.com/css2"
                 "?family=Inter:wght@400;500;600;700"
                 "&family=JetBrains+Mono:wght@400;500;700"
                 "&display=swap")
# Google sert du woff/ttf aux User-Agent qu'il ne reconnaît pas : il faut celui
# d'un navigateur récent pour obtenir du woff2.
FONTS_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
FONTS_SUBSETS = ("latin", "latin-ext")   # français : accents, œ, guillemets, ’ et −
FONTS_DIR = os.path.join(VENDOR, "fonts")
FONTS_CSS_FILE = os.path.join(VENDOR, "fonts.css")
_FONT_FILE_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}\.woff2$")

# météo autour de la station (Open-Meteo — gratuit, sans clé)
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
WEATHER_CACHE = os.path.join(DATA, "weather_cache.json")
WEATHER_MAX_AGE = 1800           # 30 min

# code météo OMM -> (libellé, nom d'icône Reicon Filled — voir web/icons.js)
WMO = {
    0: ("Ciel dégagé", "Sun"), 1: ("Généralement dégagé", "CloudSun"),
    2: ("Partiellement nuageux", "CloudSun"), 3: ("Couvert", "Cloud"),
    45: ("Brouillard", "CloudFog"), 48: ("Brouillard givrant", "CloudFog"),
    51: ("Bruine légère", "CloudDrizzle"), 53: ("Bruine", "CloudDrizzle"), 55: ("Bruine forte", "CloudDrizzle"),
    56: ("Bruine verglaçante", "CloudDrizzle"), 57: ("Bruine verglaçante forte", "CloudDrizzle"),
    61: ("Pluie légère", "CloudRain"), 63: ("Pluie", "CloudRain"), 65: ("Pluie forte", "CloudRain"),
    66: ("Pluie verglaçante", "CloudRain"), 67: ("Pluie verglaçante forte", "CloudRain"),
    71: ("Neige légère", "CloudSnow"), 73: ("Neige", "CloudSnow"), 75: ("Neige forte", "CloudSnow"), 77: ("Neige en grains", "CloudSnow"),
    80: ("Averses légères", "CloudRain"), 81: ("Averses", "CloudRain"), 82: ("Averses violentes", "CloudBolt"),
    85: ("Averses de neige", "CloudSnow"), 86: ("Averses de neige fortes", "CloudSnow"),
    95: ("Orage", "CloudLightning"), 96: ("Orage + grêle", "CloudStorm"), 99: ("Orage violent + grêle", "CloudStorm"),
}

STATION_FILE = os.path.join(DATA, "station.json")
QSO_FILE = os.path.join(DATA, "qso.json")
SATS_FILE = os.path.join(SEED, "satellites.json")

DEFAULT_STATION = {
    "callsign": "F4MAJ",
    "locator": "JN37QS",
    "city": "Illzach",
    "lat": 47.7719,
    "lon": 7.3444,
    "alt_m": 240,
    "antenna": {"type": "omnidirectionnelle fixe", "height_m": 9, "rotor": False,
                "cone_of_silence_deg": 75},
    "rig": {"model": "Yaesu FTM-500D", "cat": False, "soundcard": "Digirig",
            "tuning_step_khz": 5},
    "min_elevation_deg": 5,
    "horizon_deg": 0,
    "timezone": "Europe/Paris",
    "forecast_hours": 48,
    # Alerte avant passage. Le seuil est VOLONTAIREMENT plus haut que
    # min_elevation_deg : un passage à 6° mérite d'être listé, pas de faire
    # sonner une notification. Le troisième seuil écarte les passages qui
    # culminent dans le cône de silence de l'antenne.
    "alert": {"lead_min": 10, "min_elevation_deg": 20, "skip_zenith": True},
    "configured": False    # bascule à True une fois l'assistant de configuration passé
}

_lock = threading.Lock()


# ----------------------------------------------------------------- utilitaires
def log(msg):
    print("[%s] %s" % (datetime.now().strftime("%H:%M:%S"), msg), flush=True)


def read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def deep_merge(base, patch):
    """Fusion récursive d'un patch partiel dans une config.

    `dict.update()` remplace un sous-dictionnaire en bloc : un patch
    {"antenna": {"type": "yagi"}} emporterait height_m, rotor et
    cone_of_silence_deg avec lui. La configuration de station est imbriquée
    (antenna, rig), donc la fusion doit l'être aussi."""
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            deep_merge(base[k], v)
        else:
            base[k] = v
    return base


def http_get_bytes(url, timeout=25, ua="jb-satrack/1.0 (F4MAJ)"):
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read()


def http_get(url, timeout=25, ua="jb-satrack/1.0 (F4MAJ)"):
    return http_get_bytes(url, timeout, ua).decode("utf-8", "replace")


# ------------------------------------------------------------------------ TLE
def parse_tle(text):
    """Texte TLE 3 lignes -> {nom: {name, l1, l2, norad}}"""
    out = {}
    lines = [l.rstrip() for l in text.splitlines() if l.strip()]
    i = 0
    while i + 2 < len(lines):
        name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
        if l1.startswith("1 ") and l2.startswith("2 "):
            norad = None
            m = re.match(r"1 (\d+)", l1)
            if m:
                norad = int(m.group(1))
            name = re.sub(r"^0 +", "", name.strip())   # certains flux gardent le préfixe 3LE « 0 »
            out[name] = {"name": name, "l1": l1, "l2": l2, "norad": norad}
            i += 3
        else:
            i += 1
    return out


def _parse_satnogs(text):
    """JSON SatNOGS DB [{tle0,tle1,tle2,norad_cat_id}, …] -> même forme que parse_tle."""
    out = {}
    for e in json.loads(text):
        l1, l2 = (e.get("tle1") or "").strip(), (e.get("tle2") or "").strip()
        if not (l1.startswith("1 ") and l2.startswith("2 ")):
            continue
        name = re.sub(r"^0 +", "", (e.get("tle0") or "").strip()) or ("NORAD %s" % e.get("norad_cat_id"))
        nd = e.get("norad_cat_id")
        try:
            nd = int(nd)
        except (TypeError, ValueError):
            m = re.match(r"1 (\d+)", l1)
            nd = int(m.group(1)) if m else None
        out[name] = {"name": name, "l1": l1, "l2": l2, "norad": nd}
    return out


def _parse_tle_any(url, text):
    return _parse_satnogs(text) if "format=json" in url or url.endswith(".json") else parse_tle(text)


def _tle_epoch(l1):
    """Instant de l'époque du TLE, en secondes Unix (0 si illisible). Sert à
    garder, pour chaque satellite, l'orbite LA PLUS RÉCENTE quand plusieurs
    sources le fournissent — c'est ça qui garantit une position juste."""
    m = re.match(r"1 +\d+\w? +\S+ +(\d\d)(\d{3}\.\d+)", l1)
    if not m:
        return 0.0
    year = 2000 + int(m.group(1))
    jan1 = datetime(year, 1, 1, tzinfo=timezone.utc).timestamp()
    return jan1 + (float(m.group(2)) - 1.0) * 86400.0


def _tle_response(cache):
    """Forme JSON commune à /api/tle et /api/tle/refresh."""
    fetched = cache.get("fetched_at", 0)
    return {
        "fetched_at": fetched,
        "age_s": int(time.time() - fetched) if fetched else None,
        "count": len(cache.get("sats", {})),
        "stale": bool(cache.get("stale") or cache.get("fallback")),
        "errors": cache.get("errors", []),
        "sats": cache.get("sats", {}),
    }


_tle_bg = {"running": False}


def _tle_refresh_async():
    """Lance un refresh_tle(force) en tâche de fond, une seule à la fois.
    Sert à /api/tle : la page ne doit jamais attendre le réseau au chargement."""
    if _tle_bg["running"]:
        return
    _tle_bg["running"] = True

    def run():
        try:
            refresh_tle(force=True)
        except Exception as e:
            log("refresh TLE en fond : %s" % e)
        finally:
            _tle_bg["running"] = False

    threading.Thread(target=run, daemon=True).start()


def _tle_host(url):
    m = re.match(r"https?://([^/]+)", url)
    return m.group(1) if m else url


def refresh_tle(force=False):
    cache = read_json(TLE_CACHE, {})
    age = time.time() - cache.get("fetched_at", 0)
    if cache.get("sats") and age < TLE_MAX_AGE and not force:
        return cache

    # pool : clé = NORAD (ou nom si pas de NORAD) -> enregistrement TLE le plus
    # récent vu jusqu'ici, toutes sources confondues.
    pool, errors = {}, []
    for url in TLE_SOURCES:
        # CelesTrak (souvent injoignable, 12 s de timeout) n'est tenté que si les
        # sources principales n'ont presque rien donné.
        if "celestrak" in url and len(pool) >= TLE_MIN_OK:
            continue
        try:
            got = _parse_tle_any(url, http_get(url, timeout=12, ua=TLE_UA))
            if not got:
                raise ValueError("réponse vide ou illisible")
            kept = 0
            for rec in got.values():
                rec["epoch"] = _tle_epoch(rec["l1"])
                k = rec["norad"] if rec.get("norad") is not None else rec["name"]
                if k not in pool or rec["epoch"] > pool[k]["epoch"]:
                    pool[k] = rec
                    kept += 1
            log("TLE %s : %d reçus, %d retenus (plus frais) — %d au total"
                % (_tle_host(url), len(got), kept, len(pool)))
        except Exception as e:
            errors.append("%s: %s" % (_tle_host(url), e))
            log("TLE %s ÉCHEC : %s" % (_tle_host(url), e))

    merged = {r["name"]: {"name": r["name"], "l1": r["l1"], "l2": r["l2"],
                          "norad": r.get("norad")}
              for r in pool.values()}

    if not merged:
        # repli : dernier cache, sinon fichier embarqué
        if cache.get("sats"):
            cache["errors"] = errors
            cache["stale"] = True
            return cache
        if os.path.exists(TLE_FALLBACK):
            with open(TLE_FALLBACK, "r", encoding="utf-8") as f:
                merged = parse_tle(f.read())
            log("TLE : utilisation du fichier de secours (%d sats)" % len(merged))
            return {"fetched_at": 0, "sats": merged, "errors": errors, "fallback": True}
        return {"fetched_at": 0, "sats": {}, "errors": errors}

    cache = {"fetched_at": time.time(), "sats": merged, "errors": errors, "stale": False}
    with _lock:
        write_json(TLE_CACHE, cache)
    return cache


def tle_worker():
    while True:
        try:
            refresh_tle()
        except Exception as e:
            log("worker TLE : %s" % e)
        try:
            refresh_iss_status()
        except Exception as e:
            log("worker ISS : %s" % e)
        try:
            refresh_weather()
        except Exception as e:
            log("worker météo : %s" % e)
        time.sleep(900)          # contrôle toutes les 15 min, rafraîchit si > 1 h


# --------------------------------------------------------------- météo locale
WEATHER_SOON_HOURS = 3     # échéance du 2e pictogramme, affiché seulement si ça change

def _wx_point(code, temp):
    label, icon = WMO.get(code, ("Inconnu", "Cloud"))
    return {"code": code, "icon": icon, "label": label, "temp": temp}


def refresh_weather(force=False):
    cache = read_json(WEATHER_CACHE, {})
    if cache.get("now") and time.time() - cache.get("fetched_at", 0) < WEATHER_MAX_AGE and not force:
        return cache

    station = read_json(STATION_FILE, DEFAULT_STATION)
    lat, lon = station.get("lat", 0), station.get("lon", 0)

    try:
        url = (WEATHER_URL + "?latitude=%.4f&longitude=%.4f" % (lat, lon) +
               "&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,precipitation"
               "&hourly=temperature_2m,weather_code&forecast_hours=%d&timezone=auto" % (WEATHER_SOON_HOURS + 1))
        data = json.loads(http_get(url, timeout=20))
        cur = data.get("current", {}) or {}
        now = _wx_point(cur.get("weather_code"), cur.get("temperature_2m"))
        now["wind"] = cur.get("wind_speed_10m")
        now["cloud"] = cur.get("cloud_cover")

        later = None
        hourly = data.get("hourly", {}) or {}
        codes, temps = hourly.get("weather_code") or [], hourly.get("temperature_2m") or []
        if len(codes) > WEATHER_SOON_HOURS and codes[WEATHER_SOON_HOURS] != now["code"]:
            later = _wx_point(codes[WEATHER_SOON_HOURS],
                               temps[WEATHER_SOON_HOURS] if len(temps) > WEATHER_SOON_HOURS else None)
            later["hours"] = WEATHER_SOON_HOURS

        cache = {"fetched_at": time.time(), "lat": lat, "lon": lon, "now": now, "later": later, "stale": False}
        with _lock:
            write_json(WEATHER_CACHE, cache)
        log("météo mise à jour (%s%s)" % (now["label"], " -> " + later["label"] if later else ""))
        return cache
    except Exception as e:
        log("météo ÉCHEC : %s" % e)
        if cache.get("now"):
            cache["stale"] = True
            cache["error"] = str(e)
            return cache
        return {"fetched_at": 0, "now": None, "later": None, "error": str(e), "stale": True}


# ------------------------------------------------------------- statut ISS
def strip_html(html):
    html = re.sub(r"(?is)<(script|style).*?</\1>", " ", html)
    html = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</tr>", "\n", html)
    txt = re.sub(r"(?s)<[^>]+>", " ", html)
    txt = (txt.replace("&nbsp;", " ").replace("&amp;", "&").replace("&#8217;", "'")
              .replace("&quot;", '"').replace("&#39;", "'").replace("&rsquo;", "'"))
    txt = re.sub(r"[ \t]+", " ", txt)
    return "\n".join(l.strip() for l in txt.splitlines() if l.strip())


def parse_iss_status(text):
    """Analyse la page ARISS -> état des modes radio de l'ISS."""
    low = text.lower()
    freqs = lambda s: [float(f) for f in re.findall(r"(\d{3}\.\d{2,3})\s*(?:mhz)?", s.lower())]

    def context(keyword, span=260):
        i = low.find(keyword)
        return text[max(0, i - span // 2): i + span] if i >= 0 else ""

    modes = {}

    # --- répéteur voix (Columbus / NA1SS)
    ctx = context("repeater mode") or context("voice repeater")
    if ctx:
        f = freqs(ctx)
        modes["repeater"] = {
            "label": "Répéteur FM voix (NA1SS)",
            "state": "active" if "repeater mode" in ctx.lower() else "unknown",
            "up": next((x for x in f if 144 <= x <= 146), None),
            "down": next((x for x in f if 430 <= x <= 440), None),
            "ctcss": 67.0 if "67" in ctx else None,
            "excerpt": " ".join(ctx.split())[:300]
        }

    # --- APRS / packet (Service Module / RS0ISS)
    ctx = context("aprs") or context("packet")
    if ctx:
        cl = ctx.lower()
        off = any(w in cl for w in ["not active", "is off", "inactive", "turned off", "unavailable"])
        f = freqs(ctx)
        modes["aprs"] = {
            "label": "APRS / Digipeater (RS0ISS)",
            "state": "off" if off else "active",
            "freq": next((x for x in f if 144 <= x <= 146 or 435 <= x <= 439), None),
            "excerpt": " ".join(ctx.split())[:300]
        }

    # --- SSTV
    ctx = context("sstv")
    if ctx:
        cl = ctx.lower()
        scheduled = any(w in cl for w in ["scheduled", "will be", "planned", "upcoming", "event"])
        active = any(w in cl for w in ["sstv is active", "transmitting sstv", "sstv active", "sstv event is"])
        modes["sstv"] = {
            "label": "SSTV (images)",
            "state": "scheduled" if scheduled else ("active" if active else "idle"),
            "freq": next((x for x in freqs(ctx) if 144 <= x <= 146), 145.800),
            "excerpt": " ".join(ctx.split())[:300]
        }

    # --- voix éducative ARISS
    ctx = context("school") or context("educational")
    if ctx:
        modes["voice"] = {
            "label": "Voix ARISS (contacts scolaires)",
            "state": "scheduled" if "contact" in ctx.lower() else "idle",
            "freq": 145.800,
            "excerpt": " ".join(ctx.split())[:300]
        }

    # --- coupures programmées
    outages = re.findall(r"(?i)(power\s*(?:down|up)[^.\n]{0,90})", text)

    return {"modes": modes, "outages": [" ".join(o.split()) for o in outages[:6]]}


def refresh_iss_status(force=False):
    cache = read_json(ISS_STATUS_CACHE, {})
    if cache.get("modes") and time.time() - cache.get("checked_at", 0) < ISS_MAX_AGE and not force:
        return cache
    try:
        html = http_get(ISS_STATUS_URL, timeout=25)
        text = strip_html(html)
        parsed = parse_iss_status(text)
        parsed.update({"checked_at": time.time(), "source": ISS_STATUS_URL, "stale": False})
        with _lock:
            write_json(ISS_STATUS_CACHE, parsed)
        log("statut ISS mis à jour (%d modes)" % len(parsed.get("modes", {})))
        return parsed
    except Exception as e:
        log("statut ISS ÉCHEC : %s" % e)
        if cache:
            cache["stale"] = True
            cache["error"] = str(e)
            return cache
        return {"modes": {}, "checked_at": 0, "error": str(e), "source": ISS_STATUS_URL, "stale": True}


# -------------------------------------------------------------- satellite.js
def ensure_satjs():
    if os.path.exists(SATJS_FILE) and os.path.getsize(SATJS_FILE) > 1000:
        try:
            with open(SATJS_FILE, "r", encoding="utf-8") as f:
                if "twoline2satrec" in f.read():
                    return True
        except Exception:
            pass
    os.makedirs(VENDOR, exist_ok=True)
    for url in SATJS_URLS:
        try:
            js = http_get(url, timeout=30)
            if "twoline2satrec" in js:
                with open(SATJS_FILE, "w", encoding="utf-8") as f:
                    f.write(js)
                log("satellite.js récupéré depuis %s" % url)
                return True
        except Exception as e:
            log("satellite.js échec %s : %s" % (url, e))
    return False


def _ensure_vendor_file(file_path, urls, marker):
    if os.path.exists(file_path) and os.path.getsize(file_path) > 800:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                if marker in f.read():
                    return True
        except Exception:
            pass
    os.makedirs(VENDOR, exist_ok=True)
    for url in urls:
        try:
            txt = http_get(url, timeout=30)
            if marker in txt:
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(txt)
                log("%s récupéré depuis %s" % (os.path.basename(file_path), url))
                return True
        except Exception as e:
            log("%s échec %s : %s" % (os.path.basename(file_path), url, e))
    return False


def ensure_leaflet_js():
    return _ensure_vendor_file(LEAFLET_JS_FILE, LEAFLET_JS_URLS, "Leaflet")


def ensure_leaflet_css():
    return _ensure_vendor_file(LEAFLET_CSS_FILE, LEAFLET_CSS_URLS, ".leaflet-")


# ------------------------------------------------------- polices woff2
def ensure_fonts():
    """Récupère la feuille Google Fonts, télécharge les woff2 latin/latin-ext dans
    data/vendor/fonts/ et écrit data/vendor/fonts.css avec des src: locaux.
    Retourne False si le réseau manque : l'interface tombe alors sur la pile système."""
    if os.path.exists(FONTS_CSS_FILE) and os.path.getsize(FONTS_CSS_FILE) > 400:
        return True
    try:
        css = http_get_bytes(FONTS_CSS_URL, timeout=30, ua=FONTS_UA).decode("utf-8", "replace")
    except Exception as e:
        log("polices échec %s : %s" % (FONTS_CSS_URL, e))
        return False
    os.makedirs(FONTS_DIR, exist_ok=True)
    blocks = []
    # chaque @font-face de css2 est précédé du commentaire nommant son sous-ensemble
    for subset, block in re.findall(r"/\*\s*([\w-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S):
        if subset not in FONTS_SUBSETS:
            continue
        src = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", block)
        family = re.search(r"font-family:\s*['\"]?([^;'\"]+)", block)
        if not (src and family):
            continue
        # Inter et JetBrains Mono sont des polices variables : les quatre graisses
        # pointent sur le même woff2. Nommer d'après l'URL (8 hex) au lieu de la
        # graisse évite d'en stocker quatre copies identiques.
        name = "%s-%s-%s.woff2" % (family.group(1).strip().replace(" ", ""), subset,
                                   hashlib.sha1(src.group(1).encode()).hexdigest()[:8])
        dest = os.path.join(FONTS_DIR, name)
        if not (os.path.exists(dest) and os.path.getsize(dest) > 500):
            try:
                data = http_get_bytes(src.group(1), timeout=30, ua=FONTS_UA)
            except Exception as e:
                log("police %s échec : %s" % (name, e))
                return False
            if not data.startswith(b"wOF2"):
                log("police %s : le serveur n'a pas renvoyé du woff2" % name)
                return False
            with open(dest, "wb") as f:
                f.write(data)
        # bloc conservé tel quel (font-weight, font-style, font-display, unicode-range),
        # seule l'URL gstatic devient un chemin local
        blocks.append("/* %s */\n@font-face {%s}" % (
            subset, block.replace(src.group(0), "url(/vendor/font/%s)" % name)))
    if not blocks:
        log("polices : aucune @font-face exploitable dans la feuille css2")
        return False
    with open(FONTS_CSS_FILE, "w", encoding="utf-8") as f:
        f.write("/* JB-SATRACK — polices vendorisées (Inter + JetBrains Mono, "
                "sous-ensembles latin et latin-ext). Généré par app.py, ne pas éditer. */\n"
                + "\n".join(blocks) + "\n")
    log("polices vendorisées : %d fichiers woff2" % len(blocks))
    return True


# --------------------------------------------------------- icônes Reicon
def _extract_icon_body(mod_js):
    """Isole le gabarit SVG interne d'un module Reicon — graisse Filled ('F')
    de préférence, Outline ('O') en repli."""
    frag = mod_js.split("createIcon(", 1)[-1]
    for key in ("F", "O"):
        m = re.search(r"(?<![A-Za-z0-9_])" + key + r"\s*:\s*`(.*?)`", frag, re.S)
        if m and m.group(1).strip():
            return m.group(1).strip()
    return None


def ensure_icon(name):
    """Récupère une icône Reicon (Filled) et la met en cache en SVG local.
    Retourne le chemin du .svg, ou None si le nom est invalide / indisponible."""
    if not _ICON_NAME_RE.match(name or ""):
        return None
    dest = os.path.join(ICONS_DIR, name + ".svg")
    if os.path.exists(dest) and os.path.getsize(dest) > 80:
        return dest
    os.makedirs(ICONS_DIR, exist_ok=True)
    for tpl in REICON_ICON_SOURCES:
        url = tpl % (REICON_VERSION, name)
        try:
            body = _extract_icon_body(http_get(url, timeout=20))
        except Exception as e:
            log("icône %s échec %s : %s" % (name, url, e))
            continue
        if not body:
            continue
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
               'fill="none" width="24" height="24">' + body + '</svg>\n')
        with open(dest, "w", encoding="utf-8") as f:
            f.write(svg)
        log("icône Reicon mise en cache : %s" % name)
        return dest
    return None


# ------------------------------------------------------------------- journal
def adif(qsos, station):
    def field(tag, val):
        val = "" if val is None else str(val)
        return "<%s:%d>%s " % (tag, len(val), val)
    out = ["JB-SATRACK ADIF export — station %s" % station.get("callsign", ""), "<EOH>"]
    for q in qsos:
        try:
            dt = datetime.fromisoformat(q["utc"].replace("Z", "+00:00")).astimezone(timezone.utc)
        except Exception:
            continue
        row = (field("CALL", q.get("call", "").upper())
               + field("QSO_DATE", dt.strftime("%Y%m%d"))
               + field("TIME_ON", dt.strftime("%H%M%S"))
               + field("BAND", q.get("band", "70CM"))
               + field("MODE", q.get("mode", "FM"))
               + field("FREQ", q.get("freq", ""))
               + field("PROP_MODE", "SAT")
               + field("SAT_NAME", q.get("sat", ""))
               + field("GRIDSQUARE", q.get("grid", ""))
               + field("MY_GRIDSQUARE", station.get("locator", ""))
               + field("RST_SENT", q.get("rst_s", "59"))
               + field("RST_RCVD", q.get("rst_r", "59"))
               + field("COMMENT", q.get("note", ""))
               + "<EOR>")
        out.append(row)
    return "\n".join(out) + "\n"


# -------------------------------------------------------------------- serveur
class Handler(BaseHTTPRequestHandler):
    server_version = "jb-satrack/1.0"

    def log_message(self, fmt, *args):
        pass

    # -- helpers
    def send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def body_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        return json.loads(self.rfile.read(n).decode("utf-8"))

    # -- GET
    def do_GET(self):
        path = self.path.split("?")[0]

        if path == "/api/station":
            # Le fichier sur disque est PARTIEL par construction : il a été écrit
            # par une version antérieure qui ne connaissait pas les clés ajoutées
            # depuis. On sert donc les valeurs par défaut recouvertes par le
            # fichier, plutôt que le fichier seul — sinon le client doit se
            # défendre contre une clé manquante à chaque lecture.
            return self.send(200, deep_merge(copy.deepcopy(DEFAULT_STATION),
                                             read_json(STATION_FILE, {})))

        if path == "/api/satellites":
            return self.send(200, read_json(SATS_FILE, {"satellites": []}))

        if path == "/api/tle":
            # La page ne doit JAMAIS attendre le réseau au chargement. Si un
            # cache existe mais a vieilli, on le sert tel quel (marqué stale) et
            # on rafraîchit en fond ; le worker et le bouton « Rafraîchir »
            # feront le reste. Cache absent (1re exécution sans le fichier livré)
            # : là il faut bien attendre une première récupération.
            cache = read_json(TLE_CACHE, {})
            if cache.get("sats"):
                if time.time() - cache.get("fetched_at", 0) >= TLE_MAX_AGE:
                    cache["stale"] = True
                    _tle_refresh_async()
            else:
                cache = refresh_tle()
            return self.send(200, _tle_response(cache))

        if path == "/api/tle/refresh":
            # bloquant et forcé : c'est l'action explicite du bouton. Le client
            # remplace S.tleInfo avec la réponse ; un échec y ressort en
            # stale=True + errors, et la puce d'en-tête passe en ambre.
            return self.send(200, _tle_response(refresh_tle(force=True)))

        if path == "/api/iss-status":
            return self.send(200, refresh_iss_status())

        if path == "/api/iss-status/refresh":
            return self.send(200, refresh_iss_status(force=True))

        if path == "/api/weather":
            return self.send(200, refresh_weather())

        if path == "/api/weather/refresh":
            return self.send(200, refresh_weather(force=True))

        if path == "/api/qso":
            return self.send(200, read_json(QSO_FILE, []))

        if path == "/api/qso.adi":
            qsos = read_json(QSO_FILE, [])
            station = read_json(STATION_FILE, DEFAULT_STATION)
            return self.send(200, adif(qsos, station), "text/plain; charset=utf-8",
                             {"Content-Disposition": 'attachment; filename="jb-satrack.adi"'})

        if path == "/api/health":
            cache = read_json(TLE_CACHE, {})
            return self.send(200, {
                "ok": True,
                "tle_count": len(cache.get("sats", {})),
                "tle_age_s": int(time.time() - cache.get("fetched_at", 0)) if cache.get("fetched_at") else None,
                "satjs": os.path.exists(SATJS_FILE),
                "utc": datetime.now(timezone.utc).isoformat(),
            })

        if path == "/vendor/satellite.min.js":
            if not ensure_satjs():
                return self.send(503, "// satellite.js indisponible : le serveur n'a pas pu le télécharger.\n",
                                 "application/javascript; charset=utf-8")
            return self.serve_file(SATJS_FILE, "application/javascript; charset=utf-8")

        if path == "/vendor/leaflet.js":
            if not ensure_leaflet_js():
                return self.send(503, "// leaflet indisponible : le serveur n'a pas pu le télécharger.\n",
                                 "application/javascript; charset=utf-8")
            return self.serve_file(LEAFLET_JS_FILE, "application/javascript; charset=utf-8")

        if path == "/vendor/leaflet.css":
            if not ensure_leaflet_css():
                return self.send(503, "/* leaflet indisponible */\n", "text/css; charset=utf-8")
            return self.serve_file(LEAFLET_CSS_FILE, "text/css; charset=utf-8")

        if path == "/vendor/fonts.css":
            if not ensure_fonts():
                return self.send(503, "/* polices indisponibles : le serveur n'a pas pu les "
                                      "télécharger, l'interface utilise la pile système. */\n",
                                 "text/css; charset=utf-8")
            return self.serve_file(FONTS_CSS_FILE, "text/css; charset=utf-8")

        if path.startswith("/vendor/font/"):
            name = path[len("/vendor/font/"):]
            dest = os.path.join(FONTS_DIR, name)
            if not _FONT_FILE_RE.match(name) or not os.path.isfile(dest):
                return self.send(404, {"error": "not found"})
            return self.serve_file(dest, "font/woff2")

        if path.startswith("/vendor/icon/") and path.endswith(".svg"):
            name = path[len("/vendor/icon/"):-len(".svg")]
            dest = ensure_icon(name)
            if not dest:
                return self.send(404, "<!-- icône Reicon introuvable : %s -->\n" % name,
                                 "image/svg+xml; charset=utf-8")
            return self.serve_file(dest, "image/svg+xml; charset=utf-8")

        # fichiers statiques
        rel = "index.html" if path == "/" else path.lstrip("/")
        full = os.path.normpath(os.path.join(WEB, rel))
        if not full.startswith(WEB) or not os.path.isfile(full):
            return self.send(404, {"error": "not found"})
        types = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
                 ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
                 ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"}
        ext = os.path.splitext(full)[1].lower()
        return self.serve_file(full, types.get(ext, "application/octet-stream"))

    def serve_file(self, full, ctype):
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    # -- POST
    def do_POST(self):
        path = self.path.split("?")[0]
        try:
            payload = self.body_json()
        except Exception as e:
            return self.send(400, {"error": "JSON invalide: %s" % e})

        if path == "/api/station":
            station = read_json(STATION_FILE, DEFAULT_STATION)
            deep_merge(station, payload)
            with _lock:
                write_json(STATION_FILE, station)
            return self.send(200, station)

        if path == "/api/qso":
            qsos = read_json(QSO_FILE, [])
            payload.setdefault("utc", datetime.now(timezone.utc).isoformat())
            payload["id"] = int(time.time() * 1000)
            qsos.append(payload)
            with _lock:
                write_json(QSO_FILE, qsos)
            return self.send(200, payload)

        return self.send(404, {"error": "not found"})


def disable_windows_throttling():
    """Empêche Windows de ralentir le processus quand sa fenêtre passe en arrière-plan
    (mode Efficacité / EcoQoS) — sinon le serveur peut devenir très lent à répondre
    dès que le navigateur a le focus, ce qui ressemble à un blocage lors d'un
    enregistrement depuis l'interface."""
    if os.name != "nt":
        return
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetCurrentProcess()

        ABOVE_NORMAL_PRIORITY_CLASS = 0x00008000
        kernel32.SetPriorityClass(handle, ABOVE_NORMAL_PRIORITY_CLASS)

        class PROCESS_POWER_THROTTLING_STATE(ctypes.Structure):
            _fields_ = [("Version", ctypes.c_ulong),
                        ("ControlMask", ctypes.c_ulong),
                        ("StateMask", ctypes.c_ulong)]

        PROCESS_POWER_THROTTLING_EXECUTION_SPEED = 0x1
        ProcessPowerThrottling = 4
        state = PROCESS_POWER_THROTTLING_STATE(1, PROCESS_POWER_THROTTLING_EXECUTION_SPEED, 0)
        kernel32.SetProcessInformation(handle, ProcessPowerThrottling,
                                        ctypes.byref(state), ctypes.sizeof(state))
        log("limitation de puissance Windows désactivée pour ce processus")
    except Exception as e:
        log("désactivation de la limitation Windows impossible : %s" % e)


def selftest():
    """Vérification minimale de la fusion de configuration : c'est la seule
    logique non triviale du serveur, et son échec est silencieux (une clé qui
    disparaît de station.json, pas une exception). `python3 app.py --selftest`."""
    st = {"callsign": "F4MAJ",
          "antenna": {"type": "omni", "height_m": 9, "cone_of_silence_deg": 75},
          "rig": {"model": "FTM-500D", "tuning_step_khz": 5}}

    # un patch partiel sur un bloc imbriqué garde les clés voisines
    deep_merge(st, {"antenna": {"type": "yagi"}})
    assert st["antenna"] == {"type": "yagi", "height_m": 9, "cone_of_silence_deg": 75}, st["antenna"]

    # les clés de premier niveau se remplacent normalement
    deep_merge(st, {"callsign": "F1ABC"})
    assert st["callsign"] == "F1ABC"

    # un bloc voisin n'est pas touché
    assert st["rig"]["tuning_step_khz"] == 5

    # remplacer un dict par un scalaire reste possible (pas de fusion forcée)
    deep_merge(st, {"rig": None})
    assert st["rig"] is None

    # GET /api/station : un fichier partiel (écrit par une version antérieure)
    # doit ressortir complété par les défauts, sans que le disque soit modifié
    vieux = {"callsign": "F1ABC", "lat": 48.0}
    servi = deep_merge(copy.deepcopy(DEFAULT_STATION), vieux)
    assert servi["callsign"] == "F1ABC" and servi["lat"] == 48.0
    assert servi["alert"]["lead_min"] == 10, "clé absente du disque non complétée"
    assert vieux == {"callsign": "F1ABC", "lat": 48.0}, "la source a été modifiée"
    assert DEFAULT_STATION["callsign"] == "F4MAJ", "les défauts ont été écrasés"

    # --- TLE : l'époque est lue correctement, et entre deux sources qui donnent
    # le même satellite on garde LA PLUS RÉCENTE. Un échec ici est silencieux :
    # pas d'exception, juste une position de satellite fausse à l'écran.
    e_old = _tle_epoch("1 25544U 98067A   26248.50000000  .00000000  00000+0  00000+0 0  9990")
    e_new = _tle_epoch("1 25544U 98067A   26249.90000000  .00000000  00000+0  00000+0 0  9990")
    assert e_new - e_old - 1.4 * 86400 < 1, "époque TLE mal décodée"
    assert _tle_epoch("pas un TLE") == 0.0

    old = {"ISS": {"name": "ISS", "l1": "1 25544U 98067A   26248.50000000  .0 0 0 0 0", "l2": "2 25544", "norad": 25544}}
    new = {"ISS (ZARYA)": {"name": "ISS (ZARYA)", "l1": "1 25544U 98067A   26249.90000000  .0 0 0 0 0", "l2": "2 25544", "norad": 25544}}
    pool = {}
    for src in (old, new):
        for r in src.values():
            r["epoch"] = _tle_epoch(r["l1"])
            k = r["norad"]
            if k not in pool or r["epoch"] > pool[k]["epoch"]:
                pool[k] = r
    assert len(pool) == 1 and pool[25544]["name"] == "ISS (ZARYA)", "fusion TLE : le plus récent doit gagner"

    print("selftest OK")


def seed_bundled_data():
    """Exe installé, 1er lancement : DATA (profil user) est vide alors que le
    bundle contient déjà les libs vendorisées et un cache TLE. On les recopie une
    fois pour que l'appli soit utilisable même hors ligne au tout premier
    démarrage. Ne fait rien hors mode figé, ni si la cible existe déjà."""
    if SEED == DATA:
        return
    src_vendor = os.path.join(SEED, "vendor")
    if os.path.isdir(src_vendor) and not os.path.isdir(VENDOR):
        try:
            shutil.copytree(src_vendor, VENDOR)
            log("libs vendorisées amorcées depuis le bundle")
        except Exception as e:
            log("amorçage vendor impossible : %s" % e)
    src_cache = os.path.join(SEED, "tle_cache.json")
    if os.path.isfile(src_cache) and not os.path.isfile(TLE_CACHE):
        try:
            shutil.copyfile(src_cache, TLE_CACHE)
            log("cache TLE amorcé depuis le bundle (sera rafraîchi)")
        except Exception as e:
            log("amorçage cache TLE impossible : %s" % e)


def main():
    disable_windows_throttling()
    ap = argparse.ArgumentParser(description="JB-SATRACK — suivi satellites radioamateur")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8073)))
    ap.add_argument("--selftest", action="store_true", help="vérifie la fusion de configuration et sort")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    os.makedirs(DATA, exist_ok=True)
    seed_bundled_data()          # 1er lancement d'un exe installé : amorce data/ depuis le bundle
    if not os.path.exists(STATION_FILE):
        write_json(STATION_FILE, DEFAULT_STATION)
        log("station.json créé (F4MAJ / JN37QS)")

    threading.Thread(target=lambda: ensure_satjs(), daemon=True).start()
    threading.Thread(target=lambda: ensure_leaflet_js(), daemon=True).start()
    threading.Thread(target=lambda: ensure_leaflet_css(), daemon=True).start()
    threading.Thread(target=lambda: ensure_fonts(), daemon=True).start()
    threading.Thread(target=tle_worker, daemon=True).start()

    log("JB-SATRACK sur http://%s:%d" % (args.host, args.port))
    if getattr(sys, "frozen", False):
        # exécutable autonome : pas de .bat pour ouvrir le navigateur, on le fait nous-mêmes
        try:
            import ctypes
            ctypes.windll.kernel32.SetConsoleTitleW("JB-SATRACK — NE FERME PAS CETTE FENÊTRE")
        except Exception:
            pass
        print("")
        print("=" * 62)
        print("  JB-SATRACK tourne dans CETTE fenêtre.")
        print("  NE LA FERME PAS tant que tu utilises l'appli.")
        print("  (tu peux la minimiser ; la fermer arrête le serveur)")
        print("=" * 62)
        print("")
        url = "http://127.0.0.1:%d" % args.port
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
