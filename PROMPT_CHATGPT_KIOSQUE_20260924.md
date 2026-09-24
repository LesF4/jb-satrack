Bonjour, c'est F4MAJ. Mise à jour du **code** du kiosque JB-SATRACK sur JB-SERVER, que
j'approuve. Merci de suivre ta propre procédure (`docs/JB_SERVER_KIOSK.md`, section
« Mise à jour du code ») : version préparée à côté, testée, bascule du lien, retour arrière
si un contrôle échoue.

## Pourquoi

Le kiosque tourne sur le commit `47402ab` (branche `packaging-linux`). Depuis, `master`
contient (commit **`bd83cb0`**) :
- **catalogue automatique** : tous les satellites radioamateurs trafiquables + ISS
  (31 au lieu de 9), module `satcatalog.py`, reconstruit une fois par jour en tâche de fond,
  cache `data/catalog_auto.json` ; la page n'attend jamais le réseau ;
- **AO-91 corrigé** : montée et descente étaient inversées dans `data/satellites.json`
  (maintenant 435,250 ↑ / 145,960 ↓, sans CTCSS) ;
- AO-123 ajouté (CTCSS 67 Hz).

Les fichiers de packaging de `packaging-linux` ne sont pas dans `master` : sans effet sur le
kiosque, qui lance `app.py` directement.

## Source

Sur jbfixe : `D:\ClaudeProjets\jb-satrack`, commit `bd83cb0` (branche `master`), par exemple
`git archive bd83cb0` — pas de `git pull` sur le serveur (aucun jeton GitHub, comme prévu).
Fichiers utiles : `app.py`, `satcatalog.py` (nouveau), `web/`, `data/satellites.json`,
`data/tle_fallback.txt`.

## Points d'attention

- **Nouveau fichier `satcatalog.py`** à côté d'`app.py` (importé au démarrage).
- **Sorties réseau nouvelles** du service `jb-satrack` : `https://www.amsat.org/status/` et
  `https://db.satnogs.org/api/satellites/`, `…/api/transmitters/` (une fois par jour).
  AMSAT et SatNOGS étaient déjà contactés pour les TLE.
- **Mémoire** : la reconstruction lit ~5 Mo de JSON SatNOGS ; largement sous la limite de
  256 Mio de Python, mais à surveiller au premier passage.
- `data/catalog_auto.json` s'écrit dans le dossier **données** du kiosque
  (`/opt/jb-satrack-kiosk/data`), pas dans la release.

## Contrôles attendus

1. `python3 app.py --selftest` dans la nouvelle release → `selftest OK`.
2. Après bascule : `curl -fsS http://127.0.0.1:8073/api/health`.
3. Dans les journaux de `jb-satrack.service`, une ligne
   `catalogue : 31 satellites trafiquables …` (au démarrage ou au plus tard après 6 h).
4. `curl -fsS http://127.0.0.1:8073/api/satellites` : ~31 entrées, AO-91 avec
   `"up": 435.25, "down": 145.96`.
5. Rendu du kiosque correct, services critiques inchangés.

## Retour arrière

Remettre le lien `current` sur `releases/47402ab`, redémarrer `jb-satrack.service` ;
`catalog_auto.json` peut rester (l'ancienne version l'ignore).

Merci de mettre à jour `docs/JB_SERVER_KIOSK.md` (commit déployé) et ta doc JB-SERVER,
et de me dire quand c'est fait.
