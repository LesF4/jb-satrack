# JB-SATRACK — système de design

Ce fichier est le seul artefact durable de la refonte d'interface. Le bac à sable de
maquettes a été retiré du dépôt (il reste `docs/design/`) ; ceci est durable. Toute décision prise ici a été
éprouvée sur maquette avant d'être promue dans `web/`.

---

## 1. Le socle, arrêté

| Décision | Valeur retenue | Écarté, et pourquoi |
|---|---|---|
| **Direction** | **Sobre** — grotesque + mono, fond noir, filets, aucun effet | *Phosphor* (registre saturé, halos partout, aucune hiérarchie typographique) · *Almanach* (éditorial, trop lent pour un outil piloté) · *Studio* (perd tout caractère) · *Verre*, *Encre*, *Bloc* (éprouvés, non retenus) |
| **Palette** | **Neutral · Ambre** — rampe Tailwind v4 `neutral`, accent `amber-500` | *Zinc · Cyan*, *Stone · Violet*, *Slate · Sky*. Les gris parfaitement neutres évitent la teinte parasite sous les tuiles satellite ; l'ambre conserve le sens historique de « maintenant » dans l'app |
| **Typographie** | **Inter** (les mots) · **JetBrains Mono** (les nombres) | *Geist · Geist Mono*, *Instrument Sans · Space Mono*, *Archivo · Martian Mono* |
| **Thème** | **Sombre par défaut**, bascule clair/sombre dans l'en-tête, choix mémorisé | Suivre le système par défaut : la direction retenue est sombre, le système ne doit pas la contredire au premier chargement |
| **Structure** | **Mixte** — seuls la carte et le tableau portent une surface ; le reste vit à même le fond | *Cadré* (tout est une carte : « module sur module ») · *Ouvert* (aucun contenant, plus rien ne tient) |
| **Lecture** | **Focus** — une zone active, le reste derrière des onglets en pied de page | *Récit* (trois actes) · *Questions* (sections en langage naturel). Focus divise la hauteur de page par deux |
| **Composition du « maintenant »** | **Deux colonnes** — informations à gauche, carte à droite et en haut | *Carte incrustée* (l'incrustation masque la carte) · *Bandeau + carte* (tout au même rang, aucune hiérarchie) |
| **Formes** | Pilules pour ce qui se clique (`999px`), rectangles arrondis pour les surfaces | *Doux* (tout en rayon moyen) · *Anguleux* (tout à zéro) |
| **Moteur de carte** | **Leaflet + molette réécrite** (~25 lignes) | *MapLibre GL* — linéaire mais 1,56× à côté du réglage demandé, et 270 Ko gzip contre 42 |
| **Padding interne** | `0.80×` sur l'échelle 4/8/12/16/22/30 | — |
| **Écart entre blocs** | `1.40×` sur l'échelle 14/22 | — |
| **Compte à rebours** | `76 px` | 92 px (mangeait la page) · 40 px (ne se voyait plus) |

---

## 2. Les valeurs exactes

Rampe **Tailwind v4**, en oklch. Source : `https://cdn.jsdelivr.net/npm/tailwindcss@4/theme.css`.
Rien n'est cité de mémoire — chaque valeur a été récupérée puis vérifiée.

### Thème sombre (défaut)

```css
--bg:     oklch(14.5% 0 0);          /* neutral-950 */
--surf:   oklch(20.5% 0 0);          /* neutral-900 */
--surf-2: oklch(26.9% 0 0);          /* neutral-800 */
--line:   oklch(26.9% 0 0);          /* neutral-800 */
--surf-ground: oklch(26.9% 0 0);     /* = --surf-2 : sur du noir l'aplat suffit */
--i0:     oklch(98.5% 0 0);          /* neutral-50  — données, titres */
--i1:     oklch(87%   0 0);          /* neutral-300 — prose */
--i2:     oklch(70.8% 0 0);          /* neutral-400 — micro-étiquettes */
--acc:    oklch(76.9% .188 70.08);   /* amber-500 */
--good:   oklch(76.5% .177 163.223); /* emerald-400 */
--warn:   oklch(82.8% .189 84.429);  /* amber-400 */
--bad:    oklch(70.4% .191 22.216);  /* red-400 */
```

### Thème clair

Un thème n'est pas une image en négatif : on permute les rôles le long de la
rampe **et on remonte l'accent**, parce qu'une teinte lisible sur du noir ne
l'est presque jamais sur du blanc.

```css
--bg:   oklch(97% 0 0);              --surf: oklch(100% 0 0);
--i0:   oklch(20.5% 0 0);            /* neutral-900 */
--i1:   oklch(37.1% 0 0);            /* neutral-700 */
--i2:   oklch(43.9% 0 0);            /* neutral-600 */
--acc:  oklch(55.5% .163 48.998);    /* amber-700 */
--surf-ground: oklch(87% 0 0);       /* neutral-300 — aplat posé sur le fond de page */
```

`--surf-2` vaut `oklch(96% 0 0)` contre `--bg` à 97 % : **1,03:1**, un point de
clarté. Sur du noir l'aplat d'un bouton se détache seul ; sur du blanc il ne
détache plus rien, et un bouton d'en-tête au repos n'a aucune forme.

**Deux réponses ont été essayées, la seconde a été retenue.**

1. *Un anneau d'un pixel* (`--edge`, neutral-500, 4,34:1) — seule voie pour
   satisfaire WCAG 1.4.11 à la lettre. **Écartée à l'usage** : elle dessine un
   contour sur des commandes qui n'en avaient pas, et le remède se voyait plus
   que le mal. Décision de l'opérateur, prise sur rendu.
2. *Un aplat plus foncé*, `--surf-ground`. On descend la surface au lieu
   d'ajouter un trait : neutral-300 contre le fond de page fait **1,36:1**,
   soit l'écart que le thème sombre obtient déjà (1,31:1) et qui s'y lit sans
   effort. Ce n'est pas 3:1 — c'est un arbitrage assumé entre la lettre de la
   norme et la tenue visuelle, tranché par celui qui regarde l'écran tous les jours.

**La portée est étroite, et c'est le cœur de la décision.** Le problème n'est pas
« les boutons », c'est *ce qui est posé à même le fond de page* : boutons
d'en-tête et puces d'état. Ce qui est posé sur une carte blanche — boutons des
blocs, étiquette de transpondeur — garde `--surf-2` et n'a jamais eu le défaut.

Le jeton est redéfini **localement** sur ces éléments (`header .acts button,.chip{--surf-2:var(--surf-ground)}`)
plutôt que par une règle plus spécifique : le survol, l'état pressé et l'état
désactivé s'en déduisent sans une ligne de plus, et aucune spécificité nouvelle
ne vient battre les règles d'état existantes. Règle 7 — un survol se dérive.

### Contrastes mesurés (WCAG 2.1, par échantillonnage réel des pixels)

| | i0 | i1 | i2 | accent |
|---|---|---|---|---|
| sombre | 17,2:1 | 12,1:1 | 6,9:1 | 8,4:1 |
| clair | 17,9:1 | 10,4:1 | 7,8:1 | 5,0:1 |

Les commandes relèvent de **WCAG 1.4.11** — non pas 4,5:1 de texte, mais 3:1
entre le composant et le fond adjacent. Voici où l'on se situe, sans arrondir :

| thème clair | avant | après (`--surf-ground`) |
|---|---|---|
| aplat du bouton d'en-tête / fond de page | 1,03:1 ✗ | **1,36:1** — visible, sous la lettre de 1.4.11 |
| aplat de la puce / fond de page | 1,03:1 ✗ | **1,36:1** |
| texte `--i0` / aplat du bouton | 15,9:1 ✓ | 12,1:1 ✓ |
| icône `--i2` / aplat du bouton | 6,9:1 ✓ | 5,3:1 ✓ |
| aplat d'accent (`aria-pressed`) | — | inchangé, l'état marqué ne dépend pas du jeton |

Repère : en sombre, `--surf-2` sur `--bg` ne fait que **1,31:1** et se voit
pourtant sans effort. C'est la borne que le thème clair vient rejoindre. Atteindre
3:1 par l'aplat seul imposait `L≈64 %` — un bouton gris moyen, et `--surf-2` sert
aussi aux puces, au survol des lignes du tableau et à `.orient.calm` : toute
l'interface aurait viré au gris.

En sombre, `--surf-2` contre `--bg` ne fait que **1,31:1** sur le papier et se
voit pourtant sans effort : la formule de luminance de WCAG 2.1 sous-estime les
écarts en bas de rampe. C'est le motif du jeton par thème plutôt que d'un anneau
partout — un bord visible en sombre corrigerait un chiffre, pas un problème.

**Le palier 500 des rampes Tailwind est interdit pour du texte** : 3,67 à 3,79:1
selon la rampe, contre les 4,5:1 exigés. C'est pourtant ce que l'ancien
`web/style.css` employait pour toutes ses micro-étiquettes.

Accents mesurés sur blanc, pour mémoire : `amber-500` 2,15 ✗ · `amber-600` 3,19 ✗ ·
`amber-700` 5,05 ✓ · `cyan-700` 5,28 ✓ · `indigo-600` 6,44 ✓ · `red-600` 4,76 ✓.

---

## 3. Les règles

1. **Le sans dit les mots, le mono dit les nombres.** Jamais l'inverse. C'est le
   levier de hiérarchie le plus rentable sur une interface dense.
2. **L'accent se mérite.** `amber-500` ne marque que ce qui se passe *maintenant* :
   compte à rebours, palier Doppler courant, ligne suivie, et la seule lecture de
   télémétrie qui change ce qu'on fait (« Visibilité », quand elle vaut « Audible »).
3. **Une couleur de marque n'est jamais un état.** Le trio bon / attention / hors
   service est indépendant de l'accent.
4. **Un seul niveau de contenant.** Un groupe dans un bloc se sépare par du vide
   et un filet, jamais par une seconde boîte.
5. **Rythme symétrique par construction.** Un bloc est une colonne flex avec un
   seul `gap` ; les séparateurs sont des éléments à part entière. Une marge
   orpheline devient impossible.
6. **Une seule famille de formes.** Ce qui se clique ou s'étiquette est une
   pilule ; toute surface est un rectangle arrondi.
7. **Le survol ne remplace jamais le fond d'un élément déjà marqué**, et il se
   **dérive** au lieu de se choisir : `--surf-2` et `--line` valent tous deux
   `neutral-800`, un survol codé sur `--line` ne changeait rien.
8. **Titres de section en casse de phrase.** Une interface dense n'a pas besoin de crier.
9. **Une phrase d'orientation en tête**, écrite comme on parle : ce qui se passe
   et ce qu'il faut en faire.
10. **L'accessoire s'ouvre, il ne s'empile pas.** Trajectoire polaire et note du
    catalogue en dépliants natifs.
11. **Un seul rayon est décidé, les autres se calculent** — *tant que l'enfant
    touche le coin du parent*. Dès que le retrait dépasse le rayon extérieur,
    l'enfant choisit son rayon pour lui-même (cas de la carte).
12. **Un survol déplace la clarté dans la même teinte.** En oklch on bouge `L`,
    on ne remplace pas `H`.
13. **Une icône qui accompagne un état prend la couleur de cet état** ; une icône
    qui ne fait qu'étiqueter reste neutre.
14. **Ce qui appartient à la ligne se peint sur la ligne.** Filet de séparation et
    fond de survol vont sur `<tr>`, jamais sur `<td>` : peints cellule par
    cellule, ils exposent la moindre différence de boîte entre colonnes.
15. **Un état désactivé se distingue par un jeton de couleur, pas par une
    opacité** — l'opacité donne un résultat différent selon le fond. Et il doit
    *vraiment* se distinguer : mettre la même valeur que l'état actif ne
    distingue rien.
16. **Aucune icône appelée qui ne soit dans le sprite.** Une icône absente ne
    disparaît pas — elle laisse un cadre vide d'1 em qui ressemble à une faute
    d'espacement. Contrôle : comparer les `data-ic` aux `<symbol>` disponibles.

---

## 4. La carte

### Molette réécrite

```js
const WHEEL_PX = 250;   // px de molette par niveau — rendu exactement
const PINCH_PX = 60;    // px de pincement trackpad (ctrlKey) par niveau
```

Leaflet ne peut structurellement pas suivre le geste : dans `_performZoom`,

```js
n = 4 * Math.log(2 / (1 + Math.exp(-Math.abs(n)))) / Math.LN2;
```

**sature à 4** quelle que soit la violence du geste, et `wheelDebounceTime`
recoupe la rafale avant. Mesuré : **1 696 à 2 261 px de molette par niveau**, et
ça **se dégrade** quand on pousse. Le commit `a221360`, qui mettait
`wheelPxPerZoomLevel: 200` pour « rendre le zoom moins sensible », le rendait en
réalité insensible : 0,38 niveau par rafale, zéro tuile chargée.

La réécriture n'a pas de formule : `dz = −deltaY / px`. Mesuré **250 px/niveau
demandés, 250 obtenus**, à toutes les intensités. MapLibre GL, testé en
comparaison, applique la même formule saturante et rend 391 px/niveau pour 250
demandés — d'où le choix de garder Leaflet et d'économiser 270 Ko gzip.

**L'ancre de zoom doit être figée pour toute la rafale.** Sinon `setZoomAround`
repart de l'état de la carte, dont l'origine en pixels est arrondie à chaque vue,
et l'erreur est multipliée par 2 à chaque niveau : **22 px de dérive sur 5 niveaux**.

### Bornage

`worldCopyJump: false`, `noWrap: true`, `maxBounds`, et un `minZoom` **calculé**
sur `log2(max(largeur, hauteur) / 256)` — jamais codé en dur, recalculé au
redimensionnement. Avant : `minZoom = 0`, le monde faisait 256 px dans un
conteneur de 1 440, soit **5,4 copies côte à côte**.

### Pas de trou noir au zoom

Un **socle permanent** de tuiles figées à `maxNativeZoom: 3` : 64 tuiles couvrent
le monde, elles restent chargées, Leaflet les étire. Au pire du flou une fraction
de seconde, jamais le fond nu du conteneur. Plus `updateWhenZooming: false` — on
ne demande pas de tuiles pendant l'animation, elles arriveraient pour un niveau
déjà quitté.

### Suivi du satellite

Centré sur le satellite, amorti. **On n'écoute que les entrées humaines**
(`dragstart`, `wheel`, `dblclick`, flèches, pincement) plutôt que de poser un
drapeau autour des mouvements programmés : un drapeau devrait couvrir `setView`,
`panBy`, `flyTo`, l'inertie post-glissé, `invalidateSize`, le resize et
l'animation de zoom — en oublier un casse tout. L'ensemble des entrées humaines
est fermé et court.

*Corollaire assumé* : les boutons +/− ne coupent pas le suivi (ils zooment sur le
centre, donc sur le satellite) ; la molette si (elle est ancrée au curseur, c'est
un acte de cadrage). « Ma station » coupe le suivi et zoome de près sur F4MAJ.

**Antiméridien** : détecté en pixels (`|Δx| > 0,4 × 256·2^z`), puis saut. Avec
`noWrap` la cible est réellement à l'autre bout, aucun glissé ne peut y mener.

**Bornes et pôles** : la consigne est clampée *avant* d'être demandée, au lieu de
laisser `maxBounds` refuser. Elle reste atteignable, donc la boucle converge et
la carte ne tremble pas.

**Piège mesuré** : sortir du rattrapage sur « dérive < 20 % du rayon » ne se
produit *jamais* — un suiveur amorti garde en régime établi un retard `v·τ`
supérieur au seuil. Le rattrapage doit être borné dans le temps (`3τ`).

### Tracés

Le rendeur SVG de Leaflet découpe les chemins aux limites du viewport plus un
padding de 0,1. En agrandissant la fenêtre, la trace au sol et l'empreinte
restaient coupées jusqu'au prochain zoom. Corrigé par `renderer: L.svg({ padding: 1 })`
et un `draw()` au redimensionnement. Vérifié : à fenêtre élargie sans zoomer, les
longueurs de chemin passent de 1 796 à 2 829 px.

---

## 5. Bugs de production corrigés au passage

Relevés en lisant le code, pas en le devinant — le détail des 30 écarts
balisage/logique est dans `docs/design/composants.md`.

| Bug | Symptôme | Correction |
|---|---|---|
| `selectPass(null)` | `TypeError` quand aucun passage n'est trouvé sur l'horizon : l'interface s'arrêtait là | Garde + état « Aucun passage prévu » |
| Badge TLE | `renderHeader()` écrasait `className`, la puce perdait bordure, fond, padding et police | `className` complet |
| `mode.label` jamais affiché | `shortMode()` remplaçait le libellé du catalogue par 5 génériques : RS-44, FO-29, AO-73 et AO-7 étaient indistinguables | `mode.label || shortMode(mode)` |
| Pastille de qualité | Dessinée deux fois — un `●` littéral plus le `::before` | Un seul |
| Ouverture de carte | Zoom qui coupait la trace au sol | Ouverture sur le monde entier |
| Filets du tableau | Interrompus aux frontières de colonnes : sept frontières sur sept tombaient sur des demi-pixels, chaque `<td>` portant son propre filet | Filet et fond de survol portés par `<tr>` |
| Cellule « Satellite » | 2 px plus courte que les six autres (`display:flex`), d'où une marche au survol | Pastille en `inline-block` |
| Icônes manquantes | `Activity` et `Book` appelées sans être dans le sprite : cadre vide d'1 em pris pour une faute d'espacement | Ajoutées + règle 16 |
| Glyphes `+` / `−` bas | `align-items:center` centre la boîte de ligne, pas l'encre. Mesuré : `+` bas de 1,72 px, `−` de 1,84 px — soit **74 % de la hauteur d'encre du `−`**, d'où le fait qu'on ne voie que lui | Icônes Reicon `Plus` / `Minus`, centrées par construction. Après : 0,09 px |
| Cibles tactiles mortes | Leaflet pose `.leaflet-touch` dès que le navigateur expose `TouchEvent`, et `.leaflet-touch .leaflet-bar a` (0,2,1) battait notre `.leaflet-control-zoom a` (0,1,1) : la règle `pointer:coarse{44px}` **ne s'appliquait jamais** | Sélecteur `.leaflet-control-zoom.leaflet-bar a`. Mesuré : 34 px au bureau, **44 px en tactile** |
| Zoom désactivé invisible | `color: var(--i0) !important` écrasait le gris de `.leaflet-disabled` : au zoom minimum le `−` invitait à cliquer sans rien faire | Teinte éteinte dérivée. Mesuré : actif 17,2:1, désactivé 2,4:1, distincts dans les deux thèmes |
| Libellés anglais | « Zoom in » / « Zoom out » dans une interface française | « Zoom avant » / « Zoom arrière », `title` et `aria-label` |

---

## 6. Ce qui reste à faire

- **Rebuild PyInstaller** sous Windows pour que le `.exe` reçoive la refonte.
  Penser au `--add-data` pour `data/vendor/fonts/`, ou laisser les polices se
  télécharger au premier lancement comme le fait déjà Leaflet.
- **Fait :** les maquettes `prototypes/` sont retirées du dépôt ; l'analyse
  (`composants.md`) et les décisions du socle (`DECISIONS.md`) sont gardées dans
  `docs/design/`.
- Les écarts balisage/logique non traités de `docs/design/composants.md`,
  notamment : la légende de carte qui décrit l'état inverse du rendu, et
  Enter/Échap dans la modale retirés en `1b4772d`.
- **`mode.state` reste écrit et lu par personne.** `applyIssOverrides()` y pose
  `off` / `active` d'après ARISS, et aucun rendu ne s'en sert. Le meilleur usage
  serait l'alerte : ne pas notifier un passage de l'ISS dont le répéteur est
  éteint. Une ligne dans `dueAlerts()`, sur une donnée déjà relevée.

---

## 7. Décisions d'interface postérieures au socle

Le socle des sections 1 à 4 n'a pas bougé. Ce qui suit s'y conforme et ne s'y
substitue pas.

| Décision | Valeur retenue | Écarté, et pourquoi |
|---|---|---|
| **Bouton « Alertes »** | Un **état** (`aria-pressed`), pas un acte | Un bouton d'action : le bouton ne déclenche rien de visible sur le coup, il dit si on veut être prévenu. Le distinguer de « Rafraîchir », qui agit, est la même distinction que « Suivi » contre « Ma station » sur la carte |
| **État effectif contre souhait** | Le bouton reflète *vouloir ET pouvoir* — la préférence mémorisée **et** la permission accordée | Refléter la seule préférence : un bouton allumé alors que le navigateur bloque les notifications ment à l'opérateur |
| **Où vit l'interrupteur** | Préférence en `localStorage`, seuils en `station.json` | Tout mettre dans `station.json` : la permission de notifier se demande **par navigateur** et depuis un geste utilisateur. Une permission accordée sur ce poste ne dit rien du poste d'à côté, elle n'a donc rien à faire dans un fichier serveur partagé |
| **Mode guidé « ce soir »** | **Retiré après essai.** Une prise de plein écran qui dictait une consigne à la fois, à l'écran et à voix haute | Construit, éprouvé, puis supprimé : il mettait en scène un débutant imaginaire tenant une antenne à la main, alors que la station de référence est une omni fixe où il n'y a rien à orienter. Voir [`PRODUIT.md`](PRODUIT.md) |

### Le piège de l'antenne

Toute consigne d'orientation (« tourne-toi vers le sud-ouest ») doit être
conditionnée à `station.antenna`. La station de référence est une **omni
verticale fixe à 9 m** : il n'y a rien à pointer, et la fiche station l'affiche
déjà — « Pas de rotor, aucune orientation à faire ». L'azimut reste une
**information** (par où ça se lève, donc quel obstacle compte), jamais un ordre.

C'est l'erreur qui a coulé le mode guidé. Elle se referait à l'identique la
prochaine fois qu'on écrira une phrase à l'opérateur.

---

## 8. Annoncer un passage : trois canaux, aucun suffisant

C'est la section à lire avant de toucher à l'alerte. Le problème n'était pas de
fabriquer une notification — c'était de découvrir qu'**une notification peut ne
jamais apparaître sans que la page l'apprenne**.

Le constat, fait sur poste réel : permission accordée, `new Notification()`
appelé sans exception, `Notification.permission === "granted"` — et rien à
l'écran. Trois causes possibles, toutes hors de portée du JavaScript : le style
de notification du navigateur réglé sur « Aucun » dans les réglages macOS, le
mode Concentration qui avale la bulle en silence, ou une permission refusée
autrefois et oubliée. **L'API ne rapporte aucune des trois.**

D'où la règle : **une annonce part sur trois canaux, et chacun couvre le trou des
autres.**

| Canal | Couvre | Tombe quand |
|---|---|---|
| **Pastille** dans la page | le poste qui retient les bulles système | l'onglet est en arrière-plan |
| **Son** | l'écran qu'on ne regarde pas | le son est coupé, ou aucun clic n'a encore eu lieu |
| **Bulle système** | l'onglet en arrière-plan | Concentration, réglages macOS, permission absente |

### L'activation se prouve elle-même

Cliquer sur « Alertes » **envoie immédiatement une annonce de confirmation**, sur
les trois canaux. Ce n'est pas une politesse : activer une alerte sans rien voir,
c'est ignorer si elle marchera dans dix minutes ou jamais — et le vérifier
demandait autrement d'attendre la fenêtre d'annonce. Le clic est aussi le geste
qui ouvre le contexte audio, il tombe donc exactement au bon endroit.

Pour rejouer une vraie alerte sans attendre ni toucher à l'interrupteur :
`http://127.0.0.1:8073/?alertdemo=1` rejoue l'annonce du prochain passage réel.
Elle ne marque pas le passage comme annoncé — la vraie alerte partira quand même.

### Le compte à rebours mesure la présence, pas l'horloge

Une pastille partie pendant qu'on est dans un autre logiciel attendrait derrière
une fenêtre que personne ne regarde, et aurait disparu au retour. Elle patiente
donc tant que `document.hidden || !document.hasFocus()`, et ne s'accorde ses cinq
secondes qu'une fois la page devant. Le décompte **repart à zéro** à chaque
retour : on ne peut pas rater une annonce en étant absent.

### Ce qui a été essayé et jeté en chemin

| Tentative | Pourquoi elle a échoué |
|---|---|
| Demander la permission **au chargement** (`?alertdemo`) | Hors geste utilisateur, Firefox et Safari ignorent la demande et Chrome la met en sourdine. La permission ne s'obtient que depuis un clic — c'est pour ça que l'interrupteur est un bouton. |
| Une **ligne d'état permanente** décrivant la situation | Bavarde une fois le problème résolu. Elle ne s'affiche plus que si une action est attendue : autoriser, ou débloquer. Permission accordée, le bouton en accent porte l'état à lui seul. |
| Un anneau `--edge` pour le contraste clair | Voir section 2. |

### Le glissement

Une pastille s'écarte d'un clic **ou en la glissant vers la droite** — le sens
dans lequel elle sort déjà. Vers la gauche, le geste est borné à zéro plutôt que
suivi puis annulé : on ne tire pas une pastille qui ne partira pas. Seuil double,
70 px **ou** une vitesse de 0,5 px/ms, pour qu'un geste court mais franc compte
autant qu'un geste long. Un glissement de plus de 8 px ne vaut pas un clic —
sinon écarter une annonce sélectionnerait son passage.

---

## 9. Le son

Aucun fichier audio. Tout est synthétisé en Web Audio (oscillateurs sinus,
enveloppe d'attaque et d'extinction) — la contrainte du projet, « rien à
installer, rien à télécharger », vaut aussi pour le son.

**Un seul endroit contient des fréquences** : l'objet `SND` dans
[`web/app.js`](web/app.js). Un second endroit serait une seconde source de vérité,
exactement comme une valeur par défaut dupliquée côté client.

**Un seul endroit coupe le son** : la porte est dans `SFX.play()`. L'interrupteur
`#btn-sound` de l'en-tête coupe donc tout, alerte comprise, sans qu'aucun appelant
n'ait à s'en soucier.

**Un seul endroit écoute les clics** : un répartiteur en phase de **capture** sur
`document`. La capture n'est pas un détail — le son part *avant* le gestionnaire
du bouton, donc un interrupteur est encore dans son état d'avant et le son
annonce *ce que le clic va faire*, pas ce qu'il vient de faire.

### La grammaire

- **Navigation** — onglets, sélection d'un passage, liens, boutons ordinaires :
  un **son générique**, court (40 ms) et bas (volume .04). Il ne dit qu'une
  chose : ton clic est pris. Il sonne souvent, il doit donc être oubliable.
- **Changement d'état de la vue** — des sons **distincts et reconnaissables**,
  pour s'entendre sans regarder : zoom avant / arrière, recentrage sur la
  station, prise et abandon du suivi, thème clair / sombre.
- **Ce qui a un sens** s'entend dans le sens : montant pour ce qui s'ouvre, se
  prend, réussit ; descendant pour ce qui se referme, se lâche, échoue.
- **Deux sons ne se superposent jamais sur un même clic.** Les gestionnaires qui
  jouent déjà leur propre son rendent `null` au répartiteur.

### Ce qui reste muet, délibérément

Molette, glissé et pincement de la carte : gestes **continus**, un son y devient
une mitraillette. Focus d'un champ de saisie : nuisance pure. Le silence est une
décision au même titre que le son.

### `prefers-reduced-motion` tient lieu de préférence de son

Il n'existe pas de `prefers-reduced-sound`. À défaut, un système qui demande moins
d'animations obtient le **silence par défaut** — et le choix explicite de
l'opérateur l'emporte dans les deux sens.

---

## 10. Les états d'une commande

| État | Ce qui le porte | Ce qui a été écarté |
|---|---|---|
| **Occupé** (`aria-busy`) | L'icône Reicon du bouton **tourne**, et passe à `--i0` pendant que le libellé recule sur `--i2` — les deux encres s'échangent : ce qui bouge est ce qu'on doit regarder. Le curseur, lui, ne dit rien (`default`) | `cursor:progress` invoque le curseur d'attente du **système**, étranger à la banque et à la palette ; `not-allowed` dessine un rond barré, qui annonce un refus là où il n'y a qu'une attente. Et un curseur ne peut pas être une icône de Reicon : les navigateurs n'acceptent qu'une image **fixe**, et Safari gère mal les curseurs SVG — il ne tournerait pas, ce qui est justement ce qu'on veut montrer |
| **Indisponible** (`:disabled`) | Encre sur `--i2`, aplat **inchangé**, pas d'enfoncement à vide, aucun allumage au survol — un survol est une promesse de clic | L'opacité (règle 15) : elle donne un résultat différent selon le fond, les deux thèmes divergeraient. Et éteindre l'aplat remplacerait « on ne peut pas cliquer » par « il n'y a rien ici » |

L'éclaircissement de l'icône occupée n'est pas décoratif : sous
`prefers-reduced-motion` la règle globale du fichier annule toutes les
animations. Sans lui, la rotation était le seul signal — il n'en serait plus
resté aucun.

### Ce qui s'actionne ne se sélectionne pas

`button`, `.btn` et `summary` portent `user-select:none`. Ouvrir puis refermer un
dépliant, ou cliquer deux fois sur un bouton, surlignait son libellé en bleu : le
geste est une **commande**, pas une lecture. Les lignes du tableau, elles, restent
sélectionnables — ce sont des **données**, elles se copient.

