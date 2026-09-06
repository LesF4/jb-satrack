# Fichiers de données — JB-SATRACK

Tout est en JSON à plat dans `data/`. Deux natures :

- **Livré** (dans le dépôt, lecture seule à l'exécution — servi depuis `SEED`) :
  `satellites.json`, `tle_fallback.txt`.
- **Persistant / runtime** (écrit par l'appli, dans `DATA` = `ROOT/data`) :
  `station.json`, `qso.json`, les caches, `vendor/`.

`station.json` est **versionné** (il porte la config F4MAJ) mais l'appli le
réécrit ; les caches et `vendor/` sont dans `.gitignore`.

En **exe figé**, `DATA` = un `data/` inscriptible à côté de l'exe (portable),
sinon `%LOCALAPPDATA%\JB-SATRACK\data\`. `seed_bundled_data()` amorce `vendor/`
et un `tle_cache.json` depuis le bundle au 1er lancement.

---

## `satellites.json`

Catalogue **curaté à la main** des satellites suivis + leurs fréquences. Servi
tel quel par `GET /api/satellites`. L'appli ne l'écrit jamais.

```json
{
  "_note": "Base fréquences curatée. Vérifier amsat.org/status avant un QSO.",
  "_verified": "2026-09",
  "satellites": [
    {
      "id": "SO-50",
      "name": "SO-50 (SaudiSat 1C)",
      "norad": 27607,
      "match": ["SO-50", "SAUDISAT 1C", "SAUDISAT-1C"],
      "priority": 2,
      "modes": [
        { "label": "Répéteur FM V/U", "type": "fm",
          "up": 145.85, "down": 436.795,
          "mod": "FM", "ctcss": 67.0,
          "note": "Tonalité 74.4 Hz pour armer le timer…" }
      ]
    }
  ]
}
```

### Champs d'un satellite

| Champ | Rôle |
|---|---|
| `id` | identifiant court, stable (sert de clé, apparaît dans l'export CHIRP / QSO) |
| `name` | nom affiché ; `name.split(' (')[0]` = le nom court du tableau |
| `norad` | **numéro NORAD** — c'est par lui que `matchTle` associe un TLE (prioritaire sur le nom) |
| `match` | noms possibles dans les flux TLE, essayés en sous-chaîne si le NORAD échoue |
| `priority` | ordre indicatif (non déterminant pour l'affichage, trié par heure de passage) |
| `modes` | liste ; **`modes[0]` = le mode mis en avant** (tableau, « en ce moment », Doppler). Pour l'ISS, `applyIssOverrides` réordonne : phonie d'abord |

### Champs d'un mode

| Champ | Rôle |
|---|---|
| `type` | `fm` \| `linear` \| `digi` \| `sstv` — pilote `shortMode()`, la pastille, le libellé RST (`SSB` si `linear`, sinon `FM`), la bande |
| `label` | libellé affiché ; sinon `shortMode(mode)` |
| `up` / `down` | fréquences MHz (montée station→sat / descente sat→station). Le Doppler et le plan CHIRP travaillent sur `down` (RX) et `up` (TX) |
| `upRange` / `downRange` | (optionnel) bornes d'un transpondeur linéaire |
| `mod` | modulation affichée (`FM`, `USB`, `1200 bd AFSK`…) |
| `ctcss` | tonalité subaudible Hz (émission). `null` si aucune |
| `note` | phrase affichée sous le passage |

### Ajouter un satellite

1. Ajouter l'objet dans `satellites.json` avec `id`, `name`, **`norad`**,
   `match`, `modes`.
2. Vérifier les fréquences sur [amsat.org/status](https://www.amsat.org/status/).
3. Aucun code à toucher — `computeAll` le prend automatiquement s'il trouve un
   TLE (sinon l'interface affiche « TLE absents : … »).

---

## `tle_fallback.txt`

TLE **3 lignes** (nom / ligne 1 / ligne 2), dernier recours si toutes les
sources réseau échouent **et** qu'aucun `tle_cache.json` n'existe. Livré,
volontairement minimal (les vrais TLE viennent du réseau). `parse_tle` le lit
comme n'importe quelle source.

---

## `station.json`

Config de la station. **Partiel par construction** : `GET /api/station` renvoie
toujours `DEFAULT_STATION` recouvert par le fichier, donc une nouvelle clé
ajoutée à `DEFAULT_STATION` arrive chez tout le monde sans migration.

```json
{
  "callsign": "F4MAJ",
  "locator": "JN37QS",
  "city": "Illzach",
  "lat": 47.7719, "lon": 7.3444, "alt_m": 240,
  "antenna": { "type": "omnidirectionnelle fixe", "height_m": 9,
               "rotor": false, "cone_of_silence_deg": 75 },
  "rig": { "model": "Yaesu FTM-500D", "cat": false,
           "soundcard": "Digirig", "tuning_step_khz": 5 },
  "min_elevation_deg": 5,
  "horizon_deg": 0,
  "timezone": "Europe/Paris",
  "forecast_hours": 48,
  "alert": { "lead_min": 10, "min_elevation_deg": 20, "skip_zenith": true },
  "configured": false
}
```

| Clé | Effet |
|---|---|
| `lat` / `lon` / `alt_m` | position de l'observateur (SGP4). Le formulaire les calcule depuis le `locator` (`locatorToLatLon`) |
| `antenna.height_m` | ajouté à `alt_m` pour la hauteur de l'observateur |
| `antenna.cone_of_silence_deg` | seuil « Zénith » (défaut 75°) — au-delà, un passage est signalé moins bon (creux au TCA sur une verticale) |
| `rig.tuning_step_khz` | pas du plan Doppler / export CHIRP (défaut 5) |
| `min_elevation_deg` | passages ignorés en dessous ; **définit aussi la fenêtre exploitable** (empreinte radio, liaison carte, bandeau « exploitable ») |
| `horizon_deg` | horizon géométrique (réservé, 0 par défaut) |
| `forecast_hours` | horizon de prédiction (défaut 48) |
| `alert.lead_min` | minutes d'avance de la notification |
| `alert.min_elevation_deg` | élévation min pour **déranger** (volontairement > `min_elevation_deg`) |
| `alert.skip_zenith` | ne pas annoncer les passages qui culminent dans le cône de silence |
| `configured` | `false` → l'interface affiche un rappel non bloquant « mets ton indicatif dans Réglages » ; passe à `true` au 1er enregistrement |

Écriture : `POST /api/station` → `deep_merge` → écriture atomique sous `_lock`.

---

## `qso.json`

Journal de trafic. Tableau, un objet par contact :

```json
{ "id": 1788696112345, "utc": "2026-09-06T12:00:00+00:00",
  "call": "F1ABC", "grid": "JN38", "rst_s": "59", "rst_r": "59",
  "sat": "AO-73", "mode": "SSB", "freq": "145.9600", "band": "2M",
  "note": "via AO-73" }
```

`id` et `utc` sont posés par le serveur. Export : `GET /api/qso.adi`.

---

## Caches (runtime, non versionnés)

| Fichier | Contenu | Âge max | Écrit par |
|---|---|---|---|
| `tle_cache.json` | `{fetched_at, sats:{nom:{name,l1,l2,norad}}, errors, stale}` | 1 h | `refresh_tle` |
| `iss_status.json` | sortie de `parse_iss_status` + `checked_at` | 1 h | `refresh_iss_status` |
| `weather_cache.json` | `{fetched_at, lat, lon, now, later, stale}` | 30 min | `refresh_weather` |
| `vendor/` | `satellite.min.js`, `leaflet.js/.css`, `fonts.css` + `fonts/`, `icons/` | — | `ensure_*` |

Supprimer un cache = il se régénère au prochain passage du worker (ou au
rechargement de la page). Changer de version Reicon : bump `REICON_VERSION` dans
`app.py` puis vider `data/vendor/icons/`.
