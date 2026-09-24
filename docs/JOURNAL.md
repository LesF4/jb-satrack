# Journal — JB-SATRACK

Entrée la plus récente en haut. Format : voir `D:\ClaudeProjets\_PROJETS\CONVENTION.md`.

<!-- Ajouter la nouvelle entrée juste au-dessus de cette ligne -->

## 2026-09-24 (suite) — Passage en cours invisible ; LOS 30 s trop tôt

**Contexte**
- JB compare l'horloge et JB-SATRACK à 15:25 : l'horloge suit SO-50 (qui finissait) et
  IO-117, JB-SATRACK dit « Rien au-dessus de toi » alors qu'IO-117 est à 8°.

**Cause**
- `findPasses` ne détecte que les levers (élévation qui passe de ≤ 0 à > 0) : un
  satellite déjà levé au moment du calcul (ouverture de la page, recalcul) était ignoré
  jusqu'à son passage suivant. L'horloge remontait déjà au lever (30 min max).
- En passant : `refine` supposait toujours un lever ; au coucher il renvoyait le début
  de l'intervalle → LOS jusqu'à 30 s trop tôt. Même défaut dans l'horloge.

**Fait**
- Retour au lever (3 h max) dans `findPasses` ; bissection correcte dans les deux sens.
  Autotest client 25/25 (nouveau cas « passage en cours »). Vérifié sur la vraie page :
  « IO-117 est exploitable en ce moment », en tête de liste.
- Horloge : même bissection, retour au lever porté de 30 min à 3 h (IO-117 dure ~46 min),
  autotest ajouté, déployé.

**Prochaines étapes**
- Kiosque JB-SERVER : même défaut → prompt ChatGPT `PROMPT_CHATGPT_KIOSQUE_20260924c.md`.

## 2026-09-24 (suite) — ISS disparue : orbite de 2023 dans le cache TLE

**Contexte**
- JB : l'horloge annonce l'ISS à 14:51, JB-SATRACK n'a plus aucun passage ISS. « Je ne
  sais pas qui est juste. » Même station (47,7708 / 7,375, JN37QS) et même seuil des deux côtés.

**Cause**
- `tle_cache.json` : « ISS (ZARYA) » avec NORAD **99207** et une orbite du **06/01/2023**.
  SatNOGS publie une vieille fiche ISS sous un numéro provisoire ; `_parse_satnogs` croyait
  `norad_cat_id`, et `merged` était indexé **par nom** : la vieille fiche a écrasé la vraie.
  La page (recherche par NORAD 25544, puis par nom) tombait sur l'orbite de 2023.
  L'horloge (NORAD lu dans la ligne 1) avait raison.

**Fait**
- NORAD toujours lu dans la ligne 1 ; à nom + NORAD égaux, la fiche la plus récente gagne ;
  homonymes conservés sous « nom [NORAD] » au lieu de s'écraser. Autotest reproduisant le cas.
- Cache réécrit avec le code corrigé : ISS 25544, époque 26267.14.

**Prochaines étapes**
- JB relance JB-SATRACK (l'ancien code recasserait le cache au rafraîchissement horaire).
- Kiosque JB-SERVER : même défaut → mise à jour via ChatGPT.

**Clôture (15:18)**
- JB relancé : l'ISS réapparaît dans JB-SATRACK sur le PC.
- Kiosque passé à `550ec88` par ChatGPT (`PROMPT_CHATGPT_KIOSQUE_20260924b.md`) : selftest OK,
  ISS NORAD 25544 époque 26267, orbite 2023 absente, 4 passages ISS dans le rendu Chromium.
  Retour arrière : `releases/bd83cb0` ; sauvegarde `…/jbsatrack-kiosk-20260924-pre-550ec88`.
  Doc kiosque `d7a5c3c` (ChatGPT, poussée par Claude).


## 2026-09-24 (suite) — AO-91 : fréquences inversées et CTCSS périmé

**Fait**
- `satellites.json` : AO-91 avait **montée et descente inversées** (145,960 ↑ / 435,250 ↓)
  et un CTCSS 67 Hz. AMSAT (page AO-91, 2026) : **montée 435,250, descente 145,960, sans
  tonalité** (répéteur déclenché par porteuse, batterie fatiguée). Corrigé.
- Contrôle croisé de toutes les entrées manuelles avec SatNOGS : seule AO-91 était fausse.
- Vérifié : la colonne « Élév. max » est juste (ISS 14:51 = 19,8° dans l'appli, comme le
  calcul indépendant de JB-PIXBAR) ; le « 28° » venait d'une mauvaise lecture d'une capture.


## 2026-09-24 — Catalogue automatique (31 satellites trafiquables) + lanceur Firefox

**Contexte**
- En branchant l'horloge Ulanzi (projet JB-PIXBAR) sur les passages, JB constate que
  JB-SATRACK ne suit que 9 satellites figés à la main (AO-123 absent) et veut
  « la liste des satellites radioamateurs, + ISS, dans l'horloge et dans JB-SATRACK ».

**Fait**
- `satcatalog.py` (stdlib) : statut AMSAT → catégories trafiquables (FM, linéaire,
  digipeater ; pas balises/télémétrie/SSTV/musique ni QO-100) → NORAD (TLE AMSAT, sinon
  SatNOGS) → fréquences SatNOGS (montée ET descente sur bande radioamateur). Entrées de
  `satellites.json` prioritaires et toujours présentes. Cache `data/catalog_auto.json`,
  reconstruit chaque jour en tâche de fond (`catalog_worker`) ; `/api/satellites` ne
  touche jamais le réseau et retire une entrée auto sans TLE.
- `data/satellites.json` : AO-123 ajouté à la main (145,850 / 435,400, CTCSS 67 Hz).
- Vérifié sur une instance de test (port 8099) : autotest navigateur 24/24, 314
  passages / 48 h, aucun « TLE absents ». JB a relancé son instance : 31 satellites.
- `Lancer JB-SATRACK.bat` : onglet Firefox (`-new-tab`), à côté de Py-APRS ; ne relance
  pas le serveur s'il tourne déjà.
- PRODUIT.md §2 révisé (la décision d'origine est conservée), CHANGELOG « Non publié »,
  CLAUDE.md (module partagé avec l'horloge).
- Commit sur la branche `catalogue-auto` (issue de `packaging-linux`), puis **reporté seul
  dans `master` le 2026-09-24** (cherry-pick : le travail `packaging-linux`, jamais testé en
  CI, reste sur sa branche).

**Décisions** (→ DECISIONS.md)
- Catalogue automatique des trafiquables + ISS (révise PRODUIT.md §2).

**Prochaines étapes** (→ TODO.md)
- Vérifier le CTCSS d'AO-91 (catalogue : 67 Hz ; SatNOGS : « plus de CTCSS » depuis 06/2026).
- Colonne « Élév. max » parfois fausse dans la liste (ISS 14:51 : 28° affichés, qualité
  « Basse » cohérente avec 20° ; RS-44 : 18° pour « Rasant »).

## 2026-09-11 — Kiosque HDMI autonome sur JB-SERVER

**Fait** (accord de JB)
- Instance Linux séparée sur l'écran HDMI, Cage + Chromium sur `tty7`, avec
  lancement et arrêt manuels par SSH depuis Windows.
- Serveur limité à `127.0.0.1:8073`, compte sans privilège et limites CPU/RAM.
- Station vérifiée : F4MAJ, JN37QS, Illzach, Europe/Paris.
- 1 602 TLE au test, rafraîchis au lancement puis chaque heure.
- Rendu complet vérifié ; compteur orange seulement pendant la fenêtre utile.
- Sauvegarde et rollback documentés. Aucun démarrage automatique ni jeton
  GitHub installé sur le serveur.

Référence : [`JB_SERVER_KIOSK.md`](JB_SERVER_KIOSK.md).

## 2026-09-08 (ménage) — Suppression des Releases périmées v2.0.0 → v2.0.2

**Fait** (accord de JB, périmètre choisi explicitement)
- Supprimé les **Releases GitHub `v2.0.0`, `v2.0.1`, `v2.0.2`** et leurs **tags**
  (distants + locaux) : périmées, 0 téléchargement externe.
  `gh release delete <v> --cleanup-tag` + `git tag -d`.
- **Conservé** : tags `v1.0.0`, `v2.0.3`, `v2.0.4` ; branche `v1` (référence
  documentée) ; l'historique texte de `CHANGELOG.md` (toutes les versions).
- État après : Releases = `v2.0.3` + `v2.0.4` (Latest). Tags = `v1.0.0`,
  `v2.0.3`, `v2.0.4`. Branches = `master`, `v1`.
- `CHANGELOG.md` : note ajoutée (binaires disponibles à partir de v2.0.3).

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

**Publié**
- Commit `5c6364d` sur `master`. Tag **`v2.0.4`** → CI `Build Windows` (1 min 20 s)
  → **Release `v2.0.4`** :
  - `JB-SATRACK-portable.zip` (9,33 Mo) — contient `JB-SATRACK/PREMIER-DEMARRAGE.txt`
    à la racine, à côté de l'exe.
  - `JB-SATRACK-Setup-2.0.4.exe` (9,01 Mo) — l'installeur compile sans erreur
    avec `LicenseFile` (licence F4MAJ affichée avant install).
  Deux fichiers transmis à JB.

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
