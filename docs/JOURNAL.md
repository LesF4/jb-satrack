# Journal — JB-SATRACK

Entrée la plus récente en haut. Format : voir `D:\ClaudeProjets\_PROJETS\CONVENTION.md`.

<!-- Ajouter la nouvelle entrée juste au-dessus de cette ligne -->

## 2026-09-08 (suite) — Guide de premier démarrage + copyright (v2.0.4)

**Contexte**
- Les OM à qui JB enverra le `.zip` / l'installeur ne connaissent pas le projet :
  il leur faut un mode d'emploi court, et la station par défaut (F4MAJ / JN37QS)
  doit être remplacée par la leur.
- JB : « n'oublie pas qu'on copyright ce logiciel F4MAJ ».

**Fait**
- `packaging/PREMIER-DEMARRAGE.txt` (UTF-8 BOM + CRLF) : lancer → Réglages →
  indicatif → « Me localiser » (ou locator) → Enregistrer, + SmartScreen,
  `%LOCALAPPDATA%`, hors ligne.
- `packaging/build.py` : copie ce fichier à la racine du dossier applicatif
  après PyInstaller → présent dans le `.zip` **et** l'installeur.
- `packaging/installer.iss` : `LicenseFile=..\LICENSE` (licence F4MAJ à accepter
  avant install), `AppCopyright` + `VersionInfoCompany/Copyright` (propriétés de
  l'exe), raccourci menu Démarrer « Premier démarrage (à lire) », case décochée
  « Lire le guide » en fin d'install. Version 2.0.4.
- `app.py` : ligne de copyright en tête ; coquille `873` → `8073` corrigée.
- Copyright déjà en place par ailleurs (rappel) : `LICENSE` (logiciel privé,
  tous droits réservés, composants tiers listés), pied de page de l'appli,
  `AppPublisher F4MAJ` de l'installeur.
- Aucun code applicatif touché. `--selftest` OK, selftest client 24/24.

**À faire**
- Pousser le tag `v2.0.4` (→ CI → binaires) après validation de JB.

## 2026-09-08 — « Me localiser » + la maison bouge enfin sur la carte (v2.0.3)

**Contexte**
- Reprise depuis le MacBook Pro. Demande de JB : garder la saisie manuelle du
  locator (elle sert à regarder les passages ailleurs), mais ajouter un bouton
  « position de cet ordinateur » pour les déplacements.
- En creusant : après un changement de position, `computeAll()` recalculait bien
  tout, mais le marqueur maison de la carte ne bougeait pas (posé une fois dans
  `build()`, jamais redéplacé) et la vue ne se recentrait pas.

**Fait**
- **Bouton « Me localiser »** sous le champ Locator (modale Réglages).
  `locateFromDevice()` : `navigator.geolocation` sur clic (permission
  impossible hors geste). Remplit locator (`latLonToLocator()`, nouvel inverse de
  `locatorToLatLon()`), fuseau (`Intl`), et ville via géocodage inverse.
- **`GET /api/reverse`** (`app.py`) : Nominatim / OpenStreetMap, `urllib`
  standard, jamais bloquant (`{"city": null}` sur toute erreur).
- **`MAP.setStation()`** : déplace la maison, rafraîchit l'étiquette, recentre la
  carte. Appelé par `saveSetup()` après `computeAll()` (calculs prioritaires,
  carte isolée dans un `try`). `loadWeather()` enchaîné.
- Coordonnées **exactes** de l'appareil enregistrées tant que le locator n'est
  pas retapé (`deviceFix`), sinon centre de la case.
- `refresh_weather()` re-télécharge si la station a bougé de >~10 km.
- Icône Reicon **Crosshairs** ajoutée au `MANIFEST`.
- Selftest client : 21 → **24/24** (aller-retour locator, bornes, hook carte).
  `python app.py --selftest` : OK.

**Vérifié** (navigateur intégré + Opera)
- Géoloc simulée Illzach → locator JN37RR, ville « Rixheim » (OSM), fuseau.
- Enregistrement → maison déplacée sur Mulhouse/Rixheim, carte recentrée,
  passages recalculés (RS-44), météo suivie, suivi satellite suspendu.
- Refus de géoloc → message clair, aucun champ modifié.

**Décidé** — voir `DECISIONS.md` (entrée 2026-09-08).

**Publié**
- Commit `1c23223` sur `master`. Tag **`v2.0.3`** poussé → CI GitHub Actions
  (`Build Windows`, 1 min 10 s) → **Release `v2.0.3`** avec les deux binaires :
  - `JB-SATRACK-portable.zip` (9,33 Mo) — SHA-256 `76891d9b…ce9459`
  - `JB-SATRACK-Setup-2.0.3.exe` (9,01 Mo) — SHA-256 `f456f295…7348c`
  Vérifié : le code du soir (`latLonToLocator`, `locateFromDevice`,
  `MAP.setStation`, icône `Crosshairs`) est bien dans le bundle.
- Sur le MacBook, pas de binaire : `python3 app.py` depuis les sources (aucune
  dépendance). Un build macOS reste dans `TODO.md` (« Idées / plus tard »).

**Note**
- `data/station.json` avait été écrit en `JN19KK` pendant un test de JB dans
  Opera (géoloc + Enregistrer). Remis à la valeur versionnée (`JN37QS` / Illzach)
  avant le commit — le fichier est versionné, il porte la config F4MAJ.
- L'identité Git du dépôt était `Ton Nom` ; commit fait avec `user.name=F4MAJ`
  (repo-local) pour rester cohérent avec l'historique.

## 2026-09-06 (soir) — Documentation complète du projet

**Fait**
- `docs/ARCHITECTURE.md` : carte technique complète (serveur, interface, flux de
  données, algorithmes, arborescence).
- `docs/API.md` : toutes les routes HTTP (requête / réponse / comportement).
- `docs/DONNEES.md` : chaque fichier de `data/`, schéma, format du catalogue
  `satellites.json` + comment ajouter un satellite.
- `docs/OPERATIONS.md` : lancer, mettre à jour, diagnostiquer (tableau de
  symptômes), construire l'exe, publier une version.
- `docs/README.md` : index de toute la doc. Lien ajouté depuis `README.md`.

## 2026-09-06 — Refonte, fiabilisation TLE, empaquetage, consolidation

**Contexte**
- Reprise du projet après une refonte visuelle/organisation non committée.
- Constat majeur : la mise à jour TLE ne fonctionnait plus (CelesTrak injoignable
  depuis la connexion de la station).

**Fait**
- **TLE multi-sources** : AMSAT nasabare + SatNOGS DB + R4UAB, fusionnés en
  gardant l'orbite la plus récente par NORAD. CelesTrak en dernier recours.
  ~1600 satellites, ISS incluse.
- **Fix ISS** : `matchTle` identifie par numéro NORAD d'abord (le nom en
  sous-chaîne attrapait SWISSCUBE/AISSAT au lieu de la station).
- **Bandeau / compte à rebours** calés sur la fenêtre exploitable (≥ minEl), plus
  sur l'horizon géométrique — l'« écoute maintenant » ne s'affichait pas au bon
  moment par rapport à l'empreinte de la carte.
- **ISS : phonie en tête** (répéteur FM voix 145.990/437.800), APRS en dessous.
- **`/api/tle` non bloquant** ; **plus de fenêtre de config bloquante** au 1er
  lancement (rappel non bloquant + bouton Réglages).
- **Empaquetage Windows** : `packaging/` (PyInstaller onedir + Inno Setup),
  `build.py --zip --installer`. Exe figé : données dans `%LOCALAPPDATA%`.
- **CI** GitHub Actions : build portable + installeur à chaque tag `v*`.
- **Versionnage** : `v1` (ancienne version, branche `v1`), `v2.0.0` → `v2.0.2`
  (Releases avec zip + installeur).
- **Copyright** : « © 2026 F4MAJ — Tous droits réservés » (pied de page + LICENSE).
- **Interface pleine largeur** sur les grands écrans.
- **Consolidation** : un seul dossier `D:\ClaudeProjets\jb-satrack` ; suppression
  de l'ancienne copie, du dossier `newapp\`, des archives `.zip` parasites, des
  artefacts de build.
- `docs/` déplacé dans le dépôt et mis à jour.

**Décisions** — voir `DECISIONS.md` (entrées 2026-09-06).

**Prochaines étapes** — voir `TODO.md`.

## 2026-09-05 — Mise en place de la documentation de suivi

**Contexte**
- JB fixe une règle impérative : documenter en local sur `D:`, projet par projet, toute activité menée avec Claude.

**Fait**
- Création de l'index central `D:\ClaudeProjets\_PROJETS\` (`INDEX.md`, `CONVENTION.md`, gabarits `_MODELE\`).
- Création de `D:\ClaudeProjets\jb-satrack\docs\` : `JOURNAL.md`, `DECISIONS.md`, `TODO.md`, `ETAT.md`.
- `ETAT.md` et `DECISIONS.md` initialisés à partir de `README.md` et `CLAUDE.md` existants (décisions marquées « rétro »).
- Fiche centrale `D:\ClaudeProjets\_PROJETS\jb-satrack\FICHE.md`.

**Décisions**
- Structure de doc : voir `_PROJETS\CONVENTION.md` (index central + `docs\` par projet, jeu complet de 5 fichiers).

**Prochaines étapes**
- Committer `docs/` dans `F4MAJ/jb-satrack`.
- Choisir un schéma de versionnage.

**Note**
- Aucune modification du code ni du dépôt Git cette session (uniquement lecture de `README.md` / `CLAUDE.md`).

---

## 2026-09-05 (antérieur) — Audit accès Git / GitHub du poste

Relevé de l'état Git/GitHub demandé par JB, sans modification.
Documenté séparément : `D:\ClaudeProjets\_PROJETS\audit-comptes-git-github\`.
Point utile pour ce projet : le dépôt `F4MAJ/jb-satrack` est **privé**, compte `gh` actif = **F4MAJ**, et **aucune identité Git** (`user.name`/`user.email`) n'est configurée sur le poste.
