# Kiosque HDMI sur JB-SERVER

État au 24 septembre 2026 : **déployé, validé et conservé en lancement manuel**. Cette
fiche décrit l'instance Linux autonome affichée sur l'écran HDMI de JB-SERVER.

## Objectif

- Afficher la même interface que sous Windows et macOS.
- Garder des données, journaux QSO et préférences séparés sur chaque poste.
- Commander le kiosque depuis Windows par SSH, sans clavier ni souris.
- Conserver un démarrage manuel pendant la période d'essai.

Le code déployé vient du commit `714a38b` de `master`. La release précédente
`550ec88` est conservée sur le serveur pour un retour arrière immédiat.

## Installation réelle

| Élément | Emplacement / comportement |
| --- | --- |
| Code | `/opt/jb-satrack-kiosk/releases/714a38b` |
| Version active | lien `/opt/jb-satrack-kiosk/current` |
| Données Linux | `/opt/jb-satrack-kiosk/data` |
| Profil navigateur | `/home/jb-kiosk/snap/chromium/common/kiosk-profile` |
| Serveur | `jb-satrack.service`, uniquement `127.0.0.1:8073` |
| Affichage | `jb-satrack-kiosk.service`, Cage + Chromium sur `tty7` |
| TLE | `jb-satrack-tle-refresh.timer` |
| Retour console | `tty1` à l'arrêt |

Le compte `jb-kiosk` n'a ni shell interactif ni droit administrateur.
L'installation ne modifie ni Caddy, UFW, Docker ou Wavelog. Elle a ajouté Cage
et ses 33 dépendances sans mettre à jour ni supprimer de paquet existant, puis
Chromium stable via le Snap Canonical. Aucun redémarrage n'a été nécessaire.

## Réglages validés, catalogue et TLE

- Indicatif `F4MAJ`, locator `JN37QS`, ville `Illzach`, fuseau `Europe/Paris`.
- 1 717 TLE observés après le rafraîchissement complet du 24 septembre.
- Rafraîchissement forcé après chaque lancement, puis toutes les heures tant
  que l'application fonctionne. Le bouton manuel n'est pas nécessaire.
- Le timer ne démarre pas le kiosque au boot de JB-SERVER.
- Le catalogue automatique contient 31 satellites trafiquables et son cache
  persistant est `/opt/jb-satrack-kiosk/data/catalog_auto.json`.
- Les sources AMSAT et SatNOGS sont interrogées hors du chemin critique de la
  page. Le premier calcul a abouti en environ six minutes malgré des délais
  d'expiration IPv6 ; le cache évite de bloquer l'interface.
- AO-91 est validé à 435,250 MHz en montée et 145,960 MHz en descente, sans
  CTCSS. AO-123 est validé avec un CTCSS de 67 Hz.

## Ressources

Python est limité à 256 Mio et 50 % d'un cœur. La session qui contient Cage et
tous les processus Chromium Snap est limitée à 2 Gio, sans swap, et deux cœurs
sur les 16 processeurs logiques. Pendant l'essai initial, elle consommait environ
700 à 970 Mio ; le démarrage de `bd83cb0` a culminé à environ 27 Mio pour Python.
Aucun OOM, swap ou service systemd en échec
n'a été observé. Les cinq conteneurs préexistants sont restés actifs et MariaDB
saine. Ces limites réduisent le risque ; elles ne remplacent pas la surveillance.

## Commandes

Les lanceurs Windows `Demarrer.cmd`, `Arreter.cmd`, `Etat.cmd` et
`Controler-JBSatTrack.ps1` sont conservés dans le chantier local JB Server. Ils
utilisent l'alias SSH `jb-server-admin` sans stocker de secret.

```bash
# démarrer
sudo systemctl start jb-satrack.service
sudo systemctl start jb-satrack-kiosk.service

# vérifier
systemctl is-active jb-satrack.service jb-satrack-kiosk.service \
  jb-satrack-tle-refresh.timer
curl -fsS http://127.0.0.1:8073/api/health

# arrêter uniquement JBSat Track et rendre la console
sudo systemctl stop jb-satrack-kiosk.service jb-satrack.service
sudo loginctl terminate-user jb-kiosk
sudo chvt 1
```

Arrêter le kiosque n'éteint ni l'écran physique ni JB-SERVER.

## Affichage et alertes

Le grand compte à rebours est blanc avant la fenêtre exploitable et orange
(`.countdown.live`) pendant cette fenêtre. Une différence observée entre deux
postes à des instants différents ne signifie pas une différence de version.

Au premier lancement, les bibliothèques et icônes distantes se chargeaient trop
lentement. Le cache `data/vendor/` a été amorcé depuis la même copie Windows,
après sauvegarde des données Linux. Aucun code n'a été modifié. Le diagnostic
Chromium temporaire sur le port 9223 loopback a été retiré.

Les alertes visuelles fonctionnent. Les notifications système et le son exigent
un geste utilisateur initial selon les règles du navigateur ; ils ne sont pas
encore validés sur ce kiosque sans souris. Ne pas affaiblir la sandbox Chromium
ou AppArmor pour les activer.

## Mise à jour du code

La mise à jour des **données TLE** est automatique. La mise à jour du **code**
ne l'est pas encore. Toute mise à jour doit utiliser une release ou un commit
précis, jamais un `git pull` aveugle : sauvegarder données et profil, préparer
et tester la nouvelle version hors de `current`, basculer le lien, vérifier
`/api/health`, le rendu et les services critiques, puis rétablir l'ancien lien
si un contrôle échoue. Aucun jeton GitHub n'est installé sur JB-SERVER.

La mise à jour du 24 septembre 2026 vers `bd83cb0` a suivi cette procédure :
selftest hors production, bascule atomique, contrôle de santé, catalogue, rendu
Cage/Chromium et services critiques, puis retour volontaire à l'état arrêté.
La mise à jour suivante vers `550ec88` corrige la fusion des TLE homonymes :
l'ISS réelle (NORAD 25544, époque `26267…`) est de nouveau retenue. Le contrôle
Chromium a confirmé quatre passages ISS dans les 40 premières lignes rendues.
La mise à jour vers `714a38b` rétablit les passages déjà commencés et précise
la bissection du LOS. L'autotest Chromium a réussi ses 25 contrôles ; IO-117,
déjà levé, apparaissait en première ligne avec son AOS passé et le bandeau actif.

## Sauvegarde et retour arrière

Inventaires avant/après, sources, unités et documentation sont dans
`/var/backups/jb-system-ia/jbsatrack-kiosk-20260911`. L'archive de référence a
été relue et son inventaire dpkg vérifié par SHA-256.
La sauvegarde précédant `bd83cb0` se trouve dans
`/var/backups/jb-system-ia/jbsatrack-kiosk-20260924-pre-bd83cb0` et ses sommes
SHA-256 ont été vérifiées.
La sauvegarde précédant `550ec88` se trouve dans
`/var/backups/jb-system-ia/jbsatrack-kiosk-20260924-pre-550ec88` ; ses archives
de données et de profil Chromium ont également été vérifiées par SHA-256.
La sauvegarde précédant `714a38b` se trouve dans
`/var/backups/jb-system-ia/jbsatrack-kiosk-20260924-pre-714a38b`, avec les mêmes
contrôles SHA-256.

Retour immédiat : arrêter les deux unités, terminer uniquement `jb-kiosk`, puis
revenir à `tty1`. Les unités sont statiques et non activées au démarrage. Pour
un retrait complet, comparer les inventaires et simuler la suppression des
seuls paquets ajoutés. Ne jamais utiliser `autoremove` aveuglément ni restaurer
globalement la base dpkg sur le serveur actif.

Restent à valider : observation prolongée, alertes audio éventuelles, puis
présence dans les sauvegardes Restic et Proton après leur prochaine exécution.
