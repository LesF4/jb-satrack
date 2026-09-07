# Exploitation — JB-SATRACK

Lancer, mettre à jour, diagnostiquer, construire, publier.

---

## Lancer

### Depuis les sources (dev / JB-SERVER)

```bash
cd D:\ClaudeProjets\jb-satrack
python app.py                 # http://localhost:8073  (bind 0.0.0.0 -> accès LAN)
python app.py --port 9000
python app.py --host 127.0.0.1   # poste isolé, pas d'accès réseau
```
Python 3.8+, **rien à installer**. Windows : `Lancer JB-SATRACK.bat` fait pareil
et ouvre le navigateur.

### Docker

```bash
docker compose up -d          # expose 8073
```

### Application Windows

Dézipper `JB-SATRACK-portable.zip`, double-clic sur `JB-SATRACK.exe` (fenêtre
console « NE FERME PAS », le navigateur s'ouvre). Ou l'installeur
`JB-SATRACK-Setup-x.y.z.exe` (affiche la licence F4MAJ à accepter). Données dans
`%LOCALAPPDATA%\JB-SATRACK\`. Un `PREMIER-DEMARRAGE.txt` est fourni à côté de
l'exe (et en raccourci menu Démarrer) : à donner aux OM qui installent l'appli —
il explique le réglage de la station et le bouton « Me localiser ».

---

## Configurer la station

Bouton **Réglages** dans l'en-tête (indicatif, locator, ville, fuseau). La
position se calcule depuis le locator. Réglages avancés (antenne, rig, seuils,
alerte) : éditer `data/station.json` — voir [`DONNEES.md`](DONNEES.md#stationjson).

Sous le champ Locator, **« Me localiser »** prend la position de l'ordinateur
(utile en déplacement) : remplit locator, ville (via OpenStreetMap) et fuseau.
Le navigateur demande l'autorisation ; sur macOS il faut aussi Réglages Système →
Confidentialité et sécurité → Service de localisation activé pour le navigateur.
Marche depuis `localhost` / `127.0.0.1` ; depuis une autre machine du réseau en
`http://` simple, le navigateur bloque la géoloc (saisir le locator à la main).
À l'**enregistrement**, la maison se déplace sur la carte, la vue se recentre et
tous les passages sont recalculés.

Il n'y a **pas de fenêtre bloquante** au 1er lancement : l'appli tourne avec les
valeurs par défaut (F4MAJ / JN37QS) et affiche un rappel non bloquant tant que
`configured` est `false`.

---

## Mettre à jour les données

- **TLE** : automatique toutes les heures (worker de fond). Bouton **Rafraîchir**
  pour forcer. La pastille en en-tête montre le nombre de TLE et leur âge en
  temps réel ; **verte** = frais, **ambre « · cache »** = dernier téléchargement
  en échec (survol = la cause).
- **Statut ISS** : automatique toutes les heures depuis ARISS.
- **Météo** : automatique toutes les 30 min.
- **Fréquences** (`data/satellites.json`) : manuel — vérifier
  [amsat.org/status](https://www.amsat.org/status/), éditer le fichier, aucun
  redémarrage nécessaire (relu à chaque `GET /api/satellites`).

---

## Diagnostic

| Symptôme | Cause probable / action |
|---|---|
| **Rafraîchir : « accès refusé (403) » ou « pas de réponse »** | La source (souvent CelesTrak) est injoignable. AMSAT + SatNOGS + R4UAB suffisent normalement. Vérifier la connexion de JB-SERVER. Depuis une IP datacenter / VPN, CelesTrak bloque. |
| **Pastille ambre « cache » qui persiste** | Aucune source TLE joignable. L'appli sert le dernier cache puis `data/tle_fallback.txt`. |
| **« TLE absents : X »** dans le bandeau | Le satellite X du catalogue n'est trouvé dans aucune source. Vérifier son `norad` / `match` dans `satellites.json`. |
| **Un satellite affiche « TLE anciens »** — *(retiré en v2.0.2)* | plus d'alerte : elle faisait douter de tout. Cas connu : IO-117, sans TLE récent nulle part (orbite MEO stable, reste utilisable). |
| **Pas de carte / icônes manquantes / police système** | `/vendor/*` en `503` : le serveur n'a pas pu télécharger les libs au 1er lancement. Vérifier Internet, recharger. Se répare seul ensuite. |
| **Statut ISS « inconnu »** | Page ARISS illisible (mise en page changée). Lien vers l'original affiché. |
| **Serveur très lent quand le navigateur a le focus (Windows)** | `disable_windows_throttling` a échoué (droits). Cosmétique, réessayer. |
| **Port 8073 déjà pris** | `python app.py --port 8074` (ou l'exe : `JB-SATRACK.exe --port 8074`). |
| **Exe installé : la config ne s'enregistre pas** | Corrigé en v2 (données dans `%LOCALAPPDATA%`). Si ré-apparaît : vérifier les droits sur ce dossier. |
| **SmartScreen « Windows a protégé votre PC »** | Appli non signée. « Informations complémentaires » → « Exécuter quand même ». |

**Logs serveur** : sortie standard (`[HH:MM:SS] …`). En exe : la fenêtre console.
Pas de fichier de log.

---

## Vérifications intégrées

```bash
python app.py --selftest                 # fusion config + fusion TLE par fraîcheur
```
```
http://localhost:8073/?selftest=1        # logique client, résultat console (F12) — 20+/20+
http://localhost:8073/?alertdemo=1       # envoie tout de suite la notification du prochain passage
```
Ils ne couvrent que la logique qui **échoue en silence**. Toute logique de cette
catégorie ajoutée = une ligne de plus dans `selftest()` (`app.py`) ou
`selfTest()` (`web/app.js`), pas une suite de tests.

---

## Construire (application Windows)

```bash
pip install pyinstaller
python packaging/build.py                 # -> packaging/dist/JB-SATRACK/  (dossier onedir)
python packaging/build.py --zip           # + JB-SATRACK-portable.zip
python packaging/build.py --installer     # + JB-SATRACK-Setup-x.y.z.exe  (Inno Setup requis)
python packaging/build.py --clean --zip
```
Détail : [`../packaging/README.md`](../packaging/README.md). Sorties dans
`packaging/dist/` (ignoré par git).

---

## Publier une version

1. Mettre à jour [`CHANGELOG.md`](../CHANGELOG.md), `#define AppVersion` dans
   `packaging/installer.iss`, la version dans `packaging/README.md`, et
   `docs/ETAT.md`. (La CI réécrit de toute façon `AppVersion` depuis le tag.)
2. `git commit` + `git push origin master`.
3. `git tag vX.Y.Z master && git push origin vX.Y.Z`.
4. La **CI** (`.github/workflows/build.yml`) construit portable + installeur et
   crée / met à jour la **Release** GitHub avec les deux fichiers.
5. Pour partager : `gh release download vX.Y.Z -p "JB-SATRACK-portable.zip"` (ou
   la page Releases), puis transmettre le fichier manuellement — le dépôt est
   **privé**, le destinataire n'a pas besoin de GitHub.

### Branches

- `master` : ligne principale.
- `v1` : état figé d'avant la refonte de septembre 2026 (référence, pas de build).
- Correctif urgent sur la v1 : brancher depuis `v1`, `git tag v1.0.x`.
