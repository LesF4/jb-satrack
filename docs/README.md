# Documentation — JB-SATRACK

Index de toute la doc du projet.

## Prendre le projet en main

| Doc | Pour |
|---|---|
| [`../README.md`](../README.md) | Présentation produit, installation, configuration, méthode FTM-500D |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | **Comment tout s'emboîte** : serveur, interface, flux de données, algorithmes, arborescence |
| [`API.md`](API.md) | Toutes les routes HTTP (`/api/*`, `/vendor/*`) : requête, réponse, comportement |
| [`DONNEES.md`](DONNEES.md) | Chaque fichier de `data/` : schéma, qui l'écrit ; **format du catalogue `satellites.json`** et comment ajouter un satellite |
| [`OPERATIONS.md`](OPERATIONS.md) | Lancer, mettre à jour, **diagnostiquer**, construire l'exe, publier une version |

## Décisions & histoire

| Doc | Pour |
|---|---|
| [`DECISIONS.md`](DECISIONS.md) | Le **pourquoi** des choix structurants (à lire avant de « corriger » un comportement volontaire) |
| [`ETAT.md`](ETAT.md) | Instantané de l'état courant : version, stack, sources de données, ce qui marche, limites connues |
| [`JOURNAL.md`](JOURNAL.md) | Journal d'activité, entrée la plus récente en haut |
| [`TODO.md`](TODO.md) | Ce qui reste à faire |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Journal version par version |
| [`../MODIFICATIONS.md`](../MODIFICATIONS.md) | Détail de la grosse mise à niveau v2.0.0 |

## Références transverses (racine du dépôt)

| Doc | Pour |
|---|---|
| [`../CLAUDE.md`](../CLAUDE.md) | Notes pour agents IA : les règles impératives (stdlib seule, pas de build, banque Reicon, son, contraste…) |
| [`../DESIGN.md`](../DESIGN.md) | Le système visuel |
| [`../PRODUIT.md`](../PRODUIT.md) | Cadrage produit : pour qui, contre quoi, ce qui a été écarté |
| [`../packaging/README.md`](../packaging/README.md) | Détail de l'empaquetage Windows |
| [`../LICENSE`](../LICENSE) | © 2026 F4MAJ — Tous droits réservés (logiciel privé) |

## Contrôles avant de rendre la main

```bash
python app.py --selftest              # logique serveur
```
```
http://localhost:8073/?selftest=1     # logique client (console F12)
```

Voir [`OPERATIONS.md`](OPERATIONS.md#vérifications-intégrées).

---

*Convention de suivi : ces `docs/` suivent le format de
`D:\ClaudeProjets\_PROJETS\CONVENTION.md`. Fiche projet :
`_PROJETS\jb-satrack\FICHE.md`.*
