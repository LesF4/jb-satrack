# JB-SATRACK — socle visuel arrêté

Ce fichier est le seul artefact de la campagne de prototypage qui doit survivre.
Les pages de `prototypes/` sont jetables ; ceci ne l'est pas.

## Validé par F4MAJ

| Décision | Valeur | Écarté, et pourquoi |
|---|---|---|
| **Direction** | Signal — grotesque + mono, fond noir, filets, zéro halo | Phosphor (registre saturé, aucune hiérarchie typographique) · Almanach (trop éditorial pour un outil piloté) · Studio (perd tout caractère) |
| **Palette** | **Neutral · Ambre** — rampe Tailwind v4 `neutral`, accent `amber-500` | Zinc · Cyan · Stone · Violet · Slate · Sky. Le neutral pur évite la teinte parasite sous les tuiles satellite ; l'ambre garde le sens historique de « maintenant » dans l'app |
| **Typographie** | **Inter** (les mots) · **JetBrains Mono** (les nombres) | Geist · Geist Mono, Instrument Sans · Space Mono, Archivo · Martian Mono |
| **Structure** | **Mixte** — seuls la carte et le tableau portent une surface ; le reste vit à même le fond | Cadré (tout est une carte : « module sur module ») · Ouvert (aucun contenant : rien ne tient) |
| **Lecture** | **Focus** — une seule zone active, le reste derrière des onglets en pied de page | Récit (3 actes) · Questions (sections en langage naturel) |
| **Formes** | Pilules — tout ce qui se clique ou s'étiquette est une pilule (`999px`), toute surface est un rectangle arrondi (`10px`), les champs `8px` | Doux (tout en rayon moyen) · Anguleux (tout à zéro) |
| **Padding interne** | `0.80×` sur l'échelle 4/8/12/16/22/30 | — |
| **Écart entre blocs** | `1.40×` sur l'échelle 14/22 | — |
| **Compte à rebours** | `76 px` | 92 px (le rebours mangeait la page) · 40 px (ne se voyait plus) |
| **Composition du « maintenant »** | **Deux colonnes** — informations à gauche, carte à droite et en haut, trajectoire et note en dépliants | Carte incrustée (l'incrustation masque la carte, le fond translucide dépend de ce qu'il y a dessous) · Bandeau + carte (tout au même rang, aucune hiérarchie) |
| **Moteur de carte** | **Leaflet + molette réécrite** (~25 lignes à nous) | MapLibre GL — linéaire mais 1,56× à côté du réglage demandé, et 270 Ko gzip au lieu de 42 |
| **Rayons** | Un seul rayon décidé, `--r-surface: 10px`. Les autres en **découlent** : intérieur = extérieur − padding (`2px`), contrôles en pilule (`999px`) | Rayons choisis un par un (c'est ce qui produisait le bouton carré à côté du tag rond) |

## Valeurs exactes — palette Neutral · Ambre

Rampe Tailwind v4, en oklch. Ne rien citer de mémoire : source `https://cdn.jsdelivr.net/npm/tailwindcss@4/theme.css`.

```css
--bg:      oklch(14.5% 0 0);          /* neutral-950 — fond de page */
--surf:    oklch(20.5% 0 0);          /* neutral-900 — surface de bloc */
--surf-2:  oklch(26.9% 0 0);          /* neutral-800 — contrôles, incrustations */
--line:    oklch(26.9% 0 0);          /* neutral-800 — filets et anneaux */

--i0:      oklch(98.5% 0 0);          /* neutral-50  — données, titres */
--i1:      oklch(87%   0 0);          /* neutral-300 — prose, valeurs secondaires */
--i2:      oklch(70.8% 0 0);          /* neutral-400 — micro-étiquettes · 6,91:1 */

--acc:     oklch(76.9% .188 70.08);   /* amber-500   — « maintenant », rien d'autre · 8,35:1 */
--on-acc:  oklch(14.5% 0 0);          /* encre sur aplat d'accent */

--good:    oklch(76.5% .177 163.223); /* emerald-400 */
--warn:    oklch(82.8% .189 84.429);  /* amber-400 */
--bad:     oklch(70.4% .191 22.216);  /* red-400 */
```

**Le palier 500 est interdit pour du texte** : 3,79:1 contre les 4,5:1 exigés par WCAG AA.
C'est pourtant ce que `web/style.css` utilise aujourd'hui (`--ink-2`). À corriger en même temps.

## Règles du socle

1. **Le sans dit les mots, le mono dit les nombres.** Jamais l'inverse. C'est le levier de
   hiérarchie le plus rentable sur une interface dense.
2. **L'accent se mérite.** `amber-500` ne marque que ce qui se passe *maintenant* : compte à
   rebours, palier Doppler courant, ligne suivie, et la seule lecture de télémétrie qui change
   ce qu'on fait (« Visibilité », et seulement quand elle vaut « Audible »).
3. **Une couleur de marque n'est jamais un état.** Le trio bon / attention / hors service est
   indépendant de l'accent.
4. **Un seul niveau de contenant.** Un groupe dans un bloc se sépare par du vide et un filet,
   jamais par une seconde boîte.
5. **Rythme symétrique par construction.** Un bloc est une colonne flex avec un seul `gap` ;
   les séparateurs sont des éléments à part entière. Une marge orpheline devient impossible.
6. **Une seule famille de formes.** Voir le tableau ci-dessus.
7. **Le survol ne remplace jamais le fond d'un élément déjà marqué.** C'est ce qui rendait la
   ligne suivie illisible au survol.
8. **Titres de section en casse de phrase.** Une interface dense n'a pas besoin de crier.
9. **Une phrase d'orientation en tête**, écrite comme on parle : ce qui se passe et ce qu'il
   faut en faire. C'est ce qui répond à « de quoi on parle ».
10. **L'accessoire s'ouvre, il ne s'empile pas.** Trajectoire polaire et note du catalogue en
    dépliants natifs (`<details>`).

11. **Un seul rayon est décidé, les autres se calculent.** `--r-field: max(2px, calc(var(--r-surface) - var(--p5)))`.
    Un rayon choisi à la main quelque part, c'est un rayon qui divergera.
12. **Un dépliant se lit de gauche à droite** : icône, libellé, puis la méta et le chevron poussés à droite.
13. **Aucune icône appelée qui ne soit dans le sprite.** Une icône absente ne disparaît pas — elle laisse un
    cadre vide de 1 em qui ressemble à une faute d'espacement. Contrôle automatisable :
    comparer les `ic('X')` du fichier aux `<symbol id="i-X">`.

## Réglages de la molette (mesurés)

```js
const WHEEL_PX = 250;   // px de molette par niveau de zoom — rendu exactement
const PINCH_PX = 60;    // px de pincement trackpad (ctrlKey) par niveau — deltas bien plus fins
```

Leaflet natif rend 1 696 à 2 261 px par niveau, et se dégrade quand on pousse : sa formule
`dz = 4·log2(2/(1+e^-|n|))` sature à 4 niveaux par rafale. La molette réécrite n'a pas de formule :
`dz = −deltaY / px`. L'ancre de zoom doit être **figée pour toute la rafale**, sinon l'arrondi de
`_getNewPixelOrigin` est réinjecté et multiplié par 2 à chaque niveau (22 px de dérive sur 5 niveaux).

## Suivi du satellite — mesuré, en attente d'arbitrage

Recommandation du prototype `prototypes/suivi.html` : **zone morte, rayon 90 px, τ 260 ms**.

| Stratégie | Recentrages/s | ips | Dérive max |
|---|---|---|---|
| Amorti | 63 | 65 | 32 px — mais la carte glisse à chaque image |
| **Zone morte (90 px)** | **34** | **86** | 89 px (= le rayon) |
| Cadrage prospectif | 60 | 67 | 128 px d'excentrement permanent |

L'argument décisif n'est pas dans le tableau : en production le satellite avance ~1,5 px/s au zoom 4,
donc la carte reste **immobile une minute entière** entre deux rattrapages. L'amorti ne s'arrête jamais.

Trois pièges traités, et c'est là que se joue la qualité :
- **Programmé contre humain** — on n'écoute que les entrées humaines (`dragstart`, `wheel`, `dblclick`,
  flèches, pincement) plutôt que de poser un drapeau autour des mouvements programmés. Un drapeau doit
  couvrir *tous* les chemins qui bougent la carte (`setView`, `panBy`, `flyTo`, l'inertie post-glissé,
  `invalidateSize`, le resize, l'animation de zoom) ; en oublier un casse tout. L'ensemble des entrées
  humaines est fermé et court. Corollaire assumé : les boutons +/− ne coupent pas le suivi, la molette si.
- **Antiméridien** — détecté en pixels (`|Δx| > 0,4 × 256·2^z`), puis saut. Avec `noWrap` la cible est
  réellement à l'autre bout : aucun glissé ne peut y mener.
- **Bornes et pôles** — on clampe la consigne *avant* de la demander, au lieu de laisser `maxBounds`
  refuser. La consigne reste atteignable, donc la boucle converge. 0 inversion de sens mesurée.

Piège que seule la mesure révélait : sortir du rattrapage sur « dérive < 20 % du rayon » ne se produit
**jamais** — un suiveur amorti garde en régime établi un retard `v·τ` supérieur au seuil, et la zone
morte dégénère en recentrage continu (66/s, soit l'amorti). Le rattrapage doit être borné dans le
temps (`3τ`).

## Correction annexe

`.m-sat i` / `.m-sta i` rendaient **0 px** dans les maquettes : `flex-item` dans un `divIcon` sans
`iconSize`, écrasé par `flex-shrink`. Corrigé dans les sept prototypes. **`web/style.css:122` n'est pas
concerné** — `.sat-icon .dot` y a déjà `flex:none`.

## Publié dans `web/` — la campagne de prototypage est close

| Décision finale | Valeur |
|---|---|
| Esthétique | **Sobre** — `neutral` + `amber-500` |
| Thème | **Sombre par défaut**, bascule clair/sombre dans l'en-tête, choix mémorisé |
| Typographie | Inter · JetBrains Mono, **vendorisées** (176 Ko, `data/vendor/fonts/`) |
| Composition | Deux colonnes, onglets en pied de page |
| Molette | 250 px/niveau, pincement trackpad 60 px/niveau |
| Suivi | Zone morte 90 px, τ 260 ms, bouton + raccourci `S` |

Deux règles ajoutées en publiant :

12. **Le survol se dérive, il ne se choisit pas.** `--surf-2` et `--line` valent tous deux
    `neutral-800` : un survol codé sur `--line` ne changeait rien. `color-mix(… var(--i0))`
    donne un écart réel dans les deux thèmes sans second jeu de valeurs.
13. **Un thème n'est pas une image en négatif.** On permute les rôles le long de la rampe
    ET on remonte l'accent : `amber-500` fait 2,15:1 sur blanc, `amber-700` fait 5,05:1.

## Encore ouvert

- **Registre esthétique** — `prototypes/esthetiques.html` : cinq esthétiques sur la structure figée.
  La structure, la composition et l'architecture de l'information ne sont plus en question ;
  seuls changent la palette, le couple typographique, le traitement de surface et le système de rayons.

- **Suivi du satellite sur la carte** — `prototypes/suivi.html` : recentrage temps réel, mode libre au premier
  geste, retour rapide au suivi.

## À faire au moment de la promotion vers `web/`

- Vendoriser les polices en `woff2` dans `data/vendor/` (`ensure_font`), sur le modèle de
  `ensure_satjs` : aujourd'hui `web/index.html` charge Google Fonts par CDN, donc le `.exe`
  hors ligne perd sa typographie.
- Déclarer au `MANIFEST` de `web/icons.js` les 19 icônes employées par les maquettes et absentes
  de la liste actuelle : `Satellite`, `Check`, `Clock`, `Globe`, `Target`, `Moon`, `Ruler`,
  `Gauge`, `ArrowUp`, `ArrowDown`, `Compass`, `Eye`, `Timer`, `Activity`, `Route`, `X`,
  `Calendar`, `List`, `Notebook`.
- Corriger les trois bugs de production relevés dans `prototypes/composants.md` :
  `selectPass(null)` qui plante, le `className` du badge TLE écrasé, et `mode.label` du
  catalogue jamais affiché.
