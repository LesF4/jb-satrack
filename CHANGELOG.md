# Journal des versions

Format : le plus récent en haut. Les binaires sont dans les
[Releases](https://github.com/F4MAJ/jb-satrack/releases) (dépôt privé).

## v2.0.2 — 2026-09-06

- **Bandeau et compte à rebours calés sur la fenêtre exploitable** (≥
  `min_elevation_deg`), plus sur l'horizon géométrique : nouvel état « X se lève
  sur ton horizon — exploitable dans … », et l'« écoute maintenant » apparaît en
  même temps que l'empreinte radio et la liaison sur la carte.
- **ISS : phonie en mode principal** — répéteur FM voix cross-band
  (145.990 ↑ / 437.800 ↓, CTCSS 67) à la place de l'APRS. APRS/SSTV restent dans
  l'onglet « Radio de l'ISS ».
- Documentation à jour (`docs/`, README) ; dépôt consolidé en un dossier unique.

## v2.0.1 — 2026-09-06

- Pied de page : **© 2026 F4MAJ — Tous droits réservés** ; ajout d'un `LICENSE`
  (logiciel privé). Ligne des sources corrigée (TLE AMSAT / SatNOGS / R4UAB).
- **Interface pleine largeur** sur les grands écrans (`.page` n'est plus
  plafonnée à 1560 px — le contenu occupait la moitié de l'écran au-delà).
- Nettoyage : suppression d'anciens artefacts de build à la racine
  (`JB-SATRACK.spec` racine, `build/`, `dist/`) désormais remplacés par
  `packaging/`.

## v2.0.0 — 2026-09-06

Grosse mise à niveau. Détails dans [`MODIFICATIONS.md`](MODIFICATIONS.md).

- **Mise à jour TLE fiabilisée** : plus de dépendance à CelesTrak (injoignable
  depuis une box FAI). Sources multiples fusionnées — **AMSAT + SatNOGS +
  R4UAB** — en gardant pour chaque satellite l'orbite la plus récente. ~1600
  satellites, **ISS incluse**.
- **Fix ISS** : identification des satellites par numéro NORAD d'abord (le nom
  attrapait SWISSCUBE / AISSAT au lieu de la station spatiale).
- Bouton **Rafraîchir** : retélécharge et réécrit réellement le cache, relance
  SGP4 ; succès/échec visibles ; âge des TLE en temps réel dans la pastille.
- `/api/tle` ne bloque plus le chargement de la page.
- Plus de fenêtre de configuration bloquante au 1er lancement (rappel non
  bloquant, config via le bouton Réglages).
- **Empaquetage Windows** : `packaging/` — `build.py` produit le dossier
  applicatif, `--zip` le portable, `--installer` l'installeur Inno Setup.
  Exe figé : données dans `%LOCALAPPDATA%\JB-SATRACK\`, amorçage hors ligne.
- **CI** : build automatique (portable + installeur) à chaque tag `v*`.

## v1.0.0 — branche `v1`

État du dépôt avant la refonte de septembre 2026. Conservé sur la branche `v1`.
Pas de binaire (l'empaquetage n'existait pas encore).
