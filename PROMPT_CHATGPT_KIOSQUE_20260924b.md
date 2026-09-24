Bonjour, c'est F4MAJ. Deuxième mise à jour du **code** du kiosque JB-SATRACK aujourd'hui,
que j'approuve. Même procédure que ce matin (`docs/JB_SERVER_KIOSK.md`, « Mise à jour du
code ») : release préparée à côté, selftest, bascule du lien, contrôles, retour arrière.

## Pourquoi (correctif important)

Le commit **`550ec88`** (branche `master`) corrige un défaut du rafraîchissement TLE :
SatNOGS publie une vieille fiche « ISS (ZARYA) » (orbite du 06/01/2023, NORAD provisoire
99207). L'ancien code la prenait et, en fusionnant **par nom**, elle écrasait la vraie ISS :
**plus aucun passage ISS calculé**. Le kiosque (`bd83cb0`) a ce défaut.

Désormais : NORAD lu dans la ligne 1 du TLE, orbite la plus récente conservée, homonymes
gardés sous « nom [NORAD] ».

## Source

`D:\ClaudeProjets\jb-satrack`, commit `550ec88` (`git archive 550ec88`). Seul `app.py` change
par rapport à `bd83cb0` (plus la doc).

## Contrôles attendus

1. `python3 app.py --selftest` dans la nouvelle release → `selftest OK`.
2. Après bascule : `/api/health` OK.
3. **Forcer un rafraîchissement TLE** (`/api/tle/refresh`, ou l'unité
   `jb-satrack-tle-refresh`), puis vérifier dans `/api/tle` une entrée avec
   `"norad": 25544` dont la ligne 1 porte une époque `26267…` ou plus récente (pas `23006…`).
4. Rendu : la liste des passages du kiosque contient de nouveau l'ISS.

## Retour arrière

Lien `current` vers `releases/bd83cb0`, redémarrer `jb-satrack.service`.

Merci de mettre à jour `docs/JB_SERVER_KIOSK.md` et ta doc, puis de me dire quand c'est fait.
