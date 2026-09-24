# JB-SATRACK — cadrage produit

Ce fichier répond à trois questions que ni le [README](README.md) (qui dit *ce que ça
fait*) ni [DESIGN.md](DESIGN.md) (qui dit *à quoi ça ressemble*) ne portent :
**pour qui**, **contre quoi**, et **ce qu'on a refusé de construire**.

Il existe pour qu'une décision déjà tranchée ne se rejoue pas six mois plus tard.

Arrêté le 5 septembre 2026.

---

## 1. Le positionnement

> Tout l'écosystème résout le même problème : faire en sorte que **la machine** reçoive
> le satellite à ta place. JB-SATRACK résout l'autre : aider **l'opérateur** à le faire
> lui-même, avec le matériel qu'il a déjà.

Gpredict, SatPC32, et [SkyRoof](https://ve3nea.github.io/SkyRoof/) (sorti mi-2025,
relayé par Hackaday, RTL-SDR.com et AMSAT, signé gratuitement par SignPath) optimisent
tous dans la même direction : SDR, commande CAT, rotor, hamlib. Ça suppose un opérateur
qui possède du matériel faisant le travail à sa place.

La station de référence ne possède rien de tout ça : **omni verticale fixe à 9 m, pas de
rotor, Yaesu FTM-500D sans CAT**. Ce n'est pas un manque en attendant mieux, c'est la
configuration réelle, et c'est celle de beaucoup de monde.

Ce que ça donne concrètement, et que personne d'autre ne fait :

- **`quality()` inverse la notation.** Un passage qui culmine au-delà du cône de silence
  est signalé « Zénith », donc *moins bon* qu'un passage à 45°. Tous les autres trackers
  classent par élévation décroissante, parce qu'ils supposent une yagi croisée sur rotor.
- **`dopplerPlan()` découpe le passage en paliers horodatés**, et l'export CHIRP porte
  l'heure de bascule dans le commentaire de chaque canal. Les fichiers CHIRP de
  satellites qui circulent sont statiques : cinq canaux à ±10/±5/0 kHz, identiques pour
  tout le monde et pour toujours. Ils ne disent pas **quand** changer.
- **Le statut ARISS est relevé automatiquement**, y compris la bascule de fréquence APRS
  entre 145.825 et 437.825 selon la radio en service à bord.

---

## 2. Le catalogue : un problème de composition, pas de taille

Mesuré sur `data/satellites.json` :

| Cibles voix FM | Linéaire SSB | Digipeater |
|---|---|---|
| ISS, SO-50, AO-91, PO-101 | RS-44, FO-29, AO-73, AO-7 | IO-117 |
| **4** | **4** | **1** |

Quatre cibles phonie seulement, dont l'ISS qui n'a son répéteur allumé que par périodes.
La moitié du catalogue sert le linéaire SSB, qui demande un poste BLU.

> **Décision révisée le 24/09/2026 par F4MAJ** : le catalogue devient **automatique** —
> tous les satellites radioamateurs **trafiquables** (FM, linéaire, digipeater) d'après le
> statut AMSAT, + ISS, fréquences SatNOGS (`satcatalog.py`). Les balises qu'on ne peut
> qu'écouter restent écartées. Le coût de maintenance invoqué ci-dessous est absorbé
> par la génération automatique ; les entrées de `satellites.json` restent prioritaires
> quand une fréquence a été vérifiée à la main. Le texte d'origine est conservé.

**La bonne action n'est pas de passer à 60 satellites** — ce serait servir un public qui
n'est pas celui-là. C'est de **densifier le FM** et d'assumer le linéaire comme
secondaire. Chaque satellite ajouté est une ligne de fréquences à vérifier sur AMSAT et
à maintenir quand il tombe en panne : le coût est réel, la décision doit être prise
sat par sat.

---

## 3. Écarté, et pourquoi

| Piste | Verdict |
|---|---|
| **RTL-SDR : le serveur reçoit et décode** | Abandonné. SkyRoof occupe cette case, mieux équipé, et signé. Casserait aussi la promesse « bibliothèque standard seule, rien à installer » : il faudrait du DSP, du natif, une chaîne de décodage à maintenir |
| **Mode guidé « ce soir »** | **Construit, essayé, retiré.** Une prise de plein écran qui donnait une consigne à la fois, à l'écran et à voix haute, avec une répétition accélérée du passage. Voir §4 |
| **Assistant de configuration zéro-config** | Pas retenu pour l'instant. Ville en entrée, locator et fuseau devinés, catalogue de postes. N'a de sens qu'au moment de diffuser |
| **Élargir à 60 satellites** | Voir §2 : mauvais problème — **révisé le 24/09/2026** : catalogue automatique des trafiquables (31) |

---

## 4. Le mode guidé, et ce que son échec a appris

Il faisait ceci : choisir le meilleur passage phonie des 24 h, prendre l'écran, afficher
une consigne à la fois en très grand, l'annoncer à voix haute par la synthèse du
navigateur, et proposer une **répétition** rejouant le passage en accéléré avant qu'il
arrive — le tout via une horloge virtuelle que toute l'application lisait à la place de
`Date.now()`.

Il a été retiré pour une raison qui vaut d'être retenue.

**Il mettait en scène un opérateur qui n'existe pas ici.** Ses consignes disaient
« tourne-toi vers le sud-ouest ». La station de référence a une omni fixe sur le toit :
il n'y a rien à tourner, et l'interface l'affichait déjà deux écrans plus loin. La mise
en scène supposait quelqu'un debout dehors, une antenne à la main. C'est un profil réel
dans le monde, ce n'est pas celui de cette station.

Deux règles en sortent, et elles survivent au code supprimé :

1. **Aucune phrase adressée à l'opérateur ne s'écrit sans regarder `station.antenna`.**
   L'azimut est une information, jamais un ordre, tant que rien ne se pointe.
2. **Lancer la chose bat relire la chose.** Deux erreurs n'ont été vues qu'en exécutant :
   la sélection de passage retenait IO-117, un digipeater en orbite moyenne injouable
   avec un poste nu, parce que ses passages longs et hauts raflaient le score ; et la
   consigne d'orientation contredisait la fiche station.

---

## 5. Sur la table

Ni commencé, ni promis. Par ordre de valeur estimée.

- **Statut AMSAT automatique.** Le README demande encore de vérifier
  [amsat.org/status](https://www.amsat.org/status/) à la main avant un QSO important.
  C'est la dernière vérification manuelle, et le moteur existe déjà : `parse_iss_status()`
  relève la page ARISS toutes les heures avec cache et repli. Même mécanique, autre page,
  et un satellite en panne se voit avant de sortir.
- **Fenêtre de visibilité commune.** Le locator du correspondant en entrée, les créneaux
  où le satellite est au-dessus des deux stations en sortie. C'est ce qui sert à
  *organiser* un contact plutôt qu'à en attendre un. Tout le calcul existe, il manque un
  deuxième observateur.
- **Journal pré-rempli.** Pendant un passage, l'app connaît le satellite, le mode, la
  fréquence et l'heure. Les remplir ferait gagner les champs ADIF que LoTW et eQSL
  attendent (`SAT_NAME`, `FREQ`, `BAND`, `PROP_MODE=SAT`).
- **Ne pas alerter sur un répéteur éteint.** `mode.state` est déjà écrit par
  `applyIssOverrides()` d'après ARISS et lu par personne. Une ligne dans `dueAlerts()`.
- **Densifier le catalogue FM.** Travail de données, pas de code. Voir §2.

---

## 6. Diffusion

**Rien n'est publié, et c'est délibéré.** Le travail reste local. Le README porte
« tous droits réservés », il n'y a pas de `LICENSE`, pas de dépôt public, pas de CI.

Si la question se rouvre un jour, voici ce qui bloque, dans l'ordre :

1. Le travail en cours n'est pas dans git.
2. « Tous droits réservés » interdit juridiquement la redistribution — il faudrait une
   licence, MIT s'accordant avec Reicon, satellite.js et Leaflet déjà utilisés.
3. Le public visé ne fait pas `git clone` : il faut un binaire téléchargeable. Le `.exe`
   PyInstaller existe mais déclenche SmartScreen faute de signature. SignPath signe
   gratuitement les projets open source — c'est ainsi que SkyRoof y a échappé.
4. La calibration est celle de F4MAJ. `saveSetup()` n'envoie qu'indicatif, locator, ville
   et fuseau : tout nouvel utilisateur hériterait de l'altitude d'Illzach, d'une omni à
   9 m et d'un FTM-500D. `quality()` lui donnerait alors un conseil faux, avec assurance.
