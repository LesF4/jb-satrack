# Architecture — JB-SATRACK

Comment tout s'emboîte. Pour un développeur (ou une reprise) qui veut la carte
complète du système. Le « pourquoi » des choix est dans
[`DECISIONS.md`](DECISIONS.md) ; l'état courant dans [`ETAT.md`](ETAT.md).

---

## 1. Vue d'ensemble

JB-SATRACK est une **application web servie en local**. Un petit serveur Python
sert l'interface et joue les rôles de **cache et de proxy** vers des données
externes (TLE, statut ISS, météo, tuiles, libs). **Tout le calcul orbital se
fait dans le navigateur** (SGP4 via satellite.js). Il n'y a pas de base de
données : la persistance, ce sont des fichiers JSON à plat.

```
                     ┌──────────── navigateur ────────────┐
   AMSAT/SatNOGS     │  index.html                        │
   R4UAB/CelesTrak   │   ├─ style.css                     │
   ARISS  Open-Meteo │   ├─ /vendor/leaflet.js  (carte)   │
   Nominatim (OSM)   │   ├─ /vendor/satellite.min.js (SGP4)│
   Esri  jsDelivr    │   ├─ icons.js  (banque Reicon)     │
        │  HTTP      │   └─ app.js    (toute la logique)  │
        ▼            │        │  fetch /api/*             │
 ┌─────────────┐  HTTP        ▼                           │
 │  app.py     │◀────────────────────────────────────────┘
 │  (stdlib)   │
 │  - sert web/ + /vendor/ (cache local)
 │  - /api/* : station, TLE, ISS, météo, reverse, QSO, health
 │  - thread de fond : refresh TLE/ISS/météo
 └──────┬──────┘
        │ lit/écrit
        ▼
   data/  (JSON à plat : station.json, qso.json, caches, vendor/)
```

Contraintes structurantes (voir `CLAUDE.md`) :

- **Serveur** : `app.py`, Python 3.8+, **bibliothèque standard uniquement**.
  Aucune dépendance pip. ~1000 lignes, un fichier.
- **Interface** : `web/`, **JS vanilla, aucun build**. Les libs tierces sont
  téléchargées une fois par le serveur, mises en cache dans `data/vendor/`,
  servies sur `/vendor/…`. Toute nouvelle dépendance front suit ce schéma.
- **Icônes** : banque unique **Reicon** (graisse Filled, MIT). Pas d'emoji
  décoratif, pas d'autre jeu, pas de SVG dessiné à la main.

---

## 2. Le serveur — `app.py`

### 2.1 Démarrage (`main`)

1. `disable_windows_throttling()` — empêche Windows de ralentir le process en
   arrière-plan (mode Efficacité), sinon le serveur devient très lent quand le
   navigateur a le focus.
2. Résolution des chemins :
   - **dev** : `BUNDLE = ROOT = dossier du script`.
   - **exe figé** (PyInstaller) : `BUNDLE = sys._MEIPASS` (ressources en lecture
     seule) ; `ROOT` = un `data/` inscriptible à côté de l'exe s'il existe
     (mode « portable »), sinon `%LOCALAPPDATA%\JB-SATRACK\`.
   - `WEB = BUNDLE/web`, `SEED = BUNDLE/data` (catalogue + TLE de secours,
     lecture seule), `DATA = ROOT/data` (persistant), `VENDOR = DATA/vendor`.
3. `seed_bundled_data()` — 1er lancement d'un exe installé : recopie `vendor/`
   et un cache TLE depuis le bundle vers `DATA` (utilisable hors ligne d'emblée).
4. Crée `station.json` (défauts) s'il manque.
5. Threads démons : `ensure_satjs`, `ensure_leaflet_js/css`, `ensure_fonts`
   (récupèrent les libs), et **`tle_worker`** (boucle infinie, ci-dessous).
6. `ThreadingHTTPServer` sur `--host` (déf. `0.0.0.0`) `--port` (déf. `8073`,
   ou `$PORT`). En mode exe : ouvre le navigateur, affiche « NE FERME PAS ».

### 2.2 Le worker de fond — `tle_worker`

Boucle : `refresh_tle()` → `refresh_iss_status()` → `refresh_weather()` →
`sleep(900)`. Chaque `refresh_*` ne fait un appel réseau que si son cache a
dépassé son `*_MAX_AGE` (TLE 1 h, ISS 1 h, météo 30 min), sinon retour immédiat.

### 2.3 Récupération des TLE — `refresh_tle`

C'est la partie la plus élaborée du serveur (voir [`DECISIONS.md`](DECISIONS.md),
entrée 2026-09-06).

- `TLE_SOURCES` (dans l'ordre) : **AMSAT nasabare**, **SatNOGS DB** (JSON),
  **R4UAB**, puis CelesTrak `amateur` + `stations`. CelesTrak est **sauté** tant
  que le cumul dépasse `TLE_MIN_OK` (50) — il est souvent injoignable depuis une
  box FAI.
- `_parse_tle_any(url, text)` : texte 3 lignes (`parse_tle`) **ou** JSON SatNOGS
  (`_parse_satnogs`). `TLE_UA` = User-Agent navigateur (certaines sources
  filtrent).
- **Fusion par fraîcheur** : `pool` indexé par NORAD ; pour chaque satellite on
  garde le TLE dont **l'époque (`_tle_epoch`) est la plus récente**, toutes
  sources confondues.
- Repli si `pool` vide : dernier `data/tle_cache.json` → fichier embarqué
  `data/tle_fallback.txt`.
- Succès → réécrit `data/tle_cache.json`
  `{fetched_at, sats:{nom:{name,l1,l2,norad}}, errors, stale}`.
- `_tle_response(cache)` : forme JSON commune à `/api/tle` et
  `/api/tle/refresh` (`fetched_at, age_s, count, stale, errors, sats`).
- `/api/tle` **ne bloque jamais** : sert le cache tel quel (marqué `stale` s'il
  a vieilli) et lance `_tle_refresh_async()` (un seul en vol) ; seul un cache
  totalement absent force une récupération synchrone.

### 2.4 Statut ISS — `refresh_iss_status`

`http_get(ISS_STATUS_URL)` (page ARISS) → `strip_html` → `parse_iss_status` :
détection par mots-clés du contexte (« repeater mode », « aprs », « sstv »,
« school ») → `{modes:{repeater,aprs,sstv,voice}, outages}`. Parsing volontairement
tolérant ; si la page change, l'onglet affiche « inconnu ».

### 2.5 Météo — `refresh_weather`

Open-Meteo `current` + `hourly` autour des `lat/lon` de la station. Renvoie
`now` (+ `wind`, `cloud`) et éventuellement `later` (pictogramme à +3 h si la
condition change). Table `WMO` : code OMM → (libellé, nom d'icône Reicon). Le
cache (30 min) est aussi considéré périmé si la station a bougé de >~0,1°.

### 2.5b Géocodage inverse — `reverse_geocode`

`GET /api/reverse?lat=&lon=` → Nominatim (OpenStreetMap), `urllib` standard.
Pour le bouton « Me localiser » : coordonnées de l'appareil → nom de commune.
Sans cache, appelé sur clic. `{"city": "..."}` ou `{"city": null}` sur toute
erreur (jamais `500`). Bornes invalides → `400`.

### 2.6 Libs vendorisées

`ensure_satjs` / `_ensure_vendor_file` (Leaflet js+css) / `ensure_fonts` /
`ensure_icon` : téléchargent une fois (URLs de repli), vérifient un marqueur,
écrivent dans `DATA/vendor/`. `ensure_fonts` récupère la feuille Google Fonts,
télécharge les woff2 latin/latin-ext, réécrit les `src:` vers `/vendor/font/…`.
`ensure_icon(name)` extrait le tracé *Filled* du module npm `reicon`
(`REICON_VERSION` épinglée) → `DATA/vendor/icons/<Nom>.svg`.

### 2.7 `Handler` (HTTP) & journal

`BaseHTTPRequestHandler`. `send()` (JSON/texte + `Cache-Control: no-store`),
`serve_file()`, `body_json()`. Détail des routes : [`API.md`](API.md). L'export
ADIF est `adif(qsos, station)` (`PROP_MODE:SAT`).

### 2.8 `selftest()` (serveur)

`python app.py --selftest` : vérifie **`deep_merge`** (fusion partielle de
`station.json` sans perte de clés voisines) et **`_tle_epoch` / la fusion par
fraîcheur** (le TLE le plus récent gagne). Ce sont les logiques qui **échouent
en silence** — une clé qui disparaît, une position fausse — pas une exception.

---

## 3. L'interface — `web/`

`index.html` charge, dans l'ordre : `/vendor/fonts.css`, `/vendor/leaflet.css`,
`style.css` ; un script inline pose le thème avant le 1er rendu ; puis
`/vendor/satellite.min.js`, `/vendor/leaflet.js`, `icons.js`, `app.js`.

### 3.1 `app.js` — plan

| Bloc | Fonctions clés | Rôle |
|---|---|---|
| Propagation | `stateAt`, `elevationAt`, `rangeRate` | SGP4 → lat/lon/alt/az/el/range/vitesse ; taux de variation de distance (Doppler) |
| Prédiction | `findPasses`, `refine`, `crossEl`, `quality` | passages sur N heures ; `workStart/workEnd` = franchissements de `min_elevation_deg` (**fenêtre exploitable**) ; note omni (Zénith / rasant) |
| Doppler | `dopplerPlan`, `rxTune/txTune`, `exportChirp`, `chirpRows` | plan de tuning par paliers de `tuning_step_khz` ; export CHIRP |
| Rendu | `renderHeader`, `renderTleChip`/`tleAge`, `renderPassTable`, `selectPass`, `renderNextPass`, `renderPlan`, `renderOrient`, `renderMemo` | l'affichage ; `renderOrient` a 4 états : avant / se lève / exploitable / redescend |
| Carte | `MAP` (IIFE) | Leaflet + tuiles Esri, trace au sol, empreinte radio (≥ minEl), terminateur jour/nuit, liaison station↔sat, suivi (centrage amorti), molette réécrite, météo ; `setStation()` = redéplace la maison + recentre après un changement de position |
| Boucle | `tickClock` (1 s), `boot` | horloge, compte à rebours (fenêtre utile), `checkAlerts` ; boot = `Promise.all` station+catalogue+TLE puis intervalles |
| Données | `matchTle` (**NORAD d'abord**), `computeAll`, `reloadTle`, `netReason`, `loadWeather`, `loadIssStatus`, `applyIssOverrides` | `computeAll` = cœur : pour chaque sat du catalogue → `matchTle` → `twoline2satrec` → `findPasses` ; trie, `selectPass` |
| ISS | `applyIssOverrides` | applique le statut ARISS aux modes du catalogue ; **phonie (fm voix) en tête**, APRS/SSTV en dessous |
| Az/El | `drawPolar` | vue polaire, cône de silence |
| Journal | `saveQso` | `POST /api/qso` |
| Config | `locatorToLatLon` / `latLonToLocator`, `openSetup`/`closeSetup`/`saveSetup`, `locateFromDevice`, `wireSetupModal` | formulaire station (bouton Réglages) ; **pas de modale bloquante au 1er lancement** ; « Me localiser » = géoloc navigateur → locator + ville (`/api/reverse`) + fuseau ; `saveSetup` applique tout (header, `computeAll`, `MAP.setStation`, météo) |
| Interface | `applyTheme`, `selectTab`/`wireTabs` | thème clair/sombre mémorisé, onglets ARIA |
| Alerte | `ALERTS`, `dueAlerts`, `checkAlerts`, `notifyPass`, `toggleAlerts`, `confirmAlerts` | annonce sur **3 canaux** (pastille `toast`, son, `Notification`) ; seuils dans `station.alert` |
| Son | `SFX`, `SND`, `clickSound`, `toggleSound` | Web Audio synthétisé, aucun fichier. `SND` = seul endroit où des fréquences sont écrites. Répartiteur de clics en phase **CAPTURE** (le son annonce ce que le clic *va* faire) |
| Toast | `toast`, `swipeAway` | pastille dans la page, glisser pour écarter |
| Vérif | `selfTest` | `/?selftest=1` |

### 3.2 État global `S`

`{ station, catalog, tle, tleInfo, tleError, tracked, passes, selectedPass,
observer, plan, iss, weather, polarPath }`. `S.observer` = `{longitude,
latitude, height}` en radians/km pour satellite.js.

### 3.3 `selfTest()` (client) — `/?selftest=1`

20+ contrôles, résultat dans la console. Couvre la **logique qui échoue en
silence** : fenêtre d'alerte + seuils + dédoublonnage (`dueAlerts`), format
CHIRP (colonnes, split, CTCSS, échappement CSV), coupure du son + répartiteur en
capture, **`matchTle` (NORAD prime sur le nom)**, **`crossEl` (franchissements
du seuil exploitable)**. Toute logique de cette catégorie mérite une ligne de
plus dans `selfTest()`, pas une suite de tests.

### 3.4 `starfield.js` / `icons.js`

- `starfield.js` : fond étoilé animé (canvas), purement décoratif.
- `icons.js` : objet global `Icons`. `data-ic="Nom"` en HTML statique,
  `Icons.html('Nom', {size})` en JS ; un `MutationObserver` remplit le `<svg>`
  dès qu'il arrive de `/vendor/icon/<Nom>.svg`. `MANIFEST` = préchargement.
  Style monochrome via `currentColor`.

---

## 4. Flux de données (au chargement)

1. `boot()` → `Promise.all` : `GET /api/station`, `/api/satellites`, `/api/tle`.
2. `S.observer` calculé ; `renderHeader()`.
3. `computeAll()` : SGP4 sur les 9 sats du catalogue → `S.passes` → `selectPass`.
4. `MAP.build()` ; `loadIssStatus()` (→ `applyIssOverrides` → recalcule si
   l'ordre des modes ISS change) ; `loadWeather()`.
5. Intervalles : `tickClock` 1 s ; `MAP.draw`+`drawPolar` 1 s ; `computeAll`
   15 min ; `loadIssStatus`/`loadWeather` 30 min ; `reloadTle` 30 min. Au
   démarrage, si les TLE servis sont `stale`, `reloadTle` est rappelé toutes les
   7 s (10 fois) pour rattraper le refresh de fond.

---

## 5. Empaquetage & CI

`packaging/` : `build.py` (icône → PyInstaller **onedir** → `--zip` → `--installer`),
`jb-satrack.spec`, `installer.iss` (Inno Setup, install par utilisateur),
`make_icon.py` (icône `.ico`, stdlib). CI `.github/workflows/build.yml` : à chaque
tag `v*`, un runner Windows construit portable + installeur et les joint à la
Release. Détail : [`packaging/README.md`](../packaging/README.md),
[`OPERATIONS.md`](OPERATIONS.md).

---

## 6. Arborescence

```
app.py                 serveur (stdlib)
web/  index.html style.css app.js icons.js starfield.js
data/ satellites.json      catalogue fréquences (livré, lecture seule via SEED)
      tle_fallback.txt     TLE de dernier recours (livré)
      station.json         config station (versionnée ; réécrite par l'appli)
      qso.json  *caches*    runtime, non versionnés (.gitignore)
      vendor/              libs téléchargées, non versionné
docs/ ARCHITECTURE.md API.md DONNEES.md OPERATIONS.md
      ETAT.md DECISIONS.md JOURNAL.md TODO.md README.md
packaging/  build.py jb-satrack.spec installer.iss make_icon.py icon.ico README.md
.github/workflows/build.yml
tests/  fake-satellite.js sample-tle.txt   (fixtures d'appoint)
prototypes/  maquettes HTML de la direction visuelle
README.md CLAUDE.md DESIGN.md PRODUIT.md CHANGELOG.md MODIFICATIONS.md LICENSE
Lancer JB-SATRACK.bat  Dockerfile  docker-compose.yml
```
