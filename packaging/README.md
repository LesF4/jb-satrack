# packaging/ — application Windows

Empaquette JB-SATRACK en application installable, **sans rien changer au projet** :
`app.py` et `web/` restent la source de vérité, ce dossier ne fait que les emballer.

Même esprit que le reste : outillage minimal, `make_icon.py` n'a **aucune
dépendance** (stdlib seule). Seuls PyInstaller (pour l'exe) et Inno Setup (pour
l'installeur, optionnel) sont des outils externes.

## Construire

```bat
pip install pyinstaller
python packaging\build.py                 :: -> packaging\dist\JB-SATRACK\  (dossier applicatif)
python packaging\build.py --zip           :: + packaging\dist\JB-SATRACK-portable.zip  (à envoyer tel quel)
python packaging\build.py --installer     :: + packaging\dist\JB-SATRACK-Setup-2.0.4.exe
python packaging\build.py --clean --zip   :: repart de zéro, puis zip
```

### Ce que ça produit — tout dans `packaging\dist\` (dossier ignoré par git)

| Sortie | Quoi | Comment on l'utilise |
|---|---|---|
| `JB-SATRACK\` | dossier applicatif (exe + `_internal\` + `PREMIER-DEMARRAGE.txt`) | double-clic sur `JB-SATRACK.exe` |
| `JB-SATRACK-portable.zip` (`--zip`) | le dossier ci-dessus, zippé | **l'envoyer à un copain** : il dézippe, ouvre `JB-SATRACK\JB-SATRACK.exe` |
| `JB-SATRACK-Setup-x.y.z.exe` (`--installer`) | installeur | un seul fichier à envoyer ; Next/Next/Finish, raccourci menu Démarrer, désinstalleur |

- **`--installer`** nécessite [Inno Setup 6](https://jrsoftware.org/isdl.php)
  (`iscc` dans le PATH ou à l'emplacement standard). Installation **par
  utilisateur** (pas d'UAC), option Bureau, option « lancer à l'ouverture de
  session ».
- Au **1er lancement** chez le destinataire : avertissement Windows SmartScreen
  (appli non signée) → « Informations complémentaires » → « Exécuter quand
  même ». Ses données vont dans `%LOCALAPPDATA%\JB-SATRACK\`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `build.py` | orchestrateur : icône → PyInstaller → copie `PREMIER-DEMARRAGE.txt` → (Inno Setup) |
| `jb-satrack.spec` | recette PyInstaller (**onedir**, console, sans UPX) ; embarque `web/`, le catalogue, le TLE de secours, un cache TLE d'amorçage et `data/vendor/` |
| `PREMIER-DEMARRAGE.txt` | guide utilisateur — copié à la racine du dossier applicatif (à côté de l'exe), donc dans le `.zip` et l'installeur ; raccourci menu Démarrer |
| `installer.iss` | script Inno Setup ; affiche `LICENSE` (copyright F4MAJ) avant l'installation, pose le copyright dans les propriétés de l'exe |
| `make_icon.py` | génère `icon.ico` (satellite orange / orbite turquoise), stdlib seule |
| `icon.ico` | icône générée (versionnée) |
| `dist/`, `build/` | sorties (ignorées par git) |

## Où vont les données une fois installé

`app.py` détecte le mode figé :

- **portable** — si un dossier `data\` **inscriptible** est posé à côté de
  `JB-SATRACK.exe` : tout reste groupé là (clé USB, dossier perso).
- **installé** — sinon : `%LOCALAPPDATA%\JB-SATRACK\data\`
  (`station.json`, `qso.json`, caches, `vendor/`). Ces données **survivent** à
  une désinstallation / réinstallation.

Au 1er lancement d'un exe installé, `seed_bundled_data()` recopie les libs
vendorisées et le cache TLE depuis le bundle → l'appli marche **même hors ligne**
dès le premier démarrage, puis se rafraîchit.

## Version

Numéro dans `installer.iss` (`#define AppVersion`). Le tenir synchro avec le pied
de page affiché par l'appli.

## À faire plus tard

- **Signature** du `.exe` / de l'installeur (certificat code-signing) pour éviter
  l'avertissement SmartScreen. En attendant : « Informations complémentaires » →
  « Exécuter quand même ».
- **CI GitHub Actions** : build de l'installeur à chaque tag `v*`, joint à la Release.
- **macOS / Linux** : PyInstaller fonctionne aussi, chantier séparé (notarisation
  Apple, `.desktop`/AppImage côté Linux). Le `Dockerfile` couvre déjà le cas serveur.
- Coque **Tauri / pywebview** si un vrai ressenti d'app (fenêtre native, tray) est
  souhaité — le code web ci-dessus ne bouge pas.
