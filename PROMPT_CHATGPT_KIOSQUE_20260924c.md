Bonjour, c'est F4MAJ. Troisième mise à jour du **code** du kiosque JB-SATRACK aujourd'hui,
que j'approuve. Même procédure que les deux précédentes (`docs/JB_SERVER_KIOSK.md`, « Mise à
jour du code ») : release préparée à côté, selftest, bascule du lien, contrôles, retour arrière.

## Pourquoi

Le commit **`714a38b`** (branche `master`) corrige deux défauts du calcul des passages
(`web/app.js`) :

1. **Passage déjà commencé invisible.** Un satellite déjà au-dessus de l'horizon au moment
   du calcul (ouverture de la page, recalcul) était ignoré : le 24/09 à 15:25, IO-117 était à
   8° mais la page disait « Rien au-dessus de toi » et ne le listait pas. Le calcul remonte
   désormais jusqu'au lever.
2. **Fin de passage (LOS) jusqu'à 30 s trop tôt.** Bissection corrigée.

Le kiosque (`550ec88`) a ces deux défauts.

## Source

`D:\ClaudeProjets\jb-satrack`, commit `714a38b` (`git archive 714a38b`). Seul `web/app.js`
change par rapport à `550ec88` pour le code (plus la doc et ce fichier).

## Contrôles attendus

1. `python3 app.py --selftest` dans la nouvelle release → `selftest OK`.
2. Après bascule : `/api/health` OK.
3. Autotest client : ouvrir `http://127.0.0.1:8073/?selftest=1` dans Chromium et lire la
   console → `selftest JB-SATRACK — 25/25`, avec la ligne
   `✓ findPasses : passage en cours retrouvé avec son vrai lever`.
4. Rendu : si un satellite est levé au moment du contrôle, il apparaît en tête de
   « Prochains passages » (heure de lever dans le passé) et le bandeau le signale.

## Retour arrière

Lien `current` vers `releases/550ec88`, redémarrer `jb-satrack.service`.

Merci de mettre à jour `docs/JB_SERVER_KIOSK.md` et ta doc, puis de me dire quand c'est fait.
Si tu commites la doc dans `D:\ClaudeProjets\jb-satrack`, pousse-la aussi (`git push`).
