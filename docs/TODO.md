# TODO — JB-SATRACK

## En cours
- [ ] Rien en cours.

## À faire
- [ ] **Sous-menu APRS / SSTV / données** pour l'ISS (aujourd'hui seule la phonie
      est mise en avant ; APRS reste dans l'onglet « Radio de l'ISS »).
- [ ] Étendre le catalogue de fréquences au-delà des satellites principaux.
- [ ] Robustifier le parsing ARISS (fallback propre si la mise en page change).

## Idées / plus tard
- [ ] Doppler automatique : poste avec CAT (IC-9700 / FT-991A) ou clé RTL-SDR sur
      JB-SERVER (correction auto + enregistrement/décodage).
- [ ] Signature de l'exécutable / installeur (certificat code-signing) pour
      éviter l'avertissement SmartScreen.
- [ ] Builds macOS / Linux (PyInstaller + notarisation Apple / AppImage).
- [ ] Coque **Tauri** ou **pywebview** si un vrai ressenti d'app (fenêtre native,
      tray) devient souhaitable — le code web ne bouge pas.

## Fait (archive)
- [x] 2026-09-06 — Refonte interface + fiabilisation TLE (AMSAT/SatNOGS/R4UAB) +
      fix ISS (NORAD) + config non bloquante + empaquetage Windows + CI +
      Releases + versionnage (tags `v*`) + consolidation en un dossier unique.
- [x] 2026-09-05 — Mise en place de `docs/` (JOURNAL, DECISIONS, TODO, ETAT).
