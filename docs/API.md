# API HTTP — JB-SATRACK

Toutes les routes sont servies par `app.py` (`Handler`, port 8073 par défaut).
Réponses JSON en `application/json; charset=utf-8`, en-tête `Cache-Control:
no-store`. Le client (`web/app.js`) est le seul consommateur.

---

## Données

### `GET /api/station`
Config station : **`DEFAULT_STATION` recouvert par `data/station.json`**
(`deep_merge`). Le fichier disque est partiel par construction ; on sert donc
toujours un objet complet, le client n'a pas à se défendre contre une clé
absente. Schéma : voir [`DONNEES.md`](DONNEES.md#stationjson).

### `POST /api/station`
Corps : patch JSON partiel. `deep_merge` dans `data/station.json` (un patch
`{"antenna":{"type":"yagi"}}` ne perd pas `height_m`), écriture atomique sous
`_lock`. Réponse : la station complète après fusion. Corps non-JSON → `400`.
> Ajouter un réglage = **une clé dans `DEFAULT_STATION`**, et rien d'autre.

### `GET /api/satellites`
Le catalogue `data/satellites.json` tel quel (`{satellites:[…]}`). Livré, non
modifié par l'appli. Format : [`DONNEES.md`](DONNEES.md#satellitesjson).

### `GET /api/tle`
**Ne bloque jamais.** Sert `data/tle_cache.json` tel quel ; s'il a dépassé
`TLE_MAX_AGE` (1 h) il est marqué `stale` et un refresh part **en tâche de
fond** (`_tle_refresh_async`). Cache totalement absent → une récupération
synchrone (seul cas bloquant).

```json
{ "fetched_at": 1788696112.0, "age_s": 92, "count": 1607,
  "stale": false, "errors": [],
  "sats": { "ISS": { "name": "ISS", "l1": "1 25544U …", "l2": "2 25544 …", "norad": 25544 }, … } }
```
`fetched_at` = 0 → repli sur le fichier embarqué. `age_s` = `null` si
`fetched_at` = 0.

### `GET /api/tle/refresh`
**Bloquant et forcé** — l'action du bouton « Rafraîchir ». `refresh_tle(force=True)`
(retéléchargement AMSAT + SatNOGS + R4UAB fusionnés, réécriture du cache). Même
forme que `/api/tle`. Un échec ressort en `stale: true` + `errors` non vide (le
cache est conservé). Peut durer jusqu'à ~40 s si toutes les sources sont muettes
(rare).

### `GET /api/iss-status` · `GET /api/iss-status/refresh`
État radio de l'ISS, relevé sur la page ARISS (cache `data/iss_status.json`, 1 h ;
`/refresh` force). `parse_iss_status` par mots-clés.

```json
{ "modes": {
    "repeater": { "label": "Répéteur FM voix (NA1SS)", "state": "active",
                  "up": 145.99, "down": 437.8, "ctcss": 67.0, "excerpt": "…" },
    "aprs":     { "label": "APRS / Digipeater (RS0ISS)", "state": "active"|"off",
                  "freq": 145.825, "excerpt": "…" },
    "sstv":     { "state": "scheduled"|"active"|"idle", "freq": 145.8, "excerpt": "…" },
    "voice":    { "state": "scheduled"|"idle", "freq": 145.8, "excerpt": "…" } },
  "outages": ["power down …"], "checked_at": 1788…, "source": "https://www.ariss.org/…",
  "stale": false }
```
Page illisible → `{"modes": {}, "error": "…", "stale": true}`. Le client
(`applyIssOverrides`) applique ces états aux modes du catalogue, **phonie en
tête**.

### `GET /api/weather` · `GET /api/weather/refresh`
Météo Open-Meteo autour de `station.lat/lon` (cache `data/weather_cache.json`,
30 min).

```json
{ "fetched_at": 1788…, "lat": 47.77, "lon": 7.37,
  "now":   { "code": 0, "icon": "Sun", "label": "Ciel dégagé", "temp": 20.2, "wind": 7.4, "cloud": 3 },
  "later": { "code": 3, "icon": "Cloud", "label": "Couvert", "temp": 18, "hours": 3 } | null,
  "stale": false }
```
`icon` = nom d'icône Reicon (table `WMO`). Échec, cache présent → `stale: true` +
`error`.

### `GET /api/qso`
Le journal `data/qso.json` : `[ {id, utc, call, grid, rst_s, rst_r, sat, mode,
freq, band, note}, … ]`.

### `POST /api/qso`
Corps : un QSO (au moins `call`). Le serveur ajoute `utc` (si absent) et
`id = int(time*1000)`, ajoute au tableau, écrit sous `_lock`. Réponse : le QSO
stocké.

### `GET /api/qso.adi`
Le journal en **ADIF** (`text/plain`, `Content-Disposition: attachment`,
`jb-satrack.adi`). `PROP_MODE:SAT`, `SAT_NAME`, `MY_GRIDSQUARE`, etc.

### `GET /api/health`
```json
{ "ok": true, "tle_count": 1607, "tle_age_s": 144,
  "satjs": true, "utc": "2026-09-06T12:08:04.311+00:00" }
```

---

## Ressources vendorisées (`/vendor/…`)

Téléchargées une fois par le serveur, mises en cache dans `data/vendor/`, servies
en local (`Cache-Control: no-cache`). Indisponible = **`503`** avec un corps
lisible (commentaire JS/CSS), l'interface dégrade proprement (pile de polices
système, message « satellite.js non chargé »…).

| Route | Fichier | Échec |
|---|---|---|
| `GET /vendor/satellite.min.js` | `data/vendor/satellite.min.js` | `503` |
| `GET /vendor/leaflet.js` · `/vendor/leaflet.css` | idem | `503` |
| `GET /vendor/fonts.css` | `data/vendor/fonts.css` (généré, `src:` locaux) | `503` |
| `GET /vendor/font/<nom>.woff2` | `data/vendor/fonts/` (regex `_FONT_FILE_RE`) | `404` |
| `GET /vendor/icon/<Nom>.svg` | `ensure_icon(<Nom>)` → `data/vendor/icons/<Nom>.svg` | `404` (commentaire SVG) |

---

## Statique

Tout le reste : `web/` (`/` → `index.html`). Garde-fou anti-traversée
(`full.startswith(WEB)`). Hors de `web/` → `404 {"error":"not found"}`.

---

## Notes

- Le serveur **bind `0.0.0.0`** par défaut (accès LAN, modèle « JB-SERVER »).
  Pour un poste isolé : `--host 127.0.0.1`.
- Aucune authentification : outil local / LAN de confiance.
- `_lock` (mutex) protège toute écriture de fichier.
