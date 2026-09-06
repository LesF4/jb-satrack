# JB-SATRACK — modifications du 6 septembre 2026

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
