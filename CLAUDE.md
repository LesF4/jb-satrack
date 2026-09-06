# JB-SATRACK — notes pour agents

Serveur `app.py` : **bibliothèque standard Python uniquement**, aucun paquet à installer.
Client `web/` : **JS vanilla, pas de build**. Les libs tierces (satellite.js, Leaflet,
icônes) sont téléchargées une fois par le serveur, mises en cache dans `data/vendor/`
et servies sur `/vendor/…`. Garder ce schéma pour toute nouvelle dépendance front.

Le cadrage produit — pour qui, contre quoi, ce qui a été écarté — est dans
[`PRODUIT.md`](PRODUIT.md). Le système visuel est dans [`DESIGN.md`](DESIGN.md).

## Vérifier une modification

Deux contrôles, sans dépendance ni framework. Les lancer avant de rendre la main :

```bash
python3 app.py --selftest        # fusion de configuration côté serveur
```
```
http://127.0.0.1:8073/?selftest=1    # décisions client, résultat dans la console
```
```
http://127.0.0.1:8073/?alertdemo=1   # envoie tout de suite la notification du prochain passage
```

Ils ne couvrent que la logique qui **échoue en silence** : une clé de configuration
qui disparaît, une alerte qui ne part pas, une colonne CHIRP décalée. Rien de tout
cela ne lève d'exception, donc rien ne le signalerait autrement. Toute logique
ajoutée dans cette catégorie mérite une ligne de plus dans `selfTest()`
(`web/app.js`) ou `selftest()` (`app.py`) — pas une suite de tests.

## Configuration de la station : le contrat

`data/station.json` est **partiel par construction**. Il a été écrit par une version
antérieure qui ne connaissait pas les clés ajoutées depuis, et il ne se réécrit pas
tout seul.

- **`GET /api/station`** sert `DEFAULT_STATION` recouvert par le fichier. Le client
  peut donc lire `station.alert.lead_min` sans se défendre contre une clé absente,
  et une nouvelle clé arrive chez tout le monde sans migration ni écriture disque.
- **`POST /api/station`** applique `deep_merge()`, pas `dict.update()`. Un patch
  `{"antenna": {"type": "yagi"}}` ne doit pas emporter `height_m` et
  `cone_of_silence_deg` avec lui.

Conséquence pratique : **ajouter un réglage = une clé dans `DEFAULT_STATION`**, et
c'est tout. Ne pas ajouter de valeur par défaut côté client en parallèle, ce serait
une seconde source de vérité.

## Icônes : banque unique **Reicon**

Toutes les icônes de l'interface viennent de **Reicon**
(<https://reicon.dev/icons?weight=filled>), graisse **Filled**, licence MIT.
Pas d'emoji décoratif, pas d'autre jeu d'icônes, pas de SVG dessiné à la main.
Les emoji « données » restants (météo, ISS) ont déjà été remplacés — ne pas en réintroduire.

- **Serveur** — [`app.py`](app.py) : `ensure_icon(name)` récupère le module de l'icône
  depuis le paquet npm `reicon` (version épinglée `REICON_VERSION`), en extrait le
  tracé *Filled* (`_extract_icon_body`), l'écrit dans `data/vendor/icons/<Nom>.svg`
  et le sert sur `GET /vendor/icon/<Nom>.svg`.
- **Client** — [`web/icons.js`](web/icons.js), objet global `Icons` :
  - HTML statique :   `<span class="ic" data-ic="Radio"></span>`
  - HTML généré en JS : `Icons.html('Radio', { size: 18 })`
  - un `MutationObserver` remplit le `<svg>` dès qu'il est disponible ; le style
    monochrome suit `currentColor` (règle `.ic` dans [`web/style.css`](web/style.css)).
- **Ajouter une icône** : prendre son nom PascalCase sur reicon.dev, l'utiliser via
  `data-ic` / `Icons.html(...)`, et l'ajouter à `MANIFEST` dans `web/icons.js`
  (préchargement). Rien d'autre.
- **Changer de version Reicon** : bump `REICON_VERSION` dans `app.py` puis vider
  `data/vendor/icons/`.

## Annoncer quelque chose à l'opérateur

Une notification système **peut ne jamais apparaître sans que la page l'apprenne** :
réglages macOS, mode Concentration, permission refusée autrefois. L'API ne rapporte
aucun des trois. C'est pourquoi une annonce part sur **trois canaux** — pastille dans
la page, son, bulle système — et qu'aucun ne doit être supprimé au motif qu'un autre
existe. Le raisonnement complet est dans [`DESIGN.md`](DESIGN.md) section 8.

Deux pièges qui se represcrivent tout seuls si on ne les connaît pas :

- **`Notification.requestPermission()` hors d'un geste utilisateur ne fait rien.**
  Firefox et Safari l'ignorent, Chrome la met en sourdine. La permission ne s'obtient
  que depuis un clic — d'où le bouton, plutôt qu'un réglage de fichier.
- **Un `AudioContext` créé hors d'un geste naît muet.** Il est ouvert au premier
  `pointerdown` de la session, une fois, et gardé. Ne pas déplacer cette ouverture.

## Le son : trois points de passage uniques

- **`SND` ([`web/app.js`](web/app.js)) est le seul endroit où des fréquences sont
  écrites.** Un second serait une seconde source de vérité, comme une valeur par
  défaut dupliquée côté client.
- **`SFX.play()` est la seule porte.** L'interrupteur `#btn-sound` y coupe tout,
  alerte comprise. Aucun appelant n'a à s'en soucier.
- **Un répartiteur unique écoute les clics, en phase de CAPTURE** sur `document`.
  La capture n'est pas un détail : le son part avant le gestionnaire du bouton, donc
  un interrupteur est encore dans son état d'avant et le son annonce ce que le clic
  *va* faire. Déplacer ce listener en phase de bulle inverse les sons de bascule —
  `selfTest()` le vérifie.

Aucun fichier audio, jamais : tout est synthétisé en Web Audio. La règle « rien à
installer, rien à télécharger » vaut aussi pour le son.

## Contraste : deux fonds, deux réponses

Le thème clair a un piège structurel : `--surf-2` (96 %) contre `--bg` (97 %) fait
**1,03:1**. Ce qui est posé à même le fond de page — boutons d'en-tête, puces —
utilise donc `--surf-ground`, redéfini **localement** sur ces éléments plutôt que par
une règle plus spécifique, pour que survol et états s'en déduisent seuls. Ce qui est
posé sur une carte blanche garde `--surf-2` et n'a pas le défaut.

Avant de « corriger » un contraste ici, lire [`DESIGN.md`](DESIGN.md) section 2 : un
anneau de bord a été construit, mesuré à 4,34:1, puis **écarté sur rendu**. Le
rapport WCAG n'était pas le critère décisif, et la décision est documentée pour ne
pas être reprise par réflexe.
