# Journal — JB-SATRACK

Entrée la plus récente en haut. Format : voir `D:\ClaudeProjets\_PROJETS\CONVENTION.md`.

<!-- Ajouter la nouvelle entrée juste au-dessus de cette ligne -->

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
