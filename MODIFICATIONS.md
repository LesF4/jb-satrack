# JB-SATRACK — modifications du 8 septembre 2026 (v2.0.3)

> Ajout de « Me localiser » (position de l'ordinateur) dans les Réglages, et
> correction : la maison bougeait dans les calculs mais pas sur la carte. Le
> détail de la grosse mise à niveau v2.0.0 suit, plus bas.

Fichiers touchés : [`app.py`](app.py), [`web/app.js`](web/app.js),
[`web/index.html`](web/index.html), [`web/style.css`](web/style.css),
[`web/icons.js`](web/icons.js).
Aucune dépendance ajoutée (`urllib.parse` est dans la lib standard).
`python app.py --selftest` : OK. Selftest client (`/?selftest=1`) : 24/24.

## 1. Ce qui manquait

- **Le locator est manuel, et c'est bien.** Mais en déplacement on ne connaît
  pas forcément son locator ni sa ville — l'ordinateur, lui, sait où il est.
- **La maison sur la carte ne bougeait pas.** Après un changement de position,
  `computeAll()` recalculait tous les passages depuis le nouvel observateur, mais
  le marqueur `staMarker` était posé une seule fois dans `build()` et aucun code
  ne le redéplaçait. La carte ne se recentrait pas non plus. Résultat : on
  enregistre, tout est juste en coulisses, mais l'écran donne l'impression que
  rien n'a changé.
- **La ville restait l'ancienne** sous un locator neuf — trompeur.

## 2. Ce qui a été fait

### Bouton « Me localiser » (`web/index.html`, `web/app.js`, `web/style.css`)

- Sous le champ Locator de la modale Réglages, un bouton discret
  `[Crosshairs] Me localiser`. Groupe `.field-plus` : gap serré avec le champ.
- `locateFromDevice()` : `navigator.geolocation.getCurrentPosition`. La
  permission ne s'obtient **que depuis ce clic** (hors geste utilisateur,
  Safari/Firefox l'ignorent — même règle que `Notification.requestPermission`).
- Succès → remplit le champ **Locator** (via `latLonToLocator`, voir §3), le
  **Fuseau** (`Intl.DateTimeFormat().resolvedOptions().timeZone`, sans
  permission), et lance le géocodage inverse pour la **Ville**.
- Refus / pas de géoloc → message dans `#s-error`, aucun champ touché.
- Rien n'est envoyé au serveur ici : l'opérateur relit puis **Enregistre**,
  exactement comme une saisie manuelle. Pas d'aperçu live pendant qu'on tape.

### La maison bouge (`web/app.js`)

- Nouvelle fonction `MAP.setStation()` (exposée par le module `MAP`) :
  `staMarker.setLatLng(...)`, rafraîchit l'étiquette (l'indicatif a pu changer)
  et `focusHome()` recadre la carte sur la nouvelle position (coupe le suivi,
  comme un geste manuel — on vient de redéfinir « chez soi »).
- `saveSetup()` appelle, dans l'ordre : `renderHeader()` → `computeAll()` (les
  calculs d'abord) → `MAP.setStation()` isolé dans un `try` (un hoquet de la
  carte ne doit jamais bloquer le recalcul) → `loadWeather()`.
- Tout se produit quand la modale se referme après « ✓ Enregistré ».

### Coordonnées exactes conservées (`web/app.js`)

- `deviceFix = { lat, lon, loc }` retient la position renvoyée par la géoloc.
  Tant que le champ Locator vaut encore ce `loc`, `saveSetup()` enregistre ces
  **coordonnées exactes** plutôt que le centre de la case Maidenhead (~3 km).
- Toute frappe dans le champ Locator remet `deviceFix` à `null` : la valeur
  tapée l'emporte.

### Géocodage inverse (`app.py`)

- `reverse_geocode(lat, lon)` : Nominatim (OpenStreetMap), `format=jsonv2`,
  `urllib` standard — même approche que les TLE et les icônes. Choisit la 1re clé
  présente parmi `village, town, city, municipality, hamlet, suburb, county`.
- Route `GET /api/reverse?lat=&lon=` : valide les bornes (`400` sinon), renvoie
  `{"city": "..."}` ou `{"city": null}`. **Jamais 500** : toute erreur (réseau,
  parsing) → `{"city": null}` et le client vide le champ.
- `refresh_weather()` : re-télécharge si la station a bougé de plus de ~0,1°
  (~10 km), même si le cache est récent (sinon météo de l'ancien lieu).

## 3. `latLonToLocator()` — l'inverse de `locatorToLatLon()`

- lat/lon → locator Maidenhead 6 caractères (sous-carré contenant le point).
  `locatorToLatLon(latLonToLocator(p))` retombe dans la même case.
- Le reste du code ne connaît que le locator : la géoloc arrive en lat/lon, on
  convertit, tout le pipeline existant (bandeau, carte, alertes) suit sans
  changement.
- `selfTest()` : aller-retour sur 5 carrés répartis sur le globe + rejet des
  valeurs hors bornes + présence du hook `MAP.setStation`.

## 4. Contexte pour l'exe / le zip Windows

- **Aucun changement dans `packaging/`.** Pas de dépendance pip ajoutée, pas de
  fichier à embarquer en plus — le `.spec` bundle déjà `web/` et `app.py`.
- `navigator.geolocation` exige un « contexte sécurisé » : `https://` **ou**
  `localhost` / `127.0.0.1`. L'exe sert sur `127.0.0.1:8073` → **fonctionne**.
  Ouvert depuis une autre machine du réseau (`http://192.168.x.x:8073`), le
  navigateur bloque la géoloc — la saisie manuelle du locator reste disponible.
- Le géocodage inverse et la météo demandent Internet **au moment du clic** ;
  hors ligne, tout dégrade proprement (locator quand même rempli, ville vide).

---

# JB-SATRACK — modifications du 6 septembre 2026

> Ce document détaille la grosse mise à niveau (v2.0.0). Le journal version par
> version est dans [`CHANGELOG.md`](CHANGELOG.md) ; l'état courant dans
> [`docs/ETAT.md`](docs/ETAT.md).

Objet : **la mise à jour des TLE (bouton « Rafraîchir ») fonctionne maintenant
depuis la machine de la station**, récupère **la totalité du segment
radioamateur + ISS**, et son résultat est visible et réel (pas cosmétique).

Fichiers touchés : [`app.py`](app.py), [`web/app.js`](web/app.js).
Aucune dépendance ajoutée. `python app.py --selftest` : OK.
Selftest client (`/?selftest=1`) : 18/18. Aucune erreur console.

---

## 1. Le problème

Depuis la connexion de la station, **`celestrak.org` est totalement injoignable**
(time-out sec sur toutes les URL, même la page d'accueil — blocage au niveau
réseau, pas un simple 403). Or l'appli ne tirait ses TLE que de CelesTrak. Donc :
« Rafraîchir » échouait, la position des satellites restait figée sur un cache
ancien, et rien ne le signalait clairement.

## 2. La solution : plusieurs sources, fusionnées

`app.py` interroge maintenant **plusieurs bases indépendantes** et **fusionne**
les résultats (dédoublonnage par numéro NORAD, la source la plus fiable
l'emporte) :

| Ordre | Source | Rôle | Joignable depuis la station |
|---|---|---|---|
| 1 | **AMSAT** `nasabare.txt` | liste radioamateur canonique, curatée, MAJ quotidienne | ✅ ~0,2 s |
| 2 | **SatNOGS DB** (`db.satnogs.org`, JSON) | base de la communauté, > 1600 objets | ✅ ~0,7 s |
| 3 | **R4UAB** `satonline.txt` | redondance, large | ✅ ~0,3 s |
| 4-5 | **CelesTrak** (`amateur`, `stations`) | dernier recours — **tenté seulement si les 3 autres ont presque rien donné** | ❌ (mais géré) |

Résultat mesuré d'un « Rafraîchir » depuis la station :

```
TLE www.amsat.org  : +97   (97 cumulés)
TLE db.satnogs.org : +1362 (1458 cumulés)
TLE r4uab.ru       : +149  (1607 cumulés)
→ 1607 satellites, en 1,2 s, errors: []  — ISS incluse, les 9 satellites suivis couverts
```

Détails techniques :
- `TLE_SOURCES` : liste d'URL (plus de groupes CelesTrak en dur).
- `_parse_tle_any()` : accepte le **texte TLE 3 lignes** (AMSAT, R4UAB, CelesTrak)
  **et le JSON SatNOGS** (`_parse_satnogs`).
- **Fusion par fraîcheur** : pour chaque satellite (clé = numéro NORAD),
  `refresh_tle()` garde le TLE dont **l'époque est la plus récente**
  (`_tle_epoch()`), pas celui de la 1re source. Vérifié : les 8 satellites
  suivis bien pistés obtiennent un TLE de **0,2 à 1,1 jour** (SatNOGS est souvent
  plus frais qu'AMSAT de quelques heures).
- CelesTrak est sauté tant que le cumul dépasse `TLE_MIN_OK` (50).
- User-Agent navigateur (`TLE_UA`) — certaines sources filtrent les autres.
- Timeout 12 s par source, sans réessai sur place (un échec est franc).
- Concordance vérifiée : sur les 8 satellites bien suivis, AMSAT, SatNOGS, R4UAB
  et tle.ivanstanojevic.me donnent la **même orbite** (inclinaison identique à
  4 décimales), TLE de quelques heures à ~1 j.
- **IO-117 / GREENCUBE** : aucune source publique n'a de TLE récent (le plus
  frais date de ~15 mois). C'est le seul satellite radioamateur en MEO
  (~5 800 km) ; à cette altitude il n'y a quasiment pas de frottement, donc un
  TLE ancien reste utilisable (dérive le long de la trajectoire de quelques
  dizaines de km, AOS décalé d'une minute ou deux). Aucune alerte à l'écran :
  une bande orange permanente faisait douter de l'ensemble des données alors
  qu'elles sont bonnes. Son statut opérationnel est par ailleurs incertain
  depuis la reprise par AMSAT Italia en 2024.

## 2 bis. Correction : identification des satellites (dont l'ISS)

Avec ~1600 TLE au catalogue, `matchTle()` cherchait un satellite **par nom en
sous-chaîne d'abord** : `ISS` attrapait `SWISSCUBE`, `AISSAT 1`, `ISS (NAUKA)`,
`ISS (ZARYA)` (une entrée homonyme d'un autre NORAD)… **avant** la vraie station.
Résultat : plus aucun passage ISS dans le tableau.

Corrigé — `matchTle()` cherche maintenant **par numéro NORAD d'abord** (sans
ambiguïté), le nom ne servant que de repli. Les préfixes « 0 » du format 3LE sont
aussi retirés des noms. Vérifié : l'ISS (NORAD 25544) et ses passages
réapparaissent (145.825, jusqu'à 77° d'élévation sur 48 h). Selftest client :
**20/20** (2 contrôles `matchTle` ajoutés).

## 3. « Rafraîchir » : réel, pas cosmétique

- `GET /api/tle/refresh` force la récupération, **réécrit `data/tle_cache.json`**
  (nouveau `fetched_at`) et renvoie l'état complet (`fetched_at, age_s, count,
  stale, errors, sats`).
- Le client réinjecte les TLE (`S.tle`) et **`computeAll()` relance la
  propagation SGP4** : ce sont les heures de passage, l'élévation, le Doppler qui
  changent. Vérifié : après un refresh, 8 des 9 satellites suivis reçoivent des
  TLE datés de la veille (époque différente de l'ancien cache).
- `stale` distingue le vrai échec : `false` = données fraîches (même si une
  source annexe a échoué) ; `true` = aucune source fraîche, cache conservé.

## 4. `/api/tle` ne bloque plus le chargement

Avant : si le cache avait > 1 h, la page attendait la récupération réseau
(jusqu'à ~50 s si CelesTrak ne répondait pas). Après : le cache est servi
**immédiatement** (marqué `stale` s'il a vieilli) et la récupération part **en
tâche de fond** (`_tle_refresh_async`). Au démarrage, si le cache servi est
vieilli, le client revient chercher les TLE frais quelques fois (toutes les 7 s,
10 fois max) puis laisse l'intervalle de 30 min prendre le relais.

## 5. La pastille TLE : âge réel, en direct

- Le « il y a … » est calculé à partir de `fetched_at` (horodatage absolu du
  serveur) et **recalculé chaque seconde** (`renderTleChip` appelé par
  `tickClock`). Il **avance tout seul**. Formats : `il y a 12 s`, `il y a 8 min`,
  `il y a 1 h 34`, `il y a 2 j 05 h`.
- **Verte** = TLE frais. **Ambre + « · cache »** = dernière récupération en
  échec, cache local servi ; le **survol** de la pastille dit pourquoi (403, pas
  de réponse, DNS, certificat) et quoi faire.
- Le bouton « Rafraîchir » :
  - succès → bulle **« TLE à jour — N satellites, téléchargés à l'instant »**,
    son de réussite, pastille verte, compteur remis à `il y a 0 s`.
  - échec → bulle **« Mise à jour TLE échouée : \<cause\> — N satellites
    conservés depuis le cache »**, son d'erreur, pastille ambre. Données
    conservées.
- Plus d'utilisation de la bande d'avertissement partagée (`#banner`), qui
  entrait en conflit avec `computeAll()`.

---

## 6. Comment tester (sur la machine de la station)

`Lancer JB-SATRACK.bat` → `http://localhost:8073`.

1. La page s'affiche **tout de suite**. Pastille : `NNNN TLE · il y a …`,
   compteur qui avance chaque seconde.
2. Clic sur **« Rafraîchir »** : bulle **« TLE à jour — ~1600 satellites »**,
   pastille **verte**, compteur remis à `il y a 0 s`, passages recalculés.
3. `data/tle_cache.json` a un `fetched_at` récent et ~1600 satellites. Le journal
   serveur affiche `TLE www.amsat.org : +97`, `TLE db.satnogs.org : +1362`, etc.

Contrôles intégrés :

```
python app.py --selftest              # logique serveur
http://localhost:8073/?selftest=1     # logique client — 18/18 dans la console (F12)
```

## 7. Points restants (hors code)

- **Raccourci « JB-SATRACK » du bureau** : vérifier sa cible (clic droit →
  Propriétés). S'il pointe vers l'ancien dossier, le refaire vers
  `D:\ClaudeProjets\newapp\jb-satrack\jb-satrack\Lancer JB-SATRACK.bat`.
- **`dist\JB-SATRACK.exe` est périmé** (compilé avant ces modifs). Utiliser le
  `.bat` (qui lance `python app.py` depuis les sources). Pour un `.exe` à jour :
  le régénérer avec PyInstaller.
- Filets de sécurité si toutes les sources échouent : dernier cache → fichier
  embarqué `data/tle_fallback.txt` → signalé dans l'interface. Un TLE reste
  exploitable quelques jours.
- **GREENCUBE / IO-117** : aucune source publique n'a de TLE récent pour ce
  satellite (le plus frais trouvé date de juin 2025). C'est une limite de la
  donnée amont, pas de l'appli.
