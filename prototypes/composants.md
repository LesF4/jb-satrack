# JB-SATRACK — campagne de prototypage, composant par composant

Document de cadrage. Il **décrit** l'existant et **pose les questions** à trancher par
prototype. Il ne tranche rien : chaque « question ouverte » attend une page de
`prototypes/` avec ses variantes derrière le sélecteur (voir `prototypes/index.html`).

Sources lues intégralement : `web/index.html`, `web/app.js`, `web/style.css`,
`web/icons.js`, `data/satellites.json`, `data/station.json`, `README.md`, et les
routes concernées de `app.py`.

Priorité = **fréquence de consultation × densité d'information**.

---

## Récapitulatif

| # | Composant | Emplacement | Priorité | Raison |
|---|---|---|---|---|
| 1 | Tableau des passages | `web/index.html:121-135` · `renderPassTable()` `web/app.js:152` | **haute** | Sept colonnes × 40 lignes, c'est la navigation principale et la seule vue comparative. |
| 2 | Passage sélectionné (hero) | `web/index.html:60-95` · `renderNextPass()` `web/app.js:182` | **haute** | Douze champs dont le compte à rebours et les deux fréquences ; c'est l'écran qu'on fixe pendant le passage. |
| 3 | Bandeau de lectures live | `web/index.html:49-56` · `MAP.draw()` `web/app.js:354-362` | **haute** | Six valeurs rafraîchies chaque seconde, immédiatement sous la carte. |
| 4 | Carte du monde (cadre, en-tête, légende, marqueurs) | `web/index.html:37-48` · objet `MAP` `web/app.js:236-403` | moyenne | Très regardée, mais l'essentiel du pixel appartient aux tuiles Esri : la refonte porte sur le cadre, la légende et les marqueurs. |
| 5 | Plan de tuning Doppler | `web/index.html:110-119` · `renderPlan()` `web/app.js:201` | moyenne | Consulté au moment du passage, dense en chiffres, avec un état « palier courant ». |
| 6 | En-tête station | `web/index.html:17-33` · `renderHeader()` `web/app.js:137` | moyenne | Toujours visible, mais surtout de l'identité et un indicateur de fraîcheur TLE. |
| 7 | Statut radio de l'ISS | `web/index.html:104-109` · `loadIssStatus()` `web/app.js:537` | moyenne | Quatre cartes d'état, du texte long, consulté avant chaque passage ISS. |
| 8 | Tracé polaire Az/El | `web/index.html:97-102` · `drawPolar()` `web/app.js:606` | moyenne | Une seule information (la forme du passage), mais lue à chaque sélection. |
| 9 | Bandeau d'état | `web/index.html:35` · `computeAll()` `web/app.js:514-515`, `boot()` `web/app.js:441-462` | moyenne | Porte à la fois le comptage normal et toutes les erreurs fatales de démarrage. |
| 10 | Pictogrammes météo (sur la carte) | `MAP.setWeather()` `web/app.js:380-400` | basse | Deux pictogrammes, coup d'œil occasionnel, aucun balisage statique. |
| 11 | Journal de trafic (QSO) | `web/index.html:136-149` · `saveQso()` `web/app.js:666` | basse | Utilisé après le QSO, six champs, aucune donnée relue. |
| 12 | Modale de configuration | `web/index.html:168-201` · `openSetup()` `web/app.js:705` | basse | Vue une fois au premier lancement, rarement ensuite. |
| 13 | Pied de page (bande matériel + mentions) | `web/index.html:150-165` | basse | Entièrement statique, jamais alimenté par `app.js`. |
| 14 | Fond animé (starfield + voile) | `web/index.html:12-13` · `web/starfield.js` · `.veil` `web/style.css:38-44` | basse | Décor pur, mais il conditionne tout le contraste de l'interface. |

---

## 1. Tableau des passages — priorité **haute**

`web/index.html:121-135` (balisage) · `renderPassTable()` `web/app.js:152-170` · styles `web/style.css:216-235`, `326-328`

### 1. Rôle
Choisir le prochain passage à travailler : d'un coup d'œil, quel satellite, à quelle heure locale, monte assez haut pour valoir la peine avec une omni fixe.

### 2. Données portées
Une ligne = un objet de `S.passes` construit dans `computeAll()` (`web/app.js:503-506`), limité aux 40 premiers (`web/app.js:155`).

| Colonne | Champ | Producteur | Format réel |
|---|---|---|---|
| Satellite | `p.satName` + pastille `p.color` | `sat.name.split(' (')[0]` `web/app.js:504` ; `COLORS[idx % 6]` `web/app.js:486,505` | `ISS`, `SO-50`, `IO-117` — jamais la partie entre parenthèses |
| Mode | `p.modeLabel` | `shortMode(mode)` `web/app.js:518-523` | cinq valeurs seulement : `Linéaire SSB`, `Digipeater`, `SSTV`, `FM V/U`, `FM U/V` |
| AOS | `p.aos` (ms) | `hhmmLoc()` `web/app.js:17` + `hhmm()` `web/app.js:14` | `14:32` puis, en `<span class="loc">`, ` 12:32 UTC` |
| Élév. max | `p.maxEl` (deg, float) | `findPasses()` `web/app.js:86` | `toFixed(0) + '°'` → `5°` … `89°` |
| Durée | `p.duration` (secondes) | `dur()` `web/app.js:20-21` | `< 1 h` → `12:04` (mm:ss) ; `≥ 1 h` → `1 h 05` |
| Downlink | `p.mode.down` (MHz) | `mhz()` `web/app.js:19` | `436.7950` (4 décimales, séparateur **point**), ou `—` |
| Qualité | `quality(p.maxEl, cone)` | `web/app.js:107-112` | pastille `● Rasant` / `● Basse` / `● Zénith` / `● Bonne`, la phrase `q.why` étant reléguée dans l'attribut `title` (`web/app.js:166`) |

### 3. États
- **Chargement** : `<tbody id="passtable">` vide, seul l'en-tête de colonnes s'affiche — aucun squelette, aucun texte.
- **Vide (aucun passage)** : `tb.innerHTML = ''` laisse un tableau à en-tête seul. Pire : `computeAll()` appelle `selectPass(all[0] || null)` (`web/app.js:512`) et `selectPass()` déréférence `p.rec` sans garde (`web/app.js:174`) → `TypeError`. Au démarrage l'exception est capturée par `boot()` et l'écran affiche `Erreur de démarrage : …` dans le bandeau (`web/app.js:461`) ; en recalcul périodique (`setInterval(computeAll, …)` `web/app.js:456`) elle est silencieuse.
- **Tronqué** : `slice(0, 40)` (`web/app.js:155`) alors que le bandeau annonce `all.length + ' passages / 48 h'` (`web/app.js:515`). Sur 9 satellites × 48 h le total dépasse 40 : le tableau montre moins que le compteur, sans aucune marque de troncature ni pagination.
- **Sélection** : `tr.className = 'sel'` (`web/app.js:158`) → `web/style.css:327` (fond teinté + liseré gauche).
- **Survol** : `tbody tr:hover` (`web/style.css:223`).
- **Passage en cours vs à venir** : *aucune distinction*. `computeAll()` sélectionne le passage live (`web/app.js:511`) mais la ligne correspondante ne porte pas d'autre marque que `.sel`. Une ligne dont l'AOS est passée reste affichée à l'identique jusqu'au prochain `computeAll()` (déclenché par `tickClock()` cinq secondes après le LOS, `web/app.js:420`).
- **Satellite sans TLE** : le satellite est retiré du tableau (`missing.push` puis `return`, `web/app.js:497`) et ne se manifeste que dans le bandeau `#missing`.
- **Écoute seule (`up: null`)** : indistinguable. La colonne Downlink existe, la colonne Uplink n'existe pas ; le mode SSTV de l'ISS (`data/satellites.json:18`) apparaît comme n'importe quel autre.
- **Hors service** : `applyIssOverrides()` écrit `mode.state = 'off'` (`web/app.js:585`) et rien dans `renderPassTable()` ne lit `mode.state`. Un mode ARISS signalé hors service produit une ligne identique aux autres.
- **Erreur réseau / TLE périmés** : sans effet ici, l'information reste dans l'en-tête.

### 4. Pire contenu
- Nom affiché le plus long : **`IO-117`** (6 caractères) — la colonne Satellite ne dépasse jamais cela puisque `split(' (')[0]` coupe. Le nom complet le plus long, `AO-91 (RadFxSat / Fox-1B)` (25 car., `data/satellites.json:35`), n'apparaît **que** dans `#mapsat` (`web/app.js:175`) et dans le bandeau `#missing`.
- Libellé de mode le plus long affiché : **`Linéaire SSB`** (12 car.). Les vrais libellés du catalogue — `Transpondeur linéaire + balise` (30 car., `data/satellites.json:86`), `Transpondeur linéaire inversé` (29 car.) — ne sont **jamais** rendus.
- Durée maximale : IO-117, orbite 6000 km, « visible plus d'une heure » (`data/satellites.json:111`) → `dur()` bascule sur `1 h 05`, format visuellement incompatible avec le `12:04` des voisines dans la même colonne.
- Fréquence à largeur maximale : `436.7950`, `435.6250`, `145.8000` — toujours 8 caractères, séparateur point.
- Élévation maximale : `89°`. Minimum : `5°` (`min_elevation_deg`, `data/station.json:20`).
- Valeur négative : aucune dans ce tableau.

### 5. Ce qui cloche aujourd'hui
- **Tout est en mono, à une seule taille.** `table{font-family:var(--mono); font-size:13px}` (`web/style.css:217`) : le nom du satellite, l'heure, la fréquence et le libellé de qualité ont exactement le même poids visuel. Rien ne dit ce qu'on doit lire en premier.
- **La pastille de couleur ne désigne pas un satellite.** `COLORS` compte 6 entrées (`web/app.js:486`) pour 9 satellites : AO-73 reprend le teal de l'ISS, AO-7 l'ambre de SO-50, IO-117 le violet d'AO-91. Et les deux premières couleurs sont exactement `--phosphor` et `--amber`, les couleurs sémantiques du système.
- **Le mauvais passage est le plus discret.** `.q.poor{color:var(--ink-2)}` (`web/style.css:233`) : « Rasant » est rendu dans la couleur la plus faible de la palette, donc moins lisible que « Bonne ».
- **La justification de la note est cachée dans un `title`** (`web/app.js:166`), inaccessible au tactile et invisible en survol rapide, alors que c'est l'argument central du produit (README.md:16).
- **Deux formats de durée coexistent** dans l'application : `12:04` ici (`dur()`), `12 min 04 s` dans le hero (`web/app.js:191`), pour la même grandeur.
- **La colonne AOS mélange deux fuseaux dans une même cellule** (`14:32` + `12:32 UTC`), distingués uniquement par `td .loc{color:var(--ink-2); font-size:11px}` (`web/style.css:328`).
- **L'en-tête `<h2>` porte une consigne d'usage en capitales** : `HEURE LOCALE · CLIQUE UNE LIGNE POUR LA SUIVRE` (`web/index.html:122`), rendue en `--ink-2` à 10 px (`web/style.css:165`) — c'est la seule indication que la ligne est cliquable, et c'est le texte le moins lisible de la page.
- **Aucun état de troncature ni de fin de liste** : la 40ᵉ ligne est suivie du vide.

### 6. Questions ouvertes
1. **Comment se lit une ligne ?** (a) toutes les colonnes de même poids, la hiérarchie venant de l'espacement seul ; (b) satellite + heure en grotesque, chiffres en mono tabulaire, reste en secondaire ; (c) deux niveaux typographiques dans la ligne, avec le nom du satellite en tête de bloc et les mesures en ligne secondaire.
2. **Qu'est-ce qui identifie un satellite ?** (a) la pastille de couleur, mais avec 9 couleurs distinctes ; (b) le nom seul, aucune couleur, l'accent réservé à l'état ; (c) un glyphe/monogramme mono (`ISS`, `SO50`) en tête de ligne.
3. **Comment porter la note de qualité ?** (a) pastille texte comme aujourd'hui ; (b) une mesure graphique d'élévation (barre ou arc) qui rend la note lisible sans mot ; (c) la note en toutes lettres avec sa justification `q.why` visible en permanence sur la ligne sélectionnée.
4. **Comment marquer les états de temps ?** (a) un passage en cours en tête de tableau, épinglé et distinct ; (b) une séparation par jour (« aujourd'hui / demain ») ; (c) rien de plus, la sélection suffit.
5. **Que fait-on des 40 lignes ?** (a) tout afficher et laisser défiler ; (b) limiter à 12 h avec un dépliant ; (c) garder 40 mais annoncer explicitement la troncature et aligner le compteur du bandeau.

---

## 2. Passage sélectionné (hero) — priorité **haute**

`web/index.html:60-95` · `renderNextPass()` `web/app.js:182-199`, `tickClock()` `web/app.js:406-422`, fréquences live dans `MAP.draw()` `web/app.js:364-370` · styles `web/style.css:148-202`, `274-325`

### 1. Rôle
Pendant qu'on attend et pendant qu'on émet : combien de temps reste-t-il, sur quelle fréquence est-on maintenant, et faut-il s'attendre à un creux au zénith.

### 2. Données portées
| Élément | id | Producteur | Format réel |
|---|---|---|---|
| Nom | `#nextname` | `p.satName` `web/app.js:186` | `SO-50` |
| Mode | `#nextmode` | `p.modeLabel` `web/app.js:187` | `FM V/U` ; classe `modepill linear` si `mode.type === 'linear'` (`web/app.js:188`) |
| Compte à rebours | `#countdown` | `tickClock()` `web/app.js:414-417` | `00:14:32`, les `:` étant des `<i>` séparés ; cible = `aos` avant AOS, `los` après |
| Libellé du rebours | `#cdlabel` | `web/app.js:418` | `avant AOS — AOS 14:32:07 loc.` ou `avant LOS — …` |
| Élév. max | `#f-maxel` | `web/app.js:189` | `62°`, classe `v good` / `v warn` / `v` selon `quality().k` |
| Durée | `#f-dur` | `web/app.js:191` | `12 min 04 s` si < 1 h, sinon `dur()` → `1 h 05` |
| Az AOS → LOS | `#f-az` | `stateAt()` aux bornes `web/app.js:192-193` | `223° → 41°`, ou `?° → ?°` si `stateAt` renvoie `null` |
| Qualité | `#f-qual` | `quality().t` `web/app.js:194` | `Bonne` / `Basse` / `Zénith` / `Rasant` |
| Uplink | `#txfreq` | `mhz(txTune(m.up, rr))` `web/app.js:368` | `145.9895` ou `—` |
| Doppler up | `#txdop` | `web/app.js:369` | `▲ +3,2 kHz Doppler` / `▼ -3,2 kHz Doppler` / `écoute seule` |
| CTCSS ou modulation | `#ctcssval` | `web/app.js:197` | `PL 67.0 Hz`, sinon **la chaîne `mode.mod`** |
| Downlink | `#rxfreq` | `mhz(rxTune(m.down, rr))` `web/app.js:366` | `436.8046` |
| Doppler down | `#rxdop` | `web/app.js:367` | `▲ +9,8 kHz Doppler` |
| Modulation | `#modval` | `mode.mod` `web/app.js:198` | `FM`, `SSB/CW (montée LSB, descente USB)` |
| Note | `#passnote` | `mode.note` `web/app.js:196` | texte libre du catalogue, ou l'extrait ARISS réécrit par `applyIssOverrides()` (`web/app.js:586,592,597`) |

### 3. États
- **Chargement / aucune sélection** : `renderNextPass()` sort immédiatement si `!S.selectedPass` (`web/app.js:184`). Restent les `—` du balisage et `--:--:--` (`web/index.html:70`). **Identique à l'état d'erreur.**
- **Passage à venir vs en cours** : `#countdown` gagne la classe `live` (`web/app.js:419`) → ambre (`web/style.css:272`) et le libellé passe de `avant AOS` à `avant LOS`. Le `<span class="tag">COMPTE À REBOURS</span>` du titre (`web/index.html:65`) reste identique dans les deux cas, il est statique.
- **Écoute seule (`up: null`)** : `#txfreq` = `—` et `#txdop` = `écoute seule` (`web/app.js:368-369`). Le cadre `Uplink (toi → sat)` conserve toute sa surface et sa bordure : un mode réception seule occupe autant de place qu'un mode duplex.
- **Carte indisponible** : `#txfreq`/`#rxfreq`/`#txdop`/`#rxdop` ne sont écrits **que** dans `MAP.draw()`, qui sort si `!map` (`web/app.js:313`). Si Leaflet n'a pas pu être servi, les quatre champs restent à `—` pour toujours, alors que le calcul Doppler ne dépend pas de la carte. Couplage à signaler.
- **Propagation impossible** : `MAP.draw()` sort aussi si `stateAt()` renvoie `null` (`web/app.js:318`) — les fréquences se figent sur leur dernière valeur, sans marque de gel.
- **Hors service** : le seul indice est le préfixe injecté dans la note, `APRS signalé hors service par ARISS. ` (`web/app.js:586`), en 11 px `--ink-2` (`web/style.css:270`) — la couleur la plus faible de la page pour l'information la plus critique.
- **TLE périmés** : aucune répercussion ici ; le rebours reste affiché avec la même autorité qu'un TLE de 2 h.
- **Note absente** : `mode.note || ''` (`web/app.js:196`) → le bloc `.passnote` disparaît, ce qui fait sauter la hauteur du panneau à chaque changement de sélection.

### 4. Pire contenu
- Note la plus longue du catalogue (112 caractères) : `Orbite haute : passages longs (jusqu'à 20 min), très bon en omni. Nécessite SSB — pas faisable avec le FTM-500D.` (`data/satellites.json:64`).
- Pire cas réel : la note est remplacée par un extrait ARISS **plafonné à 300 caractères** (`app.py:315,328,341,351`), en anglais, éventuellement préfixé de `APRS signalé hors service par ARISS. ` → jusqu'à ~336 caractères de prose anglaise dans une interface française.
- `mod` le plus long (33 car.) : `SSB/CW (montée LSB, descente USB)` (`data/satellites.json:63`) — et il s'affiche **deux fois côte à côte**, dans `#ctcssval` (parce que `ctcss` vaut `null`, `web/app.js:197`) et dans `#modval` (`web/app.js:198`).
- Compte à rebours à sa largeur maximale : `forecast_hours: 48` (`data/station.json:23`) → jusqu'à `47:59:59` à 52 px (`web/style.css:176`).
- Doppler négatif : `▼ -10,3 kHz Doppler` — la flèche basse est déjà porteuse du signe, le `-` est redondant, alors que la branche positive écrit `▲ +10,3` (signe dupliqué d'un seul côté, `web/app.js:367`).
- Élévation la plus hostile : `89°` classé `Zénith` (`quality()` `web/app.js:110`), donc coloré `warn` alors que c'est numériquement le meilleur passage — c'est le comportement voulu (README.md:16), mais rien ne l'explique dans le hero.
- CTCSS la plus longue : `PL 141.3 Hz` (PO-101, `data/satellites.json:51`).

### 5. Ce qui cloche aujourd'hui
- **Le panneau porte une identité graphique complète et isolée** — la direction « Phosphor » promue depuis `prototypes/hero.html` : scanlines `::after` (`web/style.css:284-288`), quatre équerres `.corner` en balisage (`web/index.html:61-64`), lueurs `text-shadow` (`web/style.css:307`), fond radial (`web/style.css:278-281`). Aucun autre panneau de la page ne partage ce traitement.
- **Le clignotement des deux-points ne clignote pas.** `#countdown.innerHTML` est réécrit à chaque seconde (`web/app.js:417`), ce qui recrée les `<i>` et redémarre l'animation `hp-blink` de 1,06 s (`web/style.css:308-309`) : le cycle ne s'achève jamais.
- **Quatre tailles de mono empilées** dans un seul panneau : 30 px (`.nextsat .name`, `web/style.css:168`), 52 px (`.countdown`), 19 px (`.freqbox .v`), 16 px (`.fact .v`), 11 px (`.doppler`, `.pl`, `.passnote`), 10 px (les `.k`). L'échelle n'est pas une progression, c'est une accumulation.
- **Les étiquettes crient.** `.fact .k`, `.freqbox .k`, `.countdown-label` : toutes en `text-transform:uppercase` + `letter-spacing` élargi (`web/style.css:180,185,197`), sur un fond où elles sont déjà en `--ink-2`.
- **Deux séparateurs décimaux dans le même cadre** : `mhz()` produit `436.8046` (point, `web/app.js:19`) et `fmt()` produit `+9,8 kHz` (virgule, locale fr-FR, `web/app.js:18`).
- **La modulation est dupliquée** quand `ctcss` est `null` (voir « pire contenu ») : la même chaîne de 33 caractères sous les deux cadres.
- **Le titre `<h2>` annonce « COMPTE À REBOURS » en dur** (`web/index.html:65`) même quand le passage est en cours et que le rebours mesure le temps restant avant LOS.
- **La note est le dernier élément visuel du panneau et le moins lisible** (11 px, `--ink-2`, `line-height:1.5`, `web/style.css:270`), alors qu'elle porte les consignes opératoires (tonalité 74.4 Hz de SO-50, SSB requis pour RS-44).

### 6. Questions ouvertes
1. **Quel est l'objet principal du panneau ?** (a) le compte à rebours, tout le reste en satellite ; (b) le couple fréquences RX/TX, le rebours devenant une réglette ; (c) l'identité du passage (satellite + qualité), rebours et fréquences à égalité en dessous.
2. **Comment se dit « en cours » ?** (a) changement de couleur du rebours comme aujourd'hui ; (b) changement de structure — le panneau se réorganise autour des fréquences dès l'AOS ; (c) un bandeau d'état explicite en tête de panneau, et le titre suit.
3. **Que devient l'identité « Phosphor » (scanlines, équerres, lueurs) ?** (a) supprimée, le panneau devient un panneau comme les autres ; (b) conservée mais réduite à un seul signe ; (c) étendue à toute la page, donc plus distinctive du tout.
4. **Comment traiter un mode en écoute seule ?** (a) le cadre Uplink reste, vidé ; (b) le cadre disparaît et le Downlink prend toute la largeur ; (c) un seul cadre de fréquence avec une mention de duplex explicite.
5. **Où va la note ?** (a) en pied de panneau comme aujourd'hui ; (b) en tête, juste sous le nom, parce qu'elle conditionne l'action ; (c) repliée derrière un déclencheur, sauf quand elle porte un état (`hors service`).

---

## 3. Bandeau de lectures live — priorité **haute**

`web/index.html:49-56` · `MAP.draw()` `web/app.js:354-362` · styles `web/style.css:127-135`

### 1. Rôle
Vérifier en un balayage que la station suit bien quelque chose de réel : où est le satellite, à quelle distance, et est-il audible maintenant.

### 2. Données portées
Six cellules, grille de 6 colonnes (3 sous 820 px, `web/style.css:129`).

| Cellule | id | Producteur | Format réel |
|---|---|---|---|
| Distance | `#ro-dist` | `fmt(st.range, 0)` `web/app.js:354` | `1 842 <small>km</small>` — espace fine insécable fr-FR |
| Vitesse | `#ro-speed` | `fmt(st.speed * 3600, 0)` `web/app.js:355` | `27 600 <small>km/h</small>` |
| Altitude | `#ro-alt` | `fmt(st.alt, 0)` `web/app.js:356` | `419 <small>km</small>` |
| Position sat | `#ro-pos` | `web/app.js:357-358` | `47.8°N 7.3°E` — 1 décimale, `O` pour Ouest, séparateur **point** |
| Azimut / Élév. | `#ro-azel` | `web/app.js:359` | `223° / 41.7°` — azimut à 0 décimale, élévation à 1 |
| Visibilité | `#ro-vis` | `web/app.js:360-362` | `AUDIBLE` (classe `v live`) / `trop bas` / `sous horizon` |

`audible` = `st.el > station.min_elevation_deg` (`web/app.js:331`), soit 5° (`data/station.json:20`).

### 3. États
- **Chargement** : six `—` du balisage, jusqu'au premier `MAP.draw()`.
- **Carte non construite** : `MAP.draw()` sort sur `!map` (`web/app.js:313`) → le bandeau reste bloqué sur `—` indéfiniment. Le bandeau est structurellement dépendant de Leaflet alors qu'il n'affiche aucune donnée cartographique.
- **Propagation en échec** : sortie sur `!st` (`web/app.js:318`) → les six valeurs se figent sur leur dernière valeur connue, **sans aucune marque de gel**.
- **Trois états de visibilité** portés par `#ro-vis`, mais seulement deux traitements : `AUDIBLE` en `--phosphor` via `.v.live`, `trop bas` et `sous horizon` partagent le même rendu neutre (`web/app.js:362`).
- **Aucun état « périmé »** alors que la donnée dépend d'un TLE dont la fraîcheur est connue (`S.tleInfo.age_s`, `web/app.js:147`).

### 4. Pire contenu
- Distance maximale : IO-117 (orbite ~6000 km, `data/satellites.json:111`) → portée oblique à plus de 9 000 km, soit `9 245 km` (5 caractères + séparateur + unité) dans une cellule dimensionnée sur `419 km`.
- Vitesse maximale : ISS à ~27 600 km/h — six caractères avec l'espace fine.
- Altitude maximale : IO-117, ~`5 900 km`.
- Élévation négative : `-42.3°` en cellule `#ro-azel` dès que le satellite suivi est sous l'horizon, c'est-à-dire **la majorité du temps** (le passage sélectionné est presque toujours à venir).
- Longitude négative : jamais affichée en négatif, `Math.abs` + `O` (`web/app.js:358`).
- Étiquette la plus longue : `Azimut / Élév.` (`web/index.html:54`) à 9,5 px avec `letter-spacing:0.11em` (`web/style.css:132`).

### 5. Ce qui cloche aujourd'hui
- **La cellule Distance est en permanence colorée en accent.** `class="v live"` est écrit en dur dans le balisage (`web/index.html:50`) et n'est jamais retiré ; `.v.live{color:var(--phosphor)}` (`web/style.css:135`). L'accent censé signaler « audible » sur `#ro-vis` est donc allumé en continu sur une cellule voisine qui ne signale rien.
- **Six cellules d'égale importance**, séparées par de simples filets `border-right` (`web/style.css:130`), toutes en mono 17 px : rien ne distingue une mesure critique (élévation) d'une mesure d'ambiance (vitesse).
- **Précisions incohérentes dans une même cellule** : `223° / 41.7°`.
- **Le passage à 3 colonnes sous 820 px** (`web/style.css:129`) produit deux rangées de trois sans que l'ordre de lecture ait été pensé pour ce découpage (Distance/Vitesse/Altitude puis Position/AzEl/Visibilité).
- **`AUDIBLE` en capitales, `trop bas` en minuscules** (`web/app.js:361`) : trois valeurs d'un même champ, deux conventions typographiques.

### 6. Questions ouvertes
1. **Six cellules égales, ou une hiérarchie ?** (a) six égales comme aujourd'hui ; (b) une cellule dominante (visibilité ou élévation) et cinq secondaires ; (c) deux groupes explicites — « où il est » / « ce que j'en reçois ».
2. **Comment se signale une valeur figée ou périmée ?** (a) opacité réduite sur tout le bandeau ; (b) horodatage de dernière mise à jour dans le bandeau ; (c) rien, on suppose que ça tourne.
3. **La visibilité mérite-t-elle une cellule ?** (a) oui, telle quelle ; (b) non — c'est un état du bandeau entier, pas une valeur parmi six ; (c) oui, mais avec ses trois niveaux réellement distingués.
4. **Où vivent les unités ?** (a) dans la valeur en `<small>` comme aujourd'hui (`web/style.css:134`) ; (b) dans l'étiquette (`Distance (km)`), la valeur restant un nombre nu ; (c) en suffixe non tabulaire aligné en colonne.

---

## 4. Carte du monde — priorité **moyenne**

`web/index.html:37-48` · objet `MAP` `web/app.js:236-403` · styles `web/style.css:81-126`

### 1. Rôle
Comprendre d'un regard si le satellite arrive ou repart : où il est, par où il passe, et si la station est dans son empreinte.

### 2. Données portées
- **En-tête** `#mapsat` : `p.sat.name` — le nom **complet**, `web/app.js:175`, contrairement au reste de l'interface qui affiche `p.satName`.
- **Légende** (`web/index.html:39-47`) : cinq entrées entièrement statiques, couleurs en hexadécimal inline.
- **Fond** : deux couches de tuiles Esri (`web/app.js:249-255`).
- **Terminateur** : polygone `nightLayer`, `nightPolygon()` `web/app.js:288-299`, recalculé toutes les 60 s (`web/app.js:315`), rempli `#04080f` à 0,55 (`web/app.js:257`).
- **Trace au sol** : `trackPast` / `trackFuture`, une orbite avant et après, 90 points chacune, période dérivée de `rec.no` (`web/app.js:321-326`), découpées à l'antiméridien par `splitAtDateline()` (`web/app.js:302-310`).
- **Empreinte** : `footprint`, rayon calculé à `min_elevation_deg` et non à l'horizon géométrique (`web/app.js:330-341`) ; **change de couleur** selon `audible` — ambre si audible, teal sinon (`web/app.js:342-344`).
- **Marqueur station** : `divIcon` avec l'icône Reicon `Home` + `station.callsign` (`web/app.js:263-266`).
- **Marqueur satellite** : `divIcon` avec `S.tracked.name.split(' ')[0]` (`web/app.js:348-349`) — troisième variante du nom.
- **Ligne de liaison** : `linkLine`, tiretée, affichée **uniquement si audible** (`web/app.js:350`).

### 3. États
- **Leaflet absent** : `boot()` remplace le bandeau par un message et **retourne avant `MAP.build()`** (`web/app.js:445-449`) — la carte reste un `<div>` vide de 74 vh (`web/style.css:94`), sans message dans le cadre lui-même.
- **Pas de réseau après chargement** : les tuiles Esri manquent, le fond reste `#070c17` (`web/style.css:98`), aucune indication.
- **Aucun satellite suivi** : `draw()` sort sur `!S.tracked` (`web/app.js:313`) → marqueur satellite figé à `[0, 0]` avec le libellé `—` posé au `build()` (`web/app.js:269`), c'est-à-dire un point au large du golfe de Guinée.
- **Audible vs non audible** : trois choses changent simultanément (couleur d'empreinte, présence de la ligne, `#ro-vis`), aucune n'est annoncée par la légende.
- **Satellite sans TLE / propagation en échec** : `draw()` sort, tout se fige silencieusement.
- **Chargement** : aucun état intermédiaire, le cadre est vide puis plein.

### 4. Pire contenu
- `#mapsat` avec le nom le plus long : `AO-91 (RadFxSat / Fox-1B)` (25 caractères) dans un `<div class="t">` en 13 px, `letter-spacing:0.16em`, capitales forcées (`web/style.css:91`) → `AO-91 (RADFXSAT / FOX-1B)`.
- Marqueur satellite le plus long : `IO-117` (`split(' ')[0]`).
- Empreinte la plus grande : IO-117 à ~6000 km d'altitude — le disque couvre une fraction majeure de l'hémisphère et son contour traverse l'antiméridien, cas géré par `splitAtDateline()` mais jamais vérifié visuellement.
- Trace la plus longue : IO-117, période orbitale de plusieurs heures → deux polylignes qui font plusieurs fois le tour du globe.
- Cinq entrées de légende sur une seule ligne à 10 px (`web/style.css:92`), qui se replient en `flex-wrap` sur écran étroit.

### 5. Ce qui cloche aujourd'hui
- **La légende ment sur deux points.** L'entrée « Zone de nuit » annonce `#1a2438` (`web/index.html:45`) alors que la couche est remplie en `#04080f` à 0,55 (`web/app.js:257`). L'entrée « Zone audible (élév. mini) » annonce un teal `rgba(75,227,199,0.25)` (`web/index.html:44`) alors que l'empreinte devient **ambre** précisément quand le satellite est audible (`web/app.js:343`) : la légende décrit l'état inverse de celui qu'elle nomme.
- **Trois écritures du même nom de satellite** sur un même écran : `AO-91 (RadFxSat / Fox-1B)` dans l'en-tête de carte, `AO-91` dans le tableau et le hero, `AO-91` (via `split(' ')[0]`) sur le marqueur.
- **Cinq couleurs codées en dur dans le balisage** (`web/index.html:41-45`) et cinq autres dans le JS (`web/app.js:257-261`) — aucune ne passe par les tokens de `web/style.css:2-21`.
- **La carte déborde du conteneur de lecture au-delà de 1300 px** (`width:94vw; margin-left:50%; transform:translateX(-50%)`, `web/style.css:85-87`) : c'est le seul élément de la page qui ne respecte pas la colonne, et cela crée deux largeurs de référence.
- **Les contrôles Leaflet sont rethémés à coups de `!important`** sur onze déclarations (`web/style.css:99-116`).
- **L'icône de légende météo prend `--ink-1`** (`web/style.css:383`) tandis que le pictogramme réel sur la carte est en `--amber` (`web/style.css:385`).

### 6. Questions ouvertes
1. **Que devient la légende ?** (a) statique, corrigée ; (b) générée depuis les mêmes constantes que les couches, donc impossible à désynchroniser ; (c) supprimée au profit de marqueurs auto-explicites.
2. **Quelle largeur pour la carte ?** (a) pleine largeur d'écran comme aujourd'hui ; (b) alignée sur la colonne de lecture ; (c) hauteur réduite, largeur pleine, pour rapprocher le bandeau de lectures.
3. **Comment se dit « audible » sur la carte ?** (a) changement de couleur d'empreinte (aujourd'hui) ; (b) la ligne de liaison seule ; (c) un état porté par le cadre du panneau plutôt que par la géométrie.
4. **L'en-tête de carte doit-il porter le nom du satellite ?** (a) oui, nom complet ; (b) oui, mais la même forme courte que partout ailleurs ; (c) non, le marqueur suffit et l'en-tête devient un simple titre.

---

## 5. Plan de tuning Doppler — priorité **moyenne**

`web/index.html:110-119` · `renderPlan()` `web/app.js:201-213`, `dopplerPlan()` `web/app.js:115-134`, surlignage dans `MAP.draw()` `web/app.js:372-375`, `exportMemories()` `web/app.js:216-233` · styles `web/style.css:137-146`, `343-344`

### 1. Rôle
Savoir à quelle seconde tourner la molette du FTM-500D et sur quelle mémoire, puisque le poste n'a pas de CAT (README.md:82-90).

### 2. Données portées
Chaque `.step` (`web/app.js:207-211`) porte :
- `.when` : `'M-' + pad(i+1) + ' · ' + hhmmLoc(start) + ' → ' + hhmmLoc(end)` → `M-01 · 14:32 → 14:35`.
- `.rx` : `'RX ' + mhz(s.rx)` → `RX 436.7950`, arrondi au pas de `rig.tuning_step_khz` = 5 kHz (`web/app.js:117-119`, `data/station.json:18`).
- `.tx` : `'TX ' + mhz(s.tx)` ou la chaîne `écoute seule` si `mode.up` est `null`.
- En-tête `#planhead` : `'PAS DE ' + step + ' kHz · ' + plan.length + ' MÉMOIRES'` (`web/app.js:212`).
- Export CSV (`exportMemories()`) : colonnes `Channel, Name, RX Frequency, TX Frequency, Mode, Tone, Comment` ; `Name` = `(sat.id + '-' + n).slice(0,16)` ; `Mode` = `USB` si `type === 'linear'` sinon `FM` ; `Comment` = `SO-50 12:32Z`.

Le nombre de segments est calculé, pas fixé : `dopplerPlan()` échantillonne 61 points sur le passage et fusionne les paliers identiques.

### 3. États
- **Aucune sélection ou pas de downlink** : `box.innerHTML = '<div class="step">—</div>'` (`web/app.js:204`) — une carte unique contenant un tiret, dans une grille de 5 colonnes.
- **Palier courant** : classe `now` posée chaque seconde depuis `MAP.draw()` (`web/app.js:372-375`) → `web/style.css:142,146`. Donc **le surlignage s'éteint si Leaflet n'a pas pu se construire**.
- **Avant AOS / après LOS** : aucun palier n'est `now`, la grille est visuellement identique à un plan en cours.
- **Écoute seule** : la troisième ligne de chaque carte devient le texte `écoute seule`, dans le même style que `TX 145.9895` (`web/style.css:145`).
- **Chargement** : le conteneur `#plangrid` est vide dans le balisage (`web/index.html:113`), donc le panneau est un titre suivi de rien.
- **Erreur / TLE périmé** : aucun état.

### 4. Pire contenu
- Le nombre de paliers **n'est pas 5**. La grille est figée à `repeat(5,1fr)` (`web/style.css:139`) et le texte d'aide dit `ces 5 mémoires` en dur (`web/index.html:117`), alors que `#planhead` imprime `plan.length`. En VHF (PO-101, downlink 145.900, `data/satellites.json:51`) l'excursion Doppler est d'environ ±3 kHz (README.md:90) → deux à trois paliers seulement, laissant deux à trois cellules vides. Sur IO-117 (passage de plus d'une heure) le compte peut au contraire déborder de la rangée.
- Chaîne d'en-tête la plus longue : `PAS DE 5 kHz · 13 MÉMOIRES` — et `.panel h2{text-transform:uppercase}` (`web/style.css:162`) la rend `PAS DE 5 KHZ · 13 MÉMOIRES`, avec un symbole d'unité déformé.
- Fréquence la plus large : `RX 436.7950` / `TX 145.9895` — 11 caractères.
- Plage horaire : `M-01 · 14:32 → 14:35` en 10 px, `letter-spacing:0.08em`, capitales (`web/style.css:143`).
- Nom de mémoire exporté au maximum : `slice(0, 16)` sur `IO-117-13` — jamais tronqué en pratique, la limite est théorique.

### 5. Ce qui cloche aujourd'hui
- **Une grille fixe pour un contenu variable** : `repeat(5,1fr)` (`web/style.css:139`) contre `plan.length` calculé.
- **Un chiffre en dur dans le texte d'aide** (`web/index.html:117`) qui peut contredire le compte affiché juste au-dessus.
- **Le palier courant est un simple changement de fond** (`rgba(75,227,199,0.07)`, `web/style.css:142`), sans notion de progression : rien ne dit qu'il reste 40 secondes avant le prochain changement, alors que `s.end` est connu.
- **Aucune indication de sens** : on ne voit pas que la fréquence descend (RX) et monte (TX) au fil du passage ; les 5 cartes se lisent comme 5 valeurs indépendantes.
- **`data-i` est posé sur chaque `.step`** (`web/app.js:208`) mais jamais lu — le surlignage repose sur l'ordre du `querySelectorAll` (`web/app.js:372`).
- **L'unité `kHz` est cassée par la mise en capitales du titre** (voir plus haut).
- **Le pied de panneau mélange une action et une explication de 130 caractères** (`web/index.html:115-118`) sur une même ligne `flex` (`web/style.css:343`).

### 6. Questions ouvertes
1. **Quelle forme prend le plan ?** (a) grille de cartes de taille égale ; (b) une réglette temporelle horizontale où la largeur d'un palier vaut sa durée ; (c) une liste verticale chronologique alignée sur l'heure.
2. **Comment se lit le palier courant ?** (a) fond teinté (aujourd'hui) ; (b) une progression visible jusqu'au prochain changement ; (c) le palier courant seul en grand, les autres en aperçu.
3. **Faut-il montrer le sens de dérive ?** (a) non, les valeurs suffisent ; (b) un delta signé par palier (`-5 kHz`) ; (c) une courbe de la fréquence sur la durée du passage.
4. **Où vit l'export CSV ?** (a) en pied de panneau avec son explication ; (b) dans l'en-tête, comme une action de panneau ; (c) rattaché au passage sélectionné plutôt qu'au plan.

---

## 6. En-tête station — priorité **moyenne**

`web/index.html:17-33` · `renderHeader()` `web/app.js:137-150`, horloge `tickClock()` `web/app.js:407-408` · styles `web/style.css:48-71`, `258-267`

### 1. Rôle
Confirmer d'un regard qu'on regarde bien sa propre station, avec des éléments orbitaux assez frais pour que les horaires soient crédibles.

### 2. Données portées
| Élément | id | Producteur | Format réel |
|---|---|---|---|
| Indicatif | `#callsign` | `station.callsign` `web/app.js:139` | `F4MAJ` |
| Locator | `#locatorval` | `station.locator` `web/app.js:140` | `JN37QS` |
| Ville | `#city` | `station.city` `web/app.js:141` | `Illzach`, chaîne vide si absente |
| Antenne | `#antbadge` | `web/app.js:142` | `Antenne omnidirectionnelle fixe · 9 m` (37 caractères) |
| Radio | `#rigbadge` | `station.rig.model` `web/app.js:143` | `Yaesu FTM-500D` |
| État TLE | `#tlestatus` | `web/app.js:144-149` | `132 TLE · maj il y a 2 h`, `+ ' (cache)'` si `stale`, ou `TLE indisponibles` |
| Horloge | `#localclock` | `hhmmssLoc(new Date())` `web/app.js:408` | `14:32:07`, fuseau `station.timezone` |

Source de l'état TLE : `GET /api/tle` renvoie `count`, `age_s`, `stale`, `errors` (`app.py:541-550`).

### 3. États
- **Chargement** : `—`, `—`, `TLE…` du balisage (`web/index.html:19-21`).
- **TLE frais** : classe `tlestat ok` → vert (`web/style.css:265`).
- **TLE en cache / repli** : classe `tlestat warn` + suffixe ` (cache)` (`web/app.js:148-149`). `stale` est vrai aussi bien pour un cache périmé que pour le fichier de secours embarqué (`app.py:547`), deux situations très différentes rendues identiquement.
- **TLE indisponibles** : classe `tlestat bad` (`web/style.css:267`).
- **`age_s === null`** : `'?'` est affiché tel quel → `132 TLE · maj il y a ? h` (`web/app.js:147`).
- **Rafraîchissement en cours** : le bouton `#btn-refresh` prend le texte `...` (`web/app.js:780`) et le reprend à la fin — pas d'état désactivé, un double clic relance deux requêtes.
- **Station non configurée** : `station.configured === false` ouvre la modale (`web/app.js:439`), l'en-tête affichant entre-temps les valeurs par défaut de `app.py:120-126`.

### 4. Pire contenu
- Badge le plus long : `Antenne omnidirectionnelle fixe · 9 m`, 37 caractères en 11 px (`web/style.css:64-68`) — soit près de deux fois la largeur de `Yaesu FTM-500D`.
- État TLE le plus long : `132 TLE · maj il y a 168 h (cache)`.
- Indicatif le plus long possible : un indicatif spécial français (`TM100XYZ`, 8 caractères) — le champ `#s-loc` est plafonné à 8 (`web/index.html:180`) mais `#s-call` ne l'est pas.
- L'horloge est fixe à 8 caractères en 26 px mono tabulaire (`web/style.css:70`).
- Aucune valeur négative dans ce composant.

### 5. Ce qui cloche aujourd'hui
- **Le badge TLE perd toute sa chrome dès la première donnée.** `#tlestatus` est déclaré `class="badge"` (`web/index.html:21`) mais `renderHeader()` écrase l'attribut : `el.className = 'tlestat ' + …` (`web/app.js:146,149`). Or `web/style.css` ne définit **que** `.tlestat.ok`, `.tlestat.warn` et `.tlestat.bad` (lignes 265-267), c'est-à-dire une couleur et une couleur de bordure — sans `.badge`, il n'y a plus ni padding, ni bordure, ni rayon, ni taille de police. Au chargement le badge est une pastille, une seconde plus tard c'est du texte nu coloré.
- **Cinq objets alignés au même niveau** dans `.badges` (`web/index.html:18-24`) : deux badges d'inventaire, un indicateur d'état, et deux boutons — même taille, même bordure, même hauteur (`.badge` et `.btn` partagent `font-size:11px`, `web/style.css:65,258`). Rien ne sépare ce qui informe de ce qui agit.
- **Le bouton « Rafraîchir TLE » n'a pas d'icône** (`web/index.html:22`) alors que `Refresh` est préchargé dans le manifeste (`web/icons.js:25`) — inconsistance avec « Réglages » juste à côté qui porte `Setting`.
- **L'indicatif est le seul élément à porter une lueur** (`text-shadow:0 0 18px`, `web/style.css:59`) et la seule occurrence de `--disp` à 22 px dans l'en-tête.
- **`errors` de `/api/tle` n'est jamais lue** (`app.py:548`) : quand une des deux sources CelesTrak échoue, l'en-tête affiche un compte réduit sans dire pourquoi.
- **L'horloge affiche l'heure locale sans nommer le fuseau**, alors que le tableau des passages affiche simultanément local et UTC.

### 6. Questions ouvertes
1. **Que porte l'en-tête ?** (a) identité + inventaire + état + actions comme aujourd'hui ; (b) identité + état de fraîcheur seuls, l'inventaire descendant vers la bande matériel ; (c) une ligne d'état système unique, l'identité passant en titre de page.
2. **Comment se distingue une action d'un badge ?** (a) forme identique, couleur différente ; (b) formes franchement différentes ; (c) les actions regroupées à part.
3. **Comment se dit la fraîcheur des TLE ?** (a) texte comme aujourd'hui ; (b) un indicateur gradué (frais / en cache / secours / absent, quatre états réellement distincts) ; (c) l'âge en clair avec l'heure du dernier relevé.
4. **L'horloge locale mérite-t-elle 26 px ?** (a) oui, c'est la référence des horaires de passage ; (b) non, elle redouble l'horloge du système d'exploitation ; (c) oui, mais couplée à l'UTC puisque les deux sont affichés ailleurs.

---

## 7. Statut radio de l'ISS — priorité **moyenne**

`web/index.html:104-109` · `loadIssStatus()` `web/app.js:537-574`, `applyIssOverrides()` `web/app.js:577-603` · analyse serveur `parse_iss_status()` `app.py:294-357` · styles `web/style.css:329-342`

### 1. Rôle
Savoir avant le passage si la radio de l'ISS est réellement en service, et sur quelle fréquence — l'APRS bascule entre 145.825 et 437.825 selon la radio de bord (README.md:20).

### 2. Données portées
Grille de 4 colonnes (`web/style.css:329`), ordre imposé `['aprs','repeater','voice','sstv']` (`web/app.js:545`).

Par carte (`web/app.js:553-559`) :
- `.statepill` : `ISS_STATE_LABEL[m.state]` (`web/app.js:535`) → `EN SERVICE`, `HORS SERVICE`, `PROGRAMMÉ`, `AU REPOS`, `INCONNU`.
- `.lab` : `m.label` produit par le serveur — `APRS / Digipeater (RS0ISS)`, `Répéteur FM voix (NA1SS)`, `Voix ARISS (contacts scolaires)`, `SSTV (images)` (`app.py:325,310,348,338`).
- `.fq` : `mhz(m.freq)`, ou `mhz(m.down) + ' / ' + mhz(m.up)`, ou `—` ; suffixe ` · PL 67.0` si `ctcss` (`web/app.js:555,557`).
- `.ex` : `m.excerpt` — **texte anglais brut de la page ARISS, coupé à 300 caractères** (`app.py:315,328,341,351`).
- Carte supplémentaire « COUPURES » si `data.outages` est non vide (`web/app.js:562-567`) : jusqu'à 6 extraits `power down/up` d'au plus 90 caractères, joints par `<br>` (`app.py:355-357`).
- `#isscheck` : `'RELEVÉ IL Y A ' + n + ' MIN'` ou `NON RELEVÉ`, suffixe ` · CACHE` si `stale` (`web/app.js:569-571`).
- Source : lien statique vers ariss.org (`web/index.html:108`).

### 3. États
- **Chargement** : `<div class="issmode">Chargement…</div>` (`web/index.html:106`) — une carte sans pastille ni structure, écrasée au premier rendu.
- **Statut indisponible / erreur réseau** : une carte unique `INCONNU` + `Statut ARISS indisponible` + `data.error` ou `Page non lue. Vérifie la connexion de JB-SERVER.` (`web/app.js:549-551`), seule dans une grille de 4 colonnes.
- **Cinq états de mode** pour **quatre** styles de pastille : `.statepill.idle` et `.statepill.unknown` partagent la même règle (`web/style.css:340`), donc `AU REPOS` et `INCONNU` sont visuellement identiques alors qu'ils disent des choses opposées (« la radio va bien, elle ne trafique pas » vs « on ne sait pas »).
- **Cache** : suffixe ` · CACHE` dans le tag d'en-tête, aucune marque sur les cartes elles-mêmes.
- **Nombre de cartes variable** : de 1 à 5 (4 modes + coupures) dans une grille figée à 4 colonnes.
- **Répercussion sur le reste de l'interface** : `applyIssOverrides()` réécrit `iss.modes` et remonte le mode actif en tête (`web/app.js:600-601`), mais le tableau des passages ne se recompose qu'au prochain `computeAll()` (15 min, `web/app.js:456`) — `renderPassTable()`/`renderNextPass()` appelés ligne 602 réutilisent les objets `p.mode` capturés au calcul précédent.

### 4. Pire contenu
- `excerpt` : 300 caractères d'anglais non traduit, rendus en 10,5 px `--ink-2` (`web/style.css:334`). C'est le bloc de texte le plus long de toute l'interface.
- Libellé le plus long : `Voix ARISS (contacts scolaires)` (31 caractères) sur une carte d'un quart de largeur.
- Pastille la plus longue : `HORS SERVICE` (12 caractères) en 10 px avec `letter-spacing:0.05em` (`web/style.css:335`).
- Fréquence la plus large : `145.9900 / 437.8000` (mode repeater avec `up` et `down`, `web/app.js:555`) — 19 caractères dans une cellule de quart de largeur.
- Carte « COUPURES » : jusqu'à 6 lignes de 90 caractères, soit ~540 caractères dans une cellule dimensionnée comme les autres.

### 5. Ce qui cloche aujourd'hui
- **Une interface française qui affiche 300 caractères d'anglais brut par carte.** C'est structurel : `app.py` extrait le contexte textuel de la page ARISS sans le traduire.
- **`AU REPOS` et `INCONNU` ont exactement le même rendu** (`web/style.css:340`).
- **Quatre colonnes fixes pour un contenu de 1 à 5 cartes** (`web/style.css:329-330`) : l'état d'erreur produit une carte seule occupant un quart de la largeur.
- **`.lab` est le seul endroit de l'interface qui utilise `--body` en gras** dans une carte de données (`web/style.css:332`), alors que `.fq` juste en dessous est en mono 15 px : deux familles dans un bloc de 12 lignes.
- **Le tag `#isscheck` est mis en capitales par le JS** (`web/app.js:570-571`) alors que `.panel h2` applique déjà `text-transform:uppercase` (`web/style.css:162`) — double majusculisation, et la valeur `MIN` devient indistinguable d'une unité.
- **La hauteur des cartes est dictée par la plus longue `excerpt`**, sans `line-clamp` : une carte peut faire trois fois la hauteur de sa voisine.
- **La carte « COUPURES » est une carte de mode**, avec la même pastille et la même structure, alors qu'elle ne décrit pas un mode.

### 6. Questions ouvertes
1. **Que fait-on de l'extrait ARISS ?** (a) affiché intégralement comme aujourd'hui ; (b) tronqué à une ligne avec dépliant ; (c) supprimé de la carte, remplacé par le lien vers la source, l'état seul restant.
2. **Combien d'états visuels distincts ?** (a) cinq réellement distingués ; (b) trois — en service / pas en service / inconnu ; (c) deux — exploitable ou non — l'exactitude passant dans le texte.
3. **Le panneau ISS est-il un panneau ou une extension du tableau des passages ?** (a) panneau autonome (aujourd'hui) ; (b) l'état remonte dans la ligne ISS du tableau et dans le hero ; (c) les deux, avec une seule source visuelle d'état.
4. **Comment se dit la fraîcheur du relevé ?** (a) tag d'en-tête (aujourd'hui) ; (b) horodatage par carte ; (c) un seul indicateur de fraîcheur pour toutes les données externes de la page (TLE, ISS, météo).

---

## 8. Tracé polaire Az/El — priorité **moyenne**

`web/index.html:97-102` · `drawPolar()` `web/app.js:606-663` · styles `web/style.css:204-213`, `271`

### 1. Rôle
Voir la forme du passage : par où le satellite entre, où il culmine, et s'il traverse le cône de silence de l'omni verticale.

### 2. Données portées
Rendu en **canvas** 600×600 (`web/index.html:99`), redessiné chaque seconde (`web/app.js:455`) :
- Cercles d'élévation à 0°, 30°, 60° (`web/app.js:617`), croix cardinale, projection `r = (90 - el)/90 · R` (`web/app.js:611-614`).
- Cône de silence : disque pointillé de rayon `(90 - cone)/90 · R`, `cone = station.antenna.cone_of_silence_deg` = 75 (`web/app.js:622-625`, `data/station.json:12`).
- Points cardinaux `N S E O` en `600 22px JetBrains Mono` (`web/app.js:627-629`).
- Trajectoire : 121 points échantillonnés entre AOS et LOS, mis en cache par passage (`S.polarPath` / `S.polarPathFor`, `web/app.js:633-641`), tracés en `#4be3c7` épaisseur 5.
- Marqueurs AOS (plein `#4be3c7`) et LOS (`#245a52`), étiquetés `AOS` / `LOS` en `500 18px` (`web/app.js:645-652`).
- Position courante : disque ambre avec `shadowBlur` de 14, **uniquement si `now` est entre AOS et LOS et `el > 0`** (`web/app.js:654-662`).
- Note fixe sous le tracé : 168 caractères de texte statique (`web/index.html:100`).

### 3. États
- **Aucune sélection** : la grille est dessinée, `return` avant la trajectoire (`web/app.js:630`) — un cadran vide, sans texte.
- **Passage à venir** : trajectoire tracée, pas de point ambre.
- **Passage en cours** : point ambre. C'est le seul état différencié.
- **Passage terminé** : identique à « à venir ».
- **Propagation en échec** : `stateAt` renvoie `null`, les points sont simplement omis de `pts` (`web/app.js:638`) — la trajectoire peut être partielle sans marque.
- **Canvas non pris en charge / satellite.js absent** : `boot()` sort avant (`web/app.js:440-444`), le canvas reste vide.

### 4. Pire contenu
- Passage à 89° : la trajectoire traverse le disque du cône de silence de part en part, et le point ambre passe **sous** le cercle pointillé — c'est le cas que le produit existe pour signaler (README.md:16) et rien dans le tracé ne le nomme.
- Passage à 5° : la trajectoire est un arc collé au cercle extérieur, les pastilles AOS/LOS de rayon 8 px et leurs étiquettes se recouvrent (`web/app.js:648-651`).
- Passage IO-117 de plus d'une heure : 121 points sur une trajectoire lente — pas de problème géométrique, mais aucune notion de temps le long du tracé.
- Note statique la plus longue de la page (168 caractères) en 11 px ambre (`web/style.css:208-212`).

### 5. Ce qui cloche aujourd'hui
- **Du CSS mort** : `svg.polar{...}` et `.polar text{...}` (`web/style.css:206-207`) visent un élément SVG qui n'existe pas — le tracé est un `<canvas id="polar">` (`web/index.html:99`), stylé plus bas par `#polar` (`web/style.css:271`).
- **Six couleurs codées en dur dans le canvas** (`#1e2c46`, `#5a3f1c`, `rgba(255,180,84,0.07)`, `#5b7085`, `#4be3c7`, `#245a52`, `#ffb454`, `web/app.js:616-660`) : aucune ne lit les tokens CSS, donc un changement de palette ne touchera pas ce composant.
- **Polices déclarées en dur dans le canvas** (`'600 22px JetBrains Mono, monospace'`, `web/app.js:627`) — même problème.
- **Le canvas est en 600×600 fixes** redimensionné par CSS à `max-width:340px` (`web/style.css:271`), sans prise en compte de `devicePixelRatio`.
- **Redessiné intégralement chaque seconde** (`web/app.js:455`) alors que seul le point de position change ; la trajectoire est déjà mise en cache, pas le rendu.
- **Le cône de silence est dessiné mais jamais nommé dans le tracé** : son explication est un paragraphe de texte sous le cadran (`web/index.html:100`), lié au dessin par rien d'autre qu'une pastille ambre décorative (`web/style.css:213`).
- **Le titre `<h2>` porte un style en ligne** `style="align-self:flex-start;"` (`web/index.html:98`), seul cas de la page.

### 6. Questions ouvertes
1. **Que doit-on lire en premier sur le cadran ?** (a) la forme de la trajectoire ; (b) la position courante ; (c) le rapport entre la trajectoire et le cône de silence.
2. **Le cône de silence doit-il être une zone ou un avertissement ?** (a) zone pointillée comme aujourd'hui, expliquée en dessous ; (b) zone + étiquette dans le cadran ; (c) zone discrète, l'avertissement passant dans la note de qualité du hero quand le passage la traverse.
3. **Faut-il du temps sur la trajectoire ?** (a) non ; (b) des graduations toutes les N minutes ; (c) l'heure aux points AOS, TCA et LOS.
4. **Canvas ou SVG ?** (a) canvas, tokens et polices lus depuis le CSS calculé ; (b) SVG, stylé par la feuille comme le reste (et le CSS mort redevient utile) ; (c) canvas avec prise en charge du `devicePixelRatio`.

---

## 9. Bandeau d'état — priorité **moyenne**

`web/index.html:35` · alimenté par `computeAll()` `web/app.js:514-515` et par `boot()` `web/app.js:441-462` · styles `web/style.css:73-79`, `268-269`

### 1. Rôle
Dire ce qui manque : quels satellites n'ont pas d'éléments orbitaux, combien de passages ont été trouvés, et pourquoi l'application ne démarre pas.

### 2. Données portées
Un seul élément `#banner` qui sert à trois usages :
- `<span class="dot">` décoratif, toujours présent (`web/index.html:35`).
- `#missing` : `'TLE absents : ' + missing.join(', ')` où `missing` contient les **noms complets** (`web/app.js:497,514`), ou chaîne vide.
- `#passcount` : `all.length + ' passages / ' + hours + ' h'` (`web/app.js:515`), poussé à droite par `margin-left:auto` (`web/style.css:269`).
- **Ou bien** : `textContent` du bandeau entier écrasé par un message d'erreur, ce qui **détruit les trois enfants** (`web/app.js:441`, `446`, `461`), avec classe `previewtag bad` (`web/style.css:268`).

### 3. États
- **Normal** : `● TLE absents : … 47 passages / 48 h` — ambre sur bordure tiretée ambre (`web/style.css:73-78`).
- **Rien à signaler** : `#missing` vide → il reste la pastille et le compteur, dans un cadre ambre tiretée qui signale une alerte pour une information neutre.
- **satellite.js absent** : message de 118 caractères (`web/app.js:441`), classe `bad`.
- **Leaflet absent** : message de 112 caractères (`web/app.js:446`), classe `bad`.
- **Erreur de démarrage** : `'Erreur de démarrage : ' + e.message` (`web/app.js:461`) — c'est ici qu'atterrit le `TypeError` de `selectPass(null)` quand aucun passage n'est trouvé.
- **Après un message d'erreur** : les `<span>` étant supprimés, un `computeAll()` ultérieur écrira dans des nœuds détachés — le bandeau reste bloqué sur l'erreur.
- **Erreurs TLE partielles** : `/api/tle` renvoie `errors` (`app.py:548`), jamais lu par le client.

### 4. Pire contenu
- Les 9 satellites sans TLE, noms complets, 182 caractères :
  `TLE absents : ISS (ZARYA), SO-50 (SaudiSat 1C), AO-91 (RadFxSat / Fox-1B), PO-101 (Diwata-2B), RS-44 (DOSAAF-85), FO-29 (JAS-2), AO-73 (FUNcube-1), AO-7 (OSCAR 7), IO-117 (GreenCube)`
  en 11 px, sur une seule ligne `flex` avec le compteur poussé à droite.
- Message d'erreur le plus long (118 caractères) :
  `satellite.js non chargé : le serveur n'a pas pu le télécharger. Vérifie la connexion internet de JB-SERVER puis recharge.`
- Compteur maximal : sur 9 satellites et 48 h, plusieurs centaines de passages — `327 passages / 48 h` — alors que le tableau n'en montre que 40.
- Compteur minimal : `0 passages / 48 h`, état dans lequel l'application plante par ailleurs (voir composant 1).

### 5. Ce qui cloche aujourd'hui
- **Un seul élément pour trois messages de nature différente** : un inventaire, un comptage et une erreur fatale. Le seul traitement différenciant est la classe `bad` (`web/style.css:268`).
- **L'écriture du message d'erreur détruit la structure** (`textContent` sur le parent), rendant l'état irréversible sans rechargement.
- **Le cadre ambre tiretée est toujours affiché**, même quand il n'y a rien à signaler : l'alerte est l'état par défaut.
- **Le nom complet est utilisé ici et nulle part ailleurs** : `ISS (ZARYA)` dans le bandeau, `ISS` partout ailleurs.
- **Le compteur contredit le tableau** (327 annoncés, 40 affichés).
- **La classe s'appelle `previewtag`** — vestige d'une maquette, sans rapport avec la fonction.

### 6. Questions ouvertes
1. **Un bandeau ou plusieurs ?** (a) un seul, avec des variantes de gravité ; (b) l'inventaire et le comptage rattachés au tableau des passages, le bandeau réservé aux erreurs ; (c) pas de bandeau, chaque information rejoignant le composant qu'elle concerne.
2. **Quelle est la place du comptage ?** (a) dans le bandeau ; (b) dans le titre du tableau ; (c) nulle part, la longueur de la liste étant sa propre mesure.
3. **Comment se dit une erreur fatale ?** (a) bandeau coloré (aujourd'hui) ; (b) un état de page entier, les panneaux inertes étant grisés ; (c) un panneau d'erreur qui remplace le contenu concerné.
4. **Faut-il un état « rien à signaler » ?** (a) le bandeau disparaît ; (b) il reste, en neutre ; (c) il devient une confirmation positive (`9 satellites suivis`).

---

## 10. Pictogrammes météo sur la carte — priorité **basse**

`MAP.setWeather()` `web/app.js:380-400` · `loadWeather()` `web/app.js:526-532` · serveur `refresh_weather()` `app.py:243-281`, table `WMO` `app.py:93-105` · styles `web/style.css:117-119`, `385`

### 1. Rôle
Savoir, sans quitter la carte, si le ciel au-dessus de la station va gêner (ou si l'antenne va prendre la pluie) — un ou deux pictogrammes, pas une page météo (README.md:13).

### 2. Données portées
Deux marqueurs Leaflet au maximum, ancrés sur la station, `iconAnchor` `[18,44]` pour « maintenant » et `[-2,44]` pour « bientôt » (`web/app.js:398-399`) :
- Icône : `Icons.html(p.icon, {size: 22})` où `p.icon` est un nom Reicon Filled fourni par le serveur (`app.py:239`, table `WMO` `app.py:93-105`) : `Sun`, `CloudSun`, `Cloud`, `CloudFog`, `CloudDrizzle`, `CloudRain`, `CloudSnow`, `CloudLightning`, `CloudStorm`, `CloudBolt`.
- Température : `Math.round(p.temp) + '°'` ou `—` (`web/app.js:389`).
- Popup : `label` (français, `app.py:93-105`), `temp.toFixed(1) + ' °C'`, `vent ' + Math.round(p.wind) + ' km/h'`, `nébulosité ' + p.cloud + ' %'` (`web/app.js:391-394`).
- Le second pictogramme n'existe que si le code météo change dans les 3 h (`WEATHER_SOON_HOURS`, `app.py:236,264`) ; son libellé de popup est `Dans 3 h` (`web/app.js:399`).

### 3. États
- **Chargement** : aucun marqueur.
- **Erreur réseau** : `loadWeather()` fabrique `{now:null, later:null, error}` (`web/app.js:529`), `setWeather` sort sur `!data.now` (`web/app.js:383`) → **rien ne s'affiche et rien ne le dit**. `S.weather` est stocké (`web/app.js:530`) et jamais relu.
- **Cache périmé** : `app.py:277` positionne `stale: true`, jamais lu côté client.
- **Code météo inconnu** : `WMO.get(code, ("Inconnu", "Cloud"))` (`app.py:239`) → pictogramme nuage + libellé `Inconnu`.
- **Icône Reicon indisponible** : `Icons.html()` renvoie un `<span class="ic">` vide (`web/icons.js:66-74`) — un carré de 22 px vide, la température restant seule (README.md:139).
- **Carte absente** : `setWeather` sort sur `!map` (`web/app.js:381`).

### 4. Pire contenu
- Libellé de popup le plus long : `Orage violent + grêle` (`app.py:104`) ou `Bruine verglaçante forte` (`app.py:97`), 24 caractères.
- Température négative : `-12°` sous le pictogramme en 10 px (`web/style.css:119`) — quatre caractères là où l'implantation suppose deux ou trois.
- Deux pictogrammes ancrés à 46 px l'un de l'autre verticalement, tous deux au-dessus du marqueur station qui porte déjà l'icône `Home` et l'indicatif `F4MAJ` (`web/app.js:265`) — trois objets superposés au même point géographique.
- Popup la plus longue : `Partiellement nuageux` + `12.4 °C · vent 23 km/h` + `nébulosité 78 %`, sur trois lignes.

### 5. Ce qui cloche aujourd'hui
- **Aucun état d'échec visible** : météo absente et météo par ciel dégagé se ressemblent (dans le second cas il y a un soleil, dans le premier rien du tout — mais rien ne le dit).
- **`.wx-icon{opacity:0.68}`** (`web/style.css:117`) sur un fond de tuiles satellite variable : la lisibilité dépend entièrement de ce qu'il y a sous la station.
- **Trois couleurs pour la même famille d'objets** : icône météo en `--amber` (`web/style.css:385`), température en `--ink-0` (`web/style.css:119`), icône de légende météo en `--ink-1` (`web/style.css:383`).
- **La lisibilité repose sur des `text-shadow` empilés** (`0 0 4px #000, 0 0 4px #000`, `web/style.css:119`) plutôt que sur un fond.
- **`TriangleWarning` est préchargée** (`web/icons.js:28`) et n'est utilisée nulle part dans `web/index.html` ni `web/app.js` — vestige d'un état d'alerte météo qui n'existe pas.

### 6. Questions ouvertes
1. **La météo appartient-elle à la carte ?** (a) oui, ancrée à la station (aujourd'hui) ; (b) non, une cellule du bandeau de lectures ; (c) oui, mais dans un coin fixe du cadre plutôt que sur la géographie.
2. **Un ou deux pictogrammes ?** (a) deux quand ça change (aujourd'hui) ; (b) un seul, l'évolution passant en texte ; (c) une petite série horaire.
3. **Comment se dit « météo indisponible » ?** (a) rien ; (b) un pictogramme d'état ; (c) la cellule/le coin affiche explicitement l'échec et l'âge de la dernière valeur.

---

## 11. Journal de trafic (QSO) — priorité **basse**

`web/index.html:136-149` · `saveQso()` `web/app.js:666-684` · styles `web/style.css:345-348`

### 1. Rôle
Consigner un contact juste après l'avoir fait, sans quitter l'écran de suivi, et récupérer l'ADIF pour un logiciel de journal.

### 2. Données portées
Cinq champs texte sur une ligne `flex` (`web/style.css:345`), plus deux actions :
- `#q-call` → `body.call`, forcé en capitales à l'envoi (`web/app.js:669`), obligatoire (`web/app.js:679`).
- `#q-grid` → `body.grid`, aucune validation (contrairement au locator de la modale, validé par `locatorToLatLon()` `web/app.js:690`).
- `#q-rsts` / `#q-rstr` → `rst_s` / `rst_r`, pré-remplis à `59` en dur (`web/index.html:141-142`).
- `#q-note` → `body.note`.
- Champs **dérivés du passage sélectionné**, invisibles dans le formulaire (`web/app.js:673-677`) : `sat` = `p.sat.id`, `mode` = `SSB` si `type === 'linear'` sinon `FM`, `freq` = `mhz(p.mode.down)`, `band` = `70CM` si `down > 300` sinon `2M`.
- `#qsomsg` : `'QSO enregistré : ' + call`, effacé après 4 s (`web/app.js:682-683`).
- Lien ADIF statique vers `/api/qso.adi` (`web/index.html:145`).

### 3. États
- **Repos** : cinq champs, deux boutons, message vide.
- **Indicatif vide** : `return` silencieux (`web/app.js:679`) — le clic ne fait **rien**, aucun retour visuel.
- **Envoi en cours** : aucun état ; `await fetch` sans `try/catch` (`web/app.js:680`).
- **Échec réseau** : la promesse rejette, `#qsomsg` n'est jamais écrit, les champs **ne sont pas vidés** — indiscernable d'un clic sans effet.
- **Succès** : `#qsomsg` pendant 4 s, `#q-call`, `#q-grid`, `#q-note` vidés, `#q-rsts`/`#q-rstr` conservés (`web/app.js:681`).
- **Aucun passage sélectionné** : `sat`, `freq`, `band` partent vides, sans avertissement.
- **Aucune relecture** : `GET /api/qso` existe (`app.py:568-569`) et n'est **jamais appelée** par le client. On peut écrire dans le journal, jamais le consulter dans l'interface.
- **Aucune validation clavier** : il n'existe plus aucun gestionnaire `keydown`/`keypress` dans `web/app.js`. Celui de la modale, ajouté en `9255ed1`, a été retiré en `1b4772d` — Entrée ne valide donc ni ce formulaire ni la modale.

### 4. Pire contenu
- Indicatif le plus long réaliste : un indicatif portable composé, `SV9/OK1ABC/P` (12 caractères) dans un champ de 130 px à 12 px mono (`web/style.css:347`).
- Note : longueur libre, dans le même champ de 130 px que l'indicatif.
- Message de confirmation le plus long : `QSO enregistré : SV9/OK1ABC/P` en 10,5 px `--ink-2` (`web/style.css:344`).
- Sept objets sur une ligne `flex-wrap` : cinq champs de 130 px + deux boutons + le message — le repliage se fait n'importe où selon la largeur.

### 5. Ce qui cloche aujourd'hui
- **Cinq champs de largeur identique** (`width:130px`, `web/style.css:347`) pour des contenus de longueurs très différentes (`59` contre une note libre).
- **Aucune étiquette** : seulement des `placeholder` (`web/index.html:139-143`), qui disparaissent à la saisie.
- **Le contexte est invisible** : le QSO est enregistré avec le satellite, la fréquence et la bande du passage sélectionné, sans que le formulaire ne le montre nulle part.
- **L'échec est indistinguable du silence** : pas de `try/catch`, pas d'état désactivé, pas de message d'erreur.
- **Le message de confirmation est le texte le plus discret du panneau** (`.hint`, 10,5 px, `--ink-2`).
- **Un formulaire d'écriture sans lecture** : le panneau s'appelle « Journal de trafic » et n'affiche aucun journal.
- **Le tag d'en-tête `EXPORT ADIF`** (`web/index.html:137`) décrit une action qui se trouve dans le corps du panneau, pas dans l'en-tête.

### 6. Questions ouvertes
1. **Le panneau doit-il montrer les QSO enregistrés ?** (a) non, formulaire seul ; (b) les 5 derniers ; (c) la liste complète du passage en cours.
2. **Comment se dit le contexte capté automatiquement ?** (a) invisible (aujourd'hui) ; (b) une ligne de contexte au-dessus du formulaire (`SO-50 · 436.7950 · FM · 70CM`) ; (c) des champs pré-remplis et modifiables.
3. **Étiquettes ou placeholders ?** (a) placeholders ; (b) étiquettes au-dessus ; (c) étiquettes flottantes.
4. **Quelle forme pour la confirmation et l'erreur ?** (a) texte à côté du bouton ; (b) l'état porté par le bouton lui-même ; (c) la ligne enregistrée apparaît dans la liste, ce qui vaut confirmation.

---

## 12. Modale de configuration — priorité **basse**

`web/index.html:168-201` · `openSetup()` / `updateSetupPreview()` / `saveSetup()` `web/app.js:705-774` · styles `web/style.css:350-374`

### 1. Rôle
Au premier lancement, transformer un indicatif et un locator en une station calculée ; ensuite, corriger ces quatre valeurs.

### 2. Données portées
- `#s-call` → `callsign`, `.trim().toUpperCase()` (`web/app.js:726`), obligatoire.
- `#s-loc` → `locator`, `maxlength="8"` (`web/index.html:180`), validé par `locatorToLatLon()` contre `/^[A-R]{2}[0-9]{2}([A-X]{2})?$/` (`web/app.js:690`).
- `#s-city` → `city`, libre.
- `#s-tz` → `timezone`, libre, valeur par défaut `Europe/Paris` (`web/index.html:190`), **non validée** (`web/app.js:729`).
- `#s-preview` : `'Position calculée : ' + lat.toFixed(4) + '°, ' + lon.toFixed(4) + '°'` (`web/app.js:721`), recalculé à chaque frappe (`web/app.js:789`).
- `#s-error` : `Indicatif requis.`, `Locator invalide (ex. JN37QS).`, `Échec de l'enregistrement : ' + e.message` (`web/app.js:731,732,747`).
- Aide de pied : renvoi à `data/station.json` pour l'antenne et la radio (`web/index.html:200`).

### 3. États
- **Premier lancement** (`configured === false`, `web/app.js:439`) : `openSetup(true)` vide les champs et **masque « Annuler »** (`web/app.js:707-713`) — modale non refermable.
- **Réglages** : `openSetup(false)`, champs pré-remplis, « Annuler » visible.
- **Saisie** : aperçu de position mis à jour en direct, vide tant que le locator est invalide.
- **Enregistrement en cours** : les deux boutons désactivés, libellé `Enregistrement...` (`web/app.js:736-737`).
- **Succès** : `✓ Enregistré` + `Configuration enregistrée.` dans l'aperçu, fermeture après 900 ms (`web/app.js:754-773`).
- **Échec réseau** : message dans `#s-error`, boutons réactivés (`web/app.js:746-751`).
- **Erreur post-enregistrement** : `renderHeader()`/`computeAll()` sont enveloppés dans leur propre `try` (`web/app.js:757-767`) — la sauvegarde est confirmée même si le recalcul échoue, et l'échec ne va que dans la console.
- **Fermeture** : uniquement par « Annuler » ou après succès. **Ni Échap, ni clic sur le voile, ni piège de focus, ni `autofocus`** — aucun gestionnaire clavier ne subsiste dans `web/app.js` (retiré en `1b4772d`).
- **Fuseau invalide** : accepté sans contrôle ; `hhmmssLoc()` (`web/app.js:16`) lèvera alors une `RangeError` à chaque tic d'horloge, dans `tickClock()` qui n'a pas de `try/catch` (`web/app.js:406`).

### 4. Pire contenu
- Locator à 8 caractères autorisé par le balisage (`maxlength="8"`) alors que l'expression n'accepte que 4 ou 6 caractères : `JN37QS12` est saisissable et refusé sans que le champ n'indique la longueur attendue.
- Message d'erreur le plus long : `Échec de l'enregistrement : Failed to fetch` (43 caractères) dans un bloc de `min-height:16px` (`web/style.css:371`).
- Aperçu à sa largeur maximale : `Position calculée : -37.8142°, -175.4583°` (latitude et longitude négatives, 4 décimales).
- Aide de pied : 84 caractères avec un `<code>` en ligne (`web/index.html:200`, `web/style.css:373-374`).
- Fuseau le plus long plausible : `America/Argentina/Buenos_Aires` (30 caractères).

### 5. Ce qui cloche aujourd'hui
- **Aucune sortie clavier** : Échap ne ferme pas, Entrée ne valide pas, le focus n'est pas piégé, aucun champ n'est focalisé à l'ouverture.
- **Un champ libre pour une valeur énumérée** : le fuseau horaire est un texte non validé alors qu'il casse l'horloge et tous les horaires de passage s'il est erroné.
- **Deux zones de message empilées** (`#s-preview` puis `#s-error`, `web/index.html:191-192`) réservant chacune 16 px, soit 32 px de vide dans l'état nominal.
- **L'aperçu sert à deux choses** : la position calculée, puis la confirmation d'enregistrement (`web/app.js:755`).
- **Le succès est signalé par un `✓` textuel** dans le libellé du bouton (`web/app.js:754`) alors que la banque Reicon est disponible et que `Save` est déjà utilisée ailleurs (`web/index.html:144`).
- **Le premier lancement et la modification partagent la même modale** avec pour seule différence un bouton masqué (`web/app.js:713`) — pas de texte d'accueil distinct, alors que `.modal-intro` existe (`web/index.html:171`).
- **Le renvoi vers `data/station.json`** (`web/index.html:200`) suppose un accès au système de fichiers du serveur, ce qui n'est pas le cas depuis un navigateur distant — le README décrit pourtant un usage réseau (README.md:4).

### 6. Questions ouvertes
1. **Premier lancement et réglages : une modale ou deux écrans ?** (a) une modale avec un bouton masqué (aujourd'hui) ; (b) un accueil plein écran pour le premier lancement, une modale pour les réglages ; (c) une page de réglages, pas de modale du tout.
2. **Comment se saisit un fuseau ?** (a) texte libre ; (b) liste déroulante des fuseaux du navigateur ; (c) détection automatique avec possibilité de corriger.
3. **Comment se confirme la position calculée ?** (a) une ligne de texte (aujourd'hui) ; (b) une mini-carte ; (c) le nom de la case Maidenhead + la distance au centre.
4. **Que devient le renvoi à `station.json` ?** (a) conservé tel quel ; (b) les réglages avancés entrent dans la modale ; (c) le renvoi devient une explication de ce qui n'est pas modifiable ici et pourquoi.

---

## 13. Pied de page : bande matériel + mentions — priorité **basse**

`web/index.html:150-165` · styles `web/style.css:237-255`

### 1. Rôle
Rappeler avec quoi la station travaille et d'où viennent les données.

### 2. Données portées
**Aucune donnée dynamique.** Trois cartes entièrement écrites en dur (`web/index.html:151-164`) :
- Antenne : icône `SignalStream`, `Omnidirectionnelle fixe · 9 m sol`, `Pas de rotor — aucune orientation à faire`.
- Transceiver : icône `Radio`, `Yaesu FTM-500D`, `Doppler à la molette (pas de CAT)`.
- Interface : icône `Sliders`, `Digirig Mobile`, `Audio + PTT — APRS, SSTV, télémétrie`.

Puis un `<footer>` de deux lignes (`web/index.html:165`) : sources (CelesTrak, ARISS, satellite.js) et mention de copyright.

### 3. États
Un seul. Aucun état de chargement, d'erreur ou de configuration.

### 4. Pire contenu
- Ligne la plus longue : `Audio + PTT — APRS, SSTV, télémétrie` en 11 px mono `--ink-2` (`web/style.css:249`).
- Le `<footer>` est une phrase de 110 caractères coupée par un `<br>` codé en dur, centrée : sur écran étroit elle se replie sur trois ou quatre lignes de longueurs arbitraires.

### 5. Ce qui cloche aujourd'hui
- **Trois valeurs dupliquées et désynchronisables.** `Omnidirectionnelle fixe · 9 m sol` et `Yaesu FTM-500D` sont écrits en dur ici alors que `renderHeader()` rend déjà `station.antenna.type`, `antenna.height_m` et `rig.model` dans les badges (`web/app.js:142-143`). Si l'utilisateur modifie `data/station.json` — ce que l'aide de la modale lui recommande explicitement (`web/index.html:200`) — l'en-tête change et la bande matériel ment.
- **Quatre champs de `data/station.json` ne sont lus par personne** : `antenna.rotor`, `rig.cat`, `rig.soundcard` (`data/station.json:11,16,17`) sont pourtant exactement les trois informations que ces cartes racontent en prose, et `horizon_deg` (`data/station.json:21`) n'est utilisé nulle part dans `web/app.js`.
- **Les trois cartes n'ont ni cadre ni fond**, seulement une pastille d'icône (`web/style.css:242-247`) : elles flottent entre le tableau QSO et le pied de page sans appartenance visuelle.
- **Deux familles typographiques par carte** : titre en `--body` gras, corps en mono (`web/style.css:248-249`).
- **Le `<br>` du footer** impose une coupure qui ne correspond à aucune largeur particulière.

### 6. Questions ouvertes
1. **La bande matériel doit-elle exister ?** (a) oui, telle quelle ; (b) oui, mais alimentée par `station.json` ; (c) non — l'inventaire vit déjà dans les badges de l'en-tête.
2. **Que fait-on des champs jamais lus (`rotor`, `cat`, `soundcard`, `horizon_deg`) ?** (a) on les affiche ici ; (b) on les retire du fichier ; (c) on les câble là où ils comptent (`horizon_deg` dans le calcul de passages, `cat` pour expliquer le plan de tuning).
3. **Quelle place pour les mentions de source ?** (a) une ligne en pied (aujourd'hui) ; (b) rattachées à chaque composant qui consomme la source ; (c) une page « à propos ».

---

## 14. Fond animé — priorité **basse**

`web/index.html:12-13` · `web/starfield.js` · `.veil` `web/style.css:38-44`, `#field` `web/style.css:37`

### 1. Rôle
Donner le contexte spatial sans rien dire — c'est le seul élément de l'interface qui ne porte aucune donnée.

### 2. Données portées
Aucune. Un `<canvas id="field">` fixe en `z-index:0` peuplé d'étoiles (`Math.floor((w*h)/9000)` points scintillants, `web/starfield.js`) et un `<div class="veil">` en `z-index:1` qui superpose trois dégradés : un halo teal `rgba(75,227,199,0.10)` en haut à gauche, un halo ambre `rgba(255,180,84,0.06)` en haut à droite, et un fondu vertical vers `rgba(6,10,20,0.92)` en bas (`web/style.css:38-44`). Le contenu vit en `z-index:2` (`web/style.css:46`).

### 3. États
- **Mouvement réduit** : `starfield.js` lit `prefers-reduced-motion` et fige le scintillement ; `web/style.css:32-34` neutralise par ailleurs toutes les animations de la page.
- **Redimensionnement** : le canvas est reconstruit.
- Aucun autre état.

### 4. Pire contenu
- Sur un écran 4K, `(3840 × 2160) / 9000` ≈ 920 étoiles redessinées en continu, sous une carte Leaflet qui redessine déjà chaque seconde et un canvas polaire de 600×600 également redessiné chaque seconde (`web/app.js:455`).
- Le halo teal du voile passe **derrière** l'en-tête et le bandeau, dont les fonds sont semi-transparents avec `backdrop-filter:blur(6px)` (`web/style.css:53-54`, `web/style.css:157-158`) : la couleur de fond réelle d'un panneau dépend de sa position à l'écran.

### 5. Ce qui cloche aujourd'hui
- **Les deux couleurs d'accent du système sont déjà consommées par le décor** : `--phosphor` et `--amber` sont présents en halos permanents dans `.veil` (`web/style.css:41-42`), donc un accent employé rarement ailleurs n'est jamais vraiment rare à l'écran.
- **Tous les panneaux sont translucides sur un fond mouvant** (`rgba(17,26,44,0.7)`, `web/style.css:156`), ce qui rend le contraste texte/fond variable selon l'emplacement et le scintillement.
- **Trois canvas concurrents** (`#field`, Leaflet, `#polar`) redessinés en continu.
- **Le voile assombrit progressivement le bas de la page** (`web/style.css:43`) : le journal QSO et la bande matériel sont sur un fond plus sombre que l'en-tête, sans que ce soit une intention de hiérarchie.

### 6. Questions ouvertes
1. **Le fond animé survit-il ?** (a) oui, tel quel ; (b) oui, mais sans halos colorés, pour libérer l'accent ; (c) non, fond plat.
2. **Les panneaux restent-ils translucides ?** (a) oui, avec `backdrop-filter` ; (b) non, fonds opaques et contraste garanti ; (c) translucides uniquement sur la carte.
3. **Le dégradé vertical est-il une hiérarchie ?** (a) c'est un effet, on le garde ; (b) on le supprime, la page a un fond unique ; (c) on l'assume comme structure — la page s'assombrit parce qu'elle descend vers l'accessoire.

---

## Écarts balisage / logique relevés

Points où `web/index.html`, `web/app.js`, `web/style.css` et les données ne sont pas d'accord. À connaître avant de refondre.

| # | Écart | Où |
|---|---|---|
| 1 | `#tlestatus` est déclaré `class="badge"` puis son `className` est intégralement écrasé par `tlestat ok/warn/bad`, classes qui ne définissent qu'une couleur : le badge perd padding, bordure, rayon et taille dès le premier rendu. | `web/index.html:21` vs `web/app.js:146,149` vs `web/style.css:265-267` |
| 2 | `svg.polar{…}` et `.polar text{…}` visent un SVG qui n'existe pas — le tracé est un `<canvas>`. CSS mort. | `web/style.css:206-207` vs `web/index.html:99` |
| 3 | `mode.label` du catalogue (`Transpondeur linéaire inversé`, `Répéteur FM cross-band`…) n'est **jamais** affiché : `shortMode()` le remplace par cinq libellés génériques. RS-44, FO-29, AO-73 et AO-7 sont indistinguables par leur mode. | `data/satellites.json` vs `web/app.js:504,518-523` |
| 4 | `upRange` / `downRange` (passante des transpondeurs linéaires) sont présents pour les 4 satellites linéaires et **jamais lus**. | `data/satellites.json:63,75,87,99` |
| 5 | `sat.priority`, `station.horizon_deg`, `antenna.rotor`, `rig.cat`, `rig.soundcard` : jamais lus par `web/app.js`. | `data/satellites.json`, `data/station.json:11,16,17,21` |
| 6 | La bande matériel réécrit en dur l'antenne et la radio que `renderHeader()` rend déjà depuis `station.json` : deux sources pour la même information. | `web/index.html:153,157` vs `web/app.js:142-143` |
| 7 | Seul `sat.modes[0]` génère des passages : les 4 modes de l'ISS n'en produisent qu'un seul. `applyIssOverrides()` réordonne `iss.modes` mais l'effet n'apparaît qu'au `computeAll()` suivant (15 min). | `web/app.js:502`, `600-602`, `456` |
| 8 | `mode.state` (`off`, `active`, `scheduled`) est écrit par `applyIssOverrides()` et lu par **aucun** rendu : un mode hors service produit une ligne de tableau identique aux autres. | `web/app.js:585,591,596` |
| 9 | `errors` de `/api/tle` et `stale`/`error` de `/api/weather` sont renvoyés par le serveur et jamais lus par le client. | `app.py:548,277-280` vs `web/app.js:432,530` |
| 10 | `GET /api/qso` existe côté serveur et n'est jamais appelé : le « journal de trafic » ne montre aucun journal. | `app.py:568-569` vs `web/app.js` |
| 11 | Les fréquences RX/TX du hero et le surlignage du palier Doppler courant ne sont écrits que dans `MAP.draw()`, qui sort si Leaflet n'est pas construit : sans carte, quatre champs de fréquence et le plan de tuning restent morts. | `web/app.js:313`, `364-375` |
| 12 | `selectPass(null)` déréférence `p.rec` : zéro passage trouvé ⇒ `TypeError`, converti en `Erreur de démarrage : …` dans le bandeau au boot, silencieux ensuite. | `web/app.js:174` vs `web/app.js:512` |
| 13 | `#ro-dist` porte `class="v live"` en dur, jamais retiré : la cellule Distance est en permanence à la couleur d'accent réservée à l'état « audible ». | `web/index.html:50` vs `web/style.css:135` |
| 14 | La légende de carte annonce `#1a2438` pour la zone de nuit (réellement `#04080f` à 0,55) et un teal pour la « zone audible » alors que l'empreinte devient ambre précisément quand le satellite est audible. | `web/index.html:44-45` vs `web/app.js:257,342-344` |
| 15 | Trois écritures du même nom de satellite coexistent : nom complet (`#mapsat`, `#missing`), nom court (`satName`), premier mot (marqueur carte). | `web/app.js:175,514` / `504` / `349` |
| 16 | Deux formats pour la même durée : `12:04` dans le tableau (`dur()`), `12 min 04 s` dans le hero. | `web/app.js:20-21` vs `web/app.js:191` |
| 17 | Deux séparateurs décimaux à l'écran : `mhz()` → point (`436.8046`), `fmt()` → virgule fr-FR (`+9,8 kHz`). | `web/app.js:18-19` |
| 18 | `mode.mod` s'affiche deux fois côte à côte dans le hero quand `ctcss` est `null` (cas de tous les satellites linéaires). | `web/app.js:197-198` |
| 19 | `.panel h2{text-transform:uppercase}` déforme l'unité de `#planhead` : `PAS DE 5 kHz` devient `PAS DE 5 KHZ`. Idem pour `#isscheck`, déjà mis en capitales par le JS. | `web/style.css:162` vs `web/app.js:212,570-571` |
| 20 | La grille du plan Doppler est figée à 5 colonnes et le texte d'aide dit « ces 5 mémoires » alors que `plan.length` est calculé et varie selon la bande et la durée du passage. | `web/style.css:139`, `web/index.html:117` vs `web/app.js:207,212` |
| 21 | Le tableau affiche 40 lignes au maximum tandis que le bandeau annonce le total, sans marque de troncature. | `web/app.js:155` vs `web/app.js:515` |
| 22 | `COLORS` compte 6 entrées pour 9 satellites : AO-73/ISS, AO-7/SO-50 et IO-117/AO-91 partagent leur pastille, et les deux premières couleurs sont `--phosphor` et `--amber`. | `web/app.js:486,505` |
| 23 | `shortMode()` étiquette `FM V/U` le mode simplex 145.800 / 145.800 de la voix ARISS, qui est en réalité V/V. | `web/app.js:522` vs `data/satellites.json:16` |
| 24 | `Refresh` et `TriangleWarning` sont préchargées dans le manifeste d'icônes et utilisées nulle part ; le bouton « Rafraîchir TLE » est le seul bouton sans icône. | `web/icons.js:25,28` vs `web/index.html:22` |
| 25 | Plus aucun gestionnaire clavier dans `web/app.js` : Entrée/Échap sur la modale, ajoutés en `9255ed1`, ont été retirés en `1b4772d`. Ni Échap, ni clic sur le voile, ni piège de focus. | `web/index.html:168-201` vs `web/app.js:776-791` |
| 26 | Le message d'erreur du bandeau écrit `textContent` sur le parent, détruisant `#missing` et `#passcount` : l'état est irréversible sans rechargement. | `web/app.js:441,446,461` vs `web/index.html:35` |
| 27 | `#s-loc` accepte `maxlength="8"` alors que `locatorToLatLon()` n'accepte que 4 ou 6 caractères. Le fuseau `#s-tz` n'est pas validé du tout, et une valeur invalide fait lever `hhmmssLoc()` à chaque seconde. | `web/index.html:180,190` vs `web/app.js:690,729,16` |
| 28 | L'animation `hp-blink` des deux-points du rebours ne s'exécute jamais : `innerHTML` est réécrit chaque seconde, ce qui recrée les `<i>` et redémarre un cycle de 1,06 s. | `web/app.js:417` vs `web/style.css:308-309` |
| 29 | Les trois polices (Chakra Petch, IBM Plex Sans, JetBrains Mono) sont chargées depuis Google Fonts, seule dépendance externe non mise en cache dans `data/vendor/` — contrairement à satellite.js, Leaflet et les icônes. | `web/index.html:7` vs `CLAUDE.md`, README.md:96-100 |
| 30 | Le tracé polaire code en dur ses couleurs et ses polices dans le canvas : un changement de tokens CSS ne l'atteindra pas. | `web/app.js:616-660` |
