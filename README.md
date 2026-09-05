# JB-SATRACK

Suivi des satellites radioamateur et de l'ISS pour la station **F4MAJ** — locator **JN37QS** (Illzach).
Conçu pour tourner en permanence sur JB-SERVER et se consulter depuis n'importe quel navigateur.

Pensé pour une **antenne omnidirectionnelle fixe à 9 m** (pas de rotor) et un **Yaesu FTM-500D + Digirig**.

---

## Ce que ça fait

- **Carte du monde temps réel** sur un vrai fond de carte (tuiles OpenStreetMap/Esri, panoramique et zoom à la souris) : position du satellite, trace au sol (une orbite avant / après), empreinte radio, zone de nuit, ligne station↔satellite quand il est en vue.
- **Aperçu météo à la station** : 1 pictogramme (conditions actuelles), 2 si un changement est prévu dans les prochaines heures — semi-transparent, à côté de la maison qui repère la station, sans surcharger la carte.
- **Lectures live** : distance, vitesse, altitude, latitude/longitude, azimut/élévation, visibilité.
- **Prédiction des passages sur 48 h** pour tous les satellites du catalogue, triés par heure, avec AOS/LOS, élévation maximale, durée et azimuts d'entrée/sortie.
- **Note de qualité adaptée à une omni verticale** : un passage rasant est marqué comme tel, et un passage qui culmine au-delà de 75° est signalé « Zénith » car une verticale a un **cône de silence** au-dessus de la tête — c'est le seul tracker qui te dira que le passage « parfait » à 88° est en fait moins bon que celui à 45°.
- **Trajectoire Az/El** (vue polaire) avec la zone de cône de silence matérialisée.
- **Doppler calculé en direct** : fréquences RX/TX corrigées, affichées à la 4ᵉ décimale.
- **Plan de tuning FTM-500D** : le passage est découpé en paliers de 5 kHz avec les horaires exacts, exportables en CSV pour préprogrammer les mémoires.
- **État radio de l'ISS relevé automatiquement** sur la page officielle ARISS toutes les heures : répéteur voix, APRS, SSTV, contacts scolaires, extinctions programmées. Tu sais avant le passage si la radio est en service — et **sur quelle fréquence APRS** (elle bascule entre 145.825 et 437.825 selon la radio utilisée à bord).
- **Journal de trafic** avec export ADIF.
- **TLE rafraîchis automatiquement toutes les heures** depuis CelesTrak, avec cache local et repli si le réseau tombe.

## Installation

### Docker (recommandé sur JB-SERVER)

```bash
git clone <url-de-ton-depot> jb-satrack
cd jb-satrack
docker compose up -d
```

Interface : `http://<ip-de-jb-server>:8073`

### Sans Docker

Python 3.8+ suffit, **aucune dépendance à installer** :

```bash
python3 app.py            # port 8073
python3 app.py --port 9000
```

Sous Windows, place le dossier sur **D:** (par exemple `D:\jb-satrack`) et lance `python app.py`.

### Exécutable Windows autonome (pour partager sans installer Python)

Un `.exe` unique, construit avec [PyInstaller](https://pyinstaller.org/), qui embarque Python et l'interface. Double-clic → le navigateur s'ouvre tout seul. Rien à installer.

```bash
pip install pyinstaller
pyinstaller --onefile --name JB-SATRACK --add-data "web;web" --add-data "data/satellites.json;data" --add-data "data/tle_fallback.txt;data" app.py
```

L'exécutable est généré dans `dist/JB-SATRACK.exe`. Il crée son propre dossier `data/` juste à côté de lui (station.json, journal QSO, caches) — déplaçable, chaque copie garde sa configuration.

Windows peut afficher un avertissement SmartScreen (« Éditeur inconnu ») au premier lancement car l'exécutable n'est pas signé numériquement : c'est normal pour un outil non commercial, cliquer sur **Plus d'infos → Exécuter quand même**.

## Configuration

Tout est dans `data/station.json`, créé au premier démarrage :

```json
{
  "callsign": "F4MAJ",
  "locator": "JN37QS",
  "lat": 47.7719, "lon": 7.3444, "alt_m": 240,
  "antenna": {"type": "omnidirectionnelle fixe", "height_m": 9, "rotor": false, "cone_of_silence_deg": 75},
  "rig": {"model": "Yaesu FTM-500D", "cat": false, "soundcard": "Digirig", "tuning_step_khz": 5},
  "min_elevation_deg": 5,
  "forecast_hours": 48
}
```

- `min_elevation_deg` : passages ignorés en dessous (5° par défaut ; monte à 10° si l'horizon est bouché).
- `cone_of_silence_deg` : seuil au-delà duquel un passage est signalé « Zénith ».
- `forecast_hours` : horizon de prédiction.

Le catalogue des satellites et leurs fréquences est dans `data/satellites.json` — facile à éditer pour ajouter un satellite ou corriger une fréquence.

## Méthode de travail avec le FTM-500D

Le FTM-500D **n'a pas de commande CAT** : son port USB sert à la programmation et, avec le Digirig, à l'audio + PTT. Le Doppler ne peut donc pas être corrigé automatiquement par le poste. La méthode retenue est celle des opérateurs FM :

1. Ouvre le passage dans l'interface, clique « Exporter les mémoires (CSV) ».
2. Charge les 5 canaux dans le poste (logiciel de programmation Yaesu).
3. Pendant le passage, l'interface surligne le palier courant : tu changes de mémoire au moment indiqué.

En bande basse (145 MHz) le Doppler est d'environ ±3 kHz, en 435 MHz d'environ ±10 kHz : c'est en UHF que le suivi compte vraiment.

**Pour un Doppler automatique**, deux voies : un poste avec CAT (IC-9700, FT-991A), ou une clé RTL-SDR branchée sur JB-SERVER pour la réception (le serveur corrige alors tout seul et peut enregistrer/décoder). Non implémenté pour l'instant.

## Précision

- Propagation **SGP4** via [satellite.js](https://github.com/shashwatak/satellite-js), la même famille d'algorithmes que Gpredict ou SatPC32. Le serveur télécharge la bibliothèque au premier lancement et la met en cache dans `data/vendor/`.
- Éléments orbitaux **CelesTrak** (groupes `amateur` et `stations`), rafraîchis toutes les heures. Un TLE de moins de 24 h donne une précision de l'ordre de la seconde sur les heures de passage.
- Les fréquences du catalogue sont vérifiées manuellement (sources AMSAT, F5SVP). Un satellite peut tomber en panne ou changer de mode : **vérifie [amsat.org/status](https://www.amsat.org/status/) avant un QSO important**. Le statut ISS, lui, est relevé automatiquement.
- Carte : imagerie satellite **Esri World Imagery** (fond + libellés/frontières) via [Leaflet](https://leafletjs.com/), mise en cache localement comme satellite.js. Aucune clé requise, mais nécessite Internet pour charger les tuiles (le reste de l'appli continue de fonctionner hors-ligne une fois la page chargée).
- Météo : [Open-Meteo](https://open-meteo.com/) (gratuit, sans clé), à la station uniquement, rafraîchie toutes les 30 min.
- Le calcul satellite se fait dans le navigateur : le serveur ne fait que servir les données.

## API

| Route | Rôle |
|---|---|
| `GET /api/station` · `POST /api/station` | configuration de la station |
| `GET /api/satellites` | catalogue fréquences/modes |
| `GET /api/tle` · `GET /api/tle/refresh` | éléments orbitaux (cache 1 h) |
| `GET /api/iss-status` · `/refresh` | état radio ISS (ARISS, cache 1 h) |
| `GET /api/weather` · `/refresh` | météo à la station, maintenant + prévision courte (cache 30 min) |
| `GET /api/qso` · `POST /api/qso` | journal de trafic |
| `GET /api/qso.adi` | export ADIF |
| `GET /api/health` | état du serveur |

Ces routes sont exploitables par **JB-AI** : par exemple interroger `/api/tle` et `/api/iss-status` pour annoncer vocalement le prochain passage exploitable.

## Structure

```
app.py                 serveur (bibliothèque standard Python uniquement)
data/satellites.json   catalogue fréquences — éditable
data/station.json      configuration station (créé au 1er lancement)
data/vendor/            satellite.js, leaflet.js/css mis en cache au 1er lancement
web/index.html         interface
web/app.js             calculs SGP4, passages, Doppler, carte Leaflet, météo
web/style.css          thème
tests/                 stub hors ligne pour tests d'interface
```

## Limites connues

- Pas de commande CAT du poste (limitation matérielle du FTM-500D).
- Le catalogue couvre les satellites principaux ; les TLE d'un satellite absent du groupe `amateur` CelesTrak ne seront pas trouvés (l'interface l'indique).
- L'analyse de la page ARISS repose sur son texte : si ARISS change la mise en page, le statut peut passer en « inconnu » — l'interface affiche alors le lien vers la page d'origine.

---

Station F4MAJ · JN37QS · Illzach

© 2026 F4MAJ & Claude IA (Anthropic) — création conjointe, tous droits réservés.
