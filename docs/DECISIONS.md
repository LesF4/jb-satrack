# Décisions — JB-SATRACK

> Les entrées marquées « (rétro) » sont reconstruites le 2026-09-05 à partir de
> `README.md` et `CLAUDE.md` : ce sont des choix déjà en place, pas des décisions
> prises ce jour-là.

## 2026-09-08 — « Me localiser » : géoloc navigateur + géocodage inverse serveur

- **Contexte** : le locator manuel convient (il sert aussi à regarder les
  passages depuis un autre carré), mais en déplacement JB ne connaît pas son
  locator ni sa ville exacts — l'ordinateur, lui, sait où il est.
- **Choix** :
  - Géolocalisation par `navigator.geolocation`, **sur clic uniquement** (la
    permission ne s'obtient pas hors geste — même contrainte que les
    notifications). Un bouton, pas un réglage de fichier.
  - La position arrive en lat/lon ; on la convertit en **locator**
    (`latLonToLocator`) et tout le pipeline existant (bandeau, carte, alertes)
    suit sans modification. Coordonnées exactes conservées à l'enregistrement
    tant que le locator n'est pas retapé (sinon centre de la case, ~3 km).
  - **Nom de commune** : géocodage inverse **côté serveur** via Nominatim
    (OpenStreetMap), `urllib` standard — cohérent avec les TLE et les icônes,
    plutôt qu'un appel tiers depuis le navigateur. Jamais bloquant : hors ligne
    ou sans correspondance → champ Ville **vidé**, jamais l'ancienne valeur.
  - Rien ne s'applique tant qu'on n'a pas cliqué **Enregistrer** : le formulaire
    reste un brouillon, pas d'aperçu live sur la carte.
- **Corrigé au passage** : `MAP.setStation()` déplace enfin le marqueur maison
  et recentre la carte après un changement de position (le marqueur était figé
  depuis `build()` ; seuls les calculs se rafraîchissaient).
- **Compromis accepté** : le géocodage inverse et la météo du nouveau lieu
  demandent Internet au moment du clic ; les coordonnées transitent par
  OpenStreetMap (service public, sans clé). Le locator, lui, se calcule hors
  ligne.

## 2026-09-06 — TLE : sources multiples fusionnées, plus CelesTrak seul

- **Contexte** : `celestrak.org` est totalement injoignable depuis la connexion
  de la station (blocage réseau, pas un 403). L'appli n'en dépendait que.
- **Choix** : `TLE_SOURCES` = **AMSAT nasabare + SatNOGS DB (JSON) + R4UAB**,
  toutes fusionnées ; pour chaque satellite (clé NORAD) on garde le TLE dont
  **l'époque est la plus récente** (`crossEl`/`_tle_epoch`). CelesTrak reste en
  repli, tenté seulement si les autres n'ont presque rien donné.
- **Raison** : couverture large + fraîcheur, sans point de défaillance unique.

## 2026-09-06 — Identification des satellites par NORAD d'abord

- **Contexte** : avec ~1600 TLE, `matchTle` cherchait par nom en sous-chaîne →
  « ISS » attrapait SWISSCUBE, AISSAT, ISS (NAUKA)… avant la vraie station.
- **Choix** : `matchTle` teste le **numéro NORAD** d'abord, le nom seulement en
  repli. `selfTest` le vérifie.

## 2026-09-06 — Bandeau calé sur la fenêtre EXPLOITABLE, pas l'horizon

- **Contexte** : « X passe au-dessus de toi, écoute sur… » s'affichait dès
  l'AOS géométrique (0°), ~5 min avant que le satellite soit dans l'empreinte
  radio de la carte.
- **Choix** : `findPasses` calcule `workStart`/`workEnd` (franchissements de
  `min_elevation_deg`). Le bandeau a 4 états (avant / se lève / exploitable /
  redescend) et le compte à rebours vise la fenêtre utile.

## 2026-09-06 — ISS : phonie en mode principal

- **Contexte** : l'ISS affichait l'APRS (données) comme mode principal.
- **Choix** : ordre des modes ISS = **répéteur FM voix** (145.990/437.800, PL 67)
  d'abord, puis voix simplex, puis APRS, puis SSTV. `applyIssOverrides` ne met
  en avant qu'un mode voix actif. APRS aura son propre sous-menu plus tard.

## 2026-09-06 — Pas de fenêtre de config bloquante au 1er lancement

- **Contexte** : la modale de configuration au démarrage a une histoire de
  blocages (dont l'exe qui ne pouvait pas écrire son `station.json` sous
  `Program Files`).
- **Choix** : au démarrage, l'appli tourne avec les valeurs par défaut + un
  rappel **non bloquant** ; la config se fait via le bouton Réglages (même
  formulaire, même enregistrement). Exe figé : données dans `%LOCALAPPDATA%`.

## 2026-09-06 — Empaquetage : PyInstaller onedir + Inno Setup, dépôt privé

- **Choix** : `packaging/` produit un dossier applicatif (onedir, pas onefile —
  démarrage immédiat, moins de faux positifs antivirus), un `.zip` portable et
  un installeur Inno Setup (installation par utilisateur, sans UAC). CI sur tag
  `v*`. Icône générée sans dépendance (`make_icon.py`, stdlib).
- **Distribution** : dépôt **privé**, Releases privées. F4MAJ récupère le zip et
  le transmet manuellement — pas de dépôt public.

## 2026-09-05 (rétro) — Serveur = bibliothèque standard Python uniquement

- **Contexte** : outil qui doit tourner longtemps sur JB-SERVER et se partager en `.exe`.
- **Choix** : `app.py` n'utilise **aucune** dépendance pip.
- **Raison** : zéro installation, build PyInstaller trivial, pas de venv à maintenir.
- **Conséquences** : tout le calcul orbital se fait dans le navigateur (satellite.js) ; le serveur ne fait que servir les données et jouer les caches/proxys.

## 2026-09-05 (rétro) — Front en JS vanilla, sans build

- **Choix** : `web/` en JS vanilla ; les libs tierces (satellite.js, Leaflet, icônes) sont téléchargées une fois par le serveur, mises en cache dans `data/vendor/` et servies sur `/vendor/…`.
- **Raison** : pas de toolchain Node ; fonctionne hors-ligne après le 1er lancement.
- **Conséquences** : **toute** nouvelle dépendance front doit suivre ce schéma (cache serveur + route `/vendor`).

## 2026-09-05 (rétro) — Banque d'icônes unique : Reicon (Filled, MIT)

- **Choix** : toutes les icônes viennent de Reicon, graisse *Filled*. Pas d'emoji décoratif, pas d'autre jeu d'icônes, pas de SVG dessiné à la main.
- **Mécanique** : `ensure_icon()` dans `app.py` extrait le tracé du paquet npm `reicon` (version épinglée `REICON_VERSION`), écrit `data/vendor/icons/<Nom>.svg`, sert sur `GET /vendor/icon/<Nom>.svg`. Côté client : `web/icons.js` + `MANIFEST` de préchargement.
- **Changer de version** : bump `REICON_VERSION` puis vider `data/vendor/icons/`.

## 2026-09-05 (rétro) — Doppler FTM-500D suivi à la main par paliers

- **Contexte** : le FTM-500D n'a pas de CAT (son USB = programmation + audio/PTT via Digirig).
- **Choix** : découper le passage en paliers de 5 kHz avec horaires exacts, export CSV pour préprogrammer 5 mémoires ; l'interface surligne le palier courant pendant le passage.
- **Options non retenues (pour l'instant)** : poste avec CAT (IC-9700, FT-991A) ; clé RTL-SDR sur JB-SERVER pour correction auto en réception.

## 2026-09-05 (rétro) — Note de qualité adaptée à une antenne verticale

- **Contexte** : une omni verticale fixe a un **cône de silence** au zénith ; les trackers classiques présentent un passage à 88° comme « parfait ».
- **Choix** : un passage culminant au-delà de `cone_of_silence_deg` (75°) est marqué « Zénith » (moins bon qu'un passage à ~45°) ; un passage rasant est signalé comme tel. Zone de cône de silence matérialisée sur la vue polaire.
