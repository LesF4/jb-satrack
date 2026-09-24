# TODO — JB-SATRACK

## En cours
- [ ] Rien en cours.

## À faire
- [ ] Vérifier le CTCSS d'AO-91 (67 Hz au catalogue, SatNOGS : plus de CTCSS depuis 06/2026).
- [ ] Colonne « Élév. max » parfois fausse dans la liste des passages (ISS 28° vs qualité Basse).
- [ ] **Sous-menu APRS / SSTV / données** pour l'ISS (aujourd'hui seule la phonie
      est mise en avant ; APRS reste dans l'onglet « Radio de l'ISS »).
- [x] 2026-09-24 — Étendre le catalogue : automatique, 31 satellites trafiquables (`satcatalog.py`).
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
- [x] 2026-09-08 — Bouton « Me localiser » (position de l'ordinateur → locator +
      ville + fuseau, géocodage inverse OpenStreetMap) ; la maison se déplace
      enfin sur la carte après un changement de position (v2.0.3).
- [x] 2026-09-06 — Refonte interface + fiabilisation TLE (AMSAT/SatNOGS/R4UAB) +
      fix ISS (NORAD) + config non bloquante + empaquetage Windows + CI +
      Releases + versionnage (tags `v*`) + consolidation en un dossier unique.
- [x] 2026-09-05 — Mise en place de `docs/` (JOURNAL, DECISIONS, TODO, ETAT).
