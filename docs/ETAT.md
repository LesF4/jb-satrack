# État — JB-SATRACK

Dernière mise à jour : 2026-09-08

- **Statut** : actif. Version **v2.0.4** (tags Git `v*` + Releases GitHub).
- **Dépôt** : `F4MAJ/jb-satrack` (GitHub, **privé**). Branches : `master` (ligne
  principale) · `v1` (état figé d'avant la refonte de septembre 2026).
- **Chemin local** : `D:\ClaudeProjets\jb-satrack` (dossier unique — l'ancien
  `newapp\…` et les copies/zip parasites ont été supprimés le 2026-09-06).
- **Où ça tourne** : serveur web local, port **8073**. Prévu pour tourner en
  continu sur JB-SERVER, consultable depuis n'importe quel navigateur du réseau.

## Stack

- **Serveur** `app.py` : Python 3.8+, **bibliothèque standard uniquement**, zéro
  dépendance pip. Sert les fichiers, ~10 routes JSON, caches TLE/météo/ISS,
  export ADIF.
- **Interface** `web/` : JS **vanilla, sans build**. Libs tierces (satellite.js,
  Leaflet, polices, icônes Reicon) téléchargées une fois par le serveur, mises
  en cache dans `data/vendor/`, servies sur `/vendor/…`.
- **Données** : fichiers JSON à plat (`station.json`, `qso.json`, caches).

## Déploiement

- **Sources** : `python app.py` (port 8073, `--port` pour changer). Rien à
  installer.
- **Docker** : `docker compose up -d`.
- **Application Windows** : `python packaging/build.py` →
  `packaging/dist/JB-SATRACK/` (dossier onedir) ; `--zip` → portable à
  partager ; `--installer` → installeur Inno Setup. Voir
  [`packaging/README.md`](../packaging/README.md).
- **CI** : `.github/workflows/build.yml` — à chaque tag `v*`, un runner Windows
  construit portable + installeur et les attache à la Release.
- Exe figé : données persistantes dans `%LOCALAPPDATA%\JB-SATRACK\`, amorçage
  depuis le bundle au 1er lancement (utilisable hors ligne d'emblée).
- **`PREMIER-DEMARRAGE.txt`** livré à la racine du `.zip` / de l'installeur
  (raccourci menu Démarrer) : lancer, puis Réglages → indicatif → « Me
  localiser » → Enregistrer. L'installeur affiche `LICENSE` (copyright F4MAJ)
  avant l'installation.

## Sources de données (runtime)

| Donnée | Source(s) | Cache | Repli |
|---|---|---|---|
| TLE | **AMSAT nasabare + SatNOGS DB + R4UAB** fusionnés (l'orbite la plus récente par NORAD gagne) ; CelesTrak en dernier recours (souvent injoignable depuis une box FAI) | `data/tle_cache.json`, 1 h | dernier cache → `data/tle_fallback.txt` embarqué |
| Position / passages | calcul **SGP4** (satellite.js) dans le navigateur | — | — |
| Statut radio ISS | page ARISS (parsing texte) | `data/iss_status.json`, 1 h | statut « inconnu » + lien |
| Météo station | Open-Meteo | `data/weather_cache.json`, 30 min (aussi périmé si la station a bougé de >~10 km) | — |
| Nom de lieu (bouton « Me localiser ») | Nominatim / OpenStreetMap (`GET /api/reverse`, à la demande) | aucun | champ Ville laissé vide |
| Fond de carte | Esri World Imagery (tuiles) | tuiles navigateur | fond figé au zoom 3 |

## Ce qui marche

- Carte monde temps réel : position, trace au sol, **empreinte radio** (zone où
  le satellite est au-dessus de `min_elevation_deg`), zone de nuit, liaison
  station↔sat quand exploitable.
- Prédiction des passages sur 48 h, triés par heure. Le bandeau d'orientation et
  le compte à rebours sont calés sur la **fenêtre exploitable** (≥ `min_elevation_deg`),
  pas sur l'horizon géométrique : « se lève sur ton horizon » puis « exploitable
  en ce moment ».
- Note de qualité pour une omni verticale (« Zénith » = cône de silence,
  « Rasant »). Vue polaire Az/El avec la zone de silence.
- Doppler live RX/TX (4 décimales) + **plan de tuning FTM-500D** par paliers de
  5 kHz, export **CHIRP**.
- **ISS : phonie en tête** — répéteur FM voix cross-band (145.990 ↑ / 437.800 ↓,
  CTCSS 67) comme mode principal ; APRS et SSTV en dessous. Onglet « Radio de
  l'ISS » : tous les états relevés sur ARISS.
- Journal de trafic + export ADIF.
- Pastille TLE avec âge en temps réel ; « Rafraîchir » retélécharge réellement,
  succès/échec visibles.
- Interface pleine largeur sur les grands écrans.
- **Pas de fenêtre bloquante au 1er lancement** : rappel non bloquant, config via
  le bouton Réglages.
- **Bouton « Me localiser »** (Réglages) : prend la position de l'ordinateur,
  remplit locator + ville + fuseau. Utile en déplacement. La saisie manuelle du
  locator reste inchangée. À l'enregistrement, la maison se déplace sur la carte,
  la vue se recentre et tous les passages sont recalculés.
- Copyright : « © 2026 F4MAJ — Tous droits réservés » (pied de page, `LICENSE`).

## Limites connues

- **CAT** du FTM-500D absent (matériel) → Doppler suivi à la main par paliers.
- **IO-117 / GreenCube** : aucune source publique n'a de TLE récent (le plus
  frais date de ~15 mois). Orbite MEO ~5 800 km, très stable, donc un TLE ancien
  y reste utilisable — mais son statut opérationnel est incertain depuis la
  reprise par AMSAT Italia (2024).
- Catalogue de fréquences limité aux satellites principaux.
- Parsing ARISS fragile si la page change de mise en page (statut « inconnu »).
- Appli **non signée** → avertissement SmartScreen au 1er lancement (normal).

## Prochaine étape

Voir [`TODO.md`](TODO.md).
