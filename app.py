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
import json
import os
import re
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
    # dossier temporaire d'extraction, données persistantes à côté du .exe
    BUNDLE = sys._MEIPASS
    ROOT = os.path.dirname(sys.executable)
else:
    BUNDLE = ROOT = os.path.dirname(os.path.abspath(__file__))

WEB = os.path.join(BUNDLE, "web")
SEED = os.path.join(BUNDLE, "data")      # catalogue satellites + TLE de secours : embarqués, lecture seule
DATA = os.path.join(ROOT, "data")        # station.json, qso.json, caches, vendor/ : persistants
VENDOR = os.path.join(DATA, "vendor")

TLE_SOURCES = [
    ("amateur", "https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle"),
    ("stations", "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle"),
]
TLE_MAX_AGE = 3600              # 1 h — rafraîchissement automatique
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

# météo autour de la station (Open-Meteo — gratuit, sans clé)
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
WEATHER_CACHE = os.path.join(DATA, "weather_cache.json")
WEATHER_MAX_AGE = 1800           # 30 min

WMO = {
    0: ("Ciel dégagé", "☀️"), 1: ("Généralement dégagé", "🌤"), 2: ("Partiellement nuageux", "⛅"),
    3: ("Couvert", "☁️"),
    45: ("Brouillard", "🌫"), 48: ("Brouillard givrant", "🌫"),
    51: ("Bruine légère", "🌦"), 53: ("Bruine", "🌦"), 55: ("Bruine forte", "🌦"),
    56: ("Bruine verglaçante", "🌧"), 57: ("Bruine verglaçante forte", "🌧"),
    61: ("Pluie légère", "🌧"), 63: ("Pluie", "🌧"), 65: ("Pluie forte", "🌧"),
    66: ("Pluie verglaçante", "🌧"), 67: ("Pluie verglaçante forte", "🌧"),
    71: ("Neige légère", "🌨"), 73: ("Neige", "🌨"), 75: ("Neige forte", "🌨"), 77: ("Neige en grains", "🌨"),
    80: ("Averses légères", "🌦"), 81: ("Averses", "🌧"), 82: ("Averses violentes", "⛈"),
    85: ("Averses de neige", "🌨"), 86: ("Averses de neige fortes", "🌨"),
    95: ("Orage", "⛈"), 96: ("Orage + grêle", "⛈"), 99: ("Orage violent + grêle", "⛈"),
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


def http_get(url, timeout=25):
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "jb-satrack/1.0 (F4MAJ)"})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read().decode("utf-8", "replace")


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
            out[name.strip()] = {"name": name.strip(), "l1": l1, "l2": l2, "norad": norad}
            i += 3
        else:
            i += 1
    return out


def refresh_tle(force=False):
    cache = read_json(TLE_CACHE, {})
    age = time.time() - cache.get("fetched_at", 0)
    if cache.get("sats") and age < TLE_MAX_AGE and not force:
        return cache

    merged, errors = {}, []
    for group, url in TLE_SOURCES:
        try:
            txt = http_get(url)
            got = parse_tle(txt)
            if not got:
                raise ValueError("réponse vide ou illisible")
            merged.update(got)
            log("TLE %s : %d satellites" % (group, len(got)))
        except Exception as e:
            errors.append("%s: %s" % (group, e))
            log("TLE %s ÉCHEC : %s" % (group, e))

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
    label, icon = WMO.get(code, ("Inconnu", "❓"))
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
            return self.send(200, read_json(STATION_FILE, DEFAULT_STATION))

        if path == "/api/satellites":
            return self.send(200, read_json(SATS_FILE, {"satellites": []}))

        if path == "/api/tle":
            cache = refresh_tle()
            return self.send(200, {
                "fetched_at": cache.get("fetched_at", 0),
                "age_s": int(time.time() - cache.get("fetched_at", 0)) if cache.get("fetched_at") else None,
                "count": len(cache.get("sats", {})),
                "stale": bool(cache.get("stale") or cache.get("fallback")),
                "errors": cache.get("errors", []),
                "sats": cache.get("sats", {}),
            })

        if path == "/api/tle/refresh":
            cache = refresh_tle(force=True)
            return self.send(200, {"count": len(cache.get("sats", {})), "errors": cache.get("errors", [])})

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
            station.update(payload)
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


def main():
    disable_windows_throttling()
    ap = argparse.ArgumentParser(description="JB-SATRACK — suivi satellites radioamateur")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8073)))
    args = ap.parse_args()

    os.makedirs(DATA, exist_ok=True)
    if not os.path.exists(STATION_FILE):
        write_json(STATION_FILE, DEFAULT_STATION)
        log("station.json créé (F4MAJ / JN37QS)")

    threading.Thread(target=lambda: ensure_satjs(), daemon=True).start()
    threading.Thread(target=lambda: ensure_leaflet_js(), daemon=True).start()
    threading.Thread(target=lambda: ensure_leaflet_css(), daemon=True).start()
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
