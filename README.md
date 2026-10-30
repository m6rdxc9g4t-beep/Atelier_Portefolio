# Atelier Portefolio — François Pichon, économètre

Portfolio full-stack en **TypeScript** : un frontend **React + Vite**, une API **Express**, et une librairie partagée de modèles statistiques utilisée des deux côtés.
Chaque projet a **sa propre page, habillée à l’image de son sujet**, avec un **module interactif** construit à partir des résultats du rapport.

| Projet | Habillage | Module interactif |
| --- | --- | --- |
| Scoring assurance auto (M2) | encre & or, tableau de bord de risque | simulateur de décision : seuil, coûts FN/FP, portefeuille de 100 assurés, ROC, gains |
| Catalogue Netflix (M2) | codes d’une plateforme de streaming | bascule Films / Séries, rangées Top 10, évolution des genres, publics |
| Avis clients Flunch (M2) | enseigne de restauration, papier & rouge | « classez un avis » (dictionnaire du projet), nuages, familles, carte de l’AFC, adjectifs |
| Churn télécom — modèles de durée (M2) | éditorial vert | courbe de Kaplan–Meier pilotée au curseur, cohorte de 100 abonnés |
| Volatilité du S&P 500 — ARCH/GARCH (M2) | journal financier + terminal | séries réelles numérisées (rendements, σ̂ₜ, résidus), ACF, moments de l’ARCH(1), simulateur GARCH(1,1) |
| Immobilier à Arras — économétrie spatiale (M2) | cartographique | laboratoire de l’I de Moran (on peint une carte), test par permutations via l’API |
| Offre de travail & sélection (M2) | nuit bleue & lavande, « ligne de flottaison » | probit pas à pas (AIC), matrice des signes, laboratoire du biais de sélection |
| Leboncoin VO — architecture décisionnelle (M2) | petites annonces | testeur de la règle qualité, pipeline médaillon, schéma en étoile, tableaux Power BI |
| Stage ECM (2026) | identité du portfolio | réplique de l’outil de reporting (sans données internes) |
| Santé infantile en Inde — mémoire M1 | — | classement des États, inégalités |
| Recours aux soins en Europe — SHARE (M1) | éditorial sarcelle | explorateur pays & modèles emboîtés |
| Marché immobilier du Maine-et-Loire (M1) | annonce immobilière | estimateur de prix hédonique |
| Scoring marketing (M1) | publipostage | calculateur de score client |
| Prévision ARIMA / SARIMA | deux séries | démarche Box–Jenkins pas à pas |
| Porsche — Power BI | automobile premium | sélecteur de gamme + rapports Power BI |
| DataMind — agent data analyst (perso) | terminal vert | exploration CSV + agent IA (proxy serveur) |

Les rapports PDF de chaque projet sont téléchargeables depuis sa page (`client/public/reports`).

## Démarrer

```bash
npm install
npm run dev          # API sur :8787 + site sur http://localhost:5173 (proxy /api)
```

```bash
npm test             # tests des modèles (shared) et de l’API (server)
npm run typecheck
npm run build        # build shared → server → client
npm start            # serveur de production : API + site sur http://localhost:8787
```

Avec Docker :

```bash
docker build -t portfolio .
docker run -p 8787:8787 -e ANTHROPIC_API_KEY=... portfolio
```

Variables d’environnement : voir [`.env.example`](.env.example). `ANTHROPIC_API_KEY` est facultative (elle n’active que l’agent IA de DataMind).

## Architecture

```
shared/   types du contenu, catalogue des projets, modèles (logit, survie, GARCH, Moran, Heckman, lexique d’avis) + tests
server/   API Express 5 : contenu, profil, prédictions et simulations, contact, proxy DataMind ; data/ = fiches JSON
client/   React 19 + Vite : accueil, projets, CV imprimable, une page thématisée par projet (chargée à la demande)
```

### API

| Méthode | Route | Rôle |
| --- | --- | --- |
| GET | `/api/health` | état du serveur |
| GET | `/api/profile` | profil, compétences, parcours |
| GET | `/api/projects?category=` | liste des projets (résumés) |
| GET | `/api/projects/:slug` | fiche complète d’un projet (+ précédent / suivant) |
| POST | `/api/models/:slug/predict` | prédiction du modèle publié dans la fiche (score, bande, décision, contributions) |
| POST | `/api/models/garch/simulate` | trajectoire AR(1)–GARCH(1,1) reproductible |
| POST | `/api/models/moran` | I de Moran sur une grille + p-value par permutations |
| POST | `/api/models/selection` | simulation du biais de sélection et correction de Heckman |
| POST | `/api/nlp/classify` | famille thématique et polarité d’un avis client |
| POST | `/api/contact` | message du formulaire (validation, anti-robots, limitation de débit) |
| GET/POST | `/api/datamind/status`, `/api/datamind/chat` | agent IA (proxy, clé côté serveur) |

## Modifier le contenu

- **Profil, compétences, parcours** : `server/data/profile.json`
- **Un projet** : `server/data/projects/<slug>.json` (texte, chiffres clés, tableaux, données des graphiques, modèle)
- **Ordre, couleurs, rapports, liens Power BI** : `shared/src/catalog.ts`
- **Ajouter un projet** : une fiche JSON + une entrée au catalogue suffisent (la page générique l’affiche) ; une page thématisée peut ensuite être ajoutée dans `client/src/projects/<slug>/` et déclarée dans `registry.ts`.

Les fiches ont été rédigées à partir des rapports de chaque projet : tous les chiffres viennent des documents.
Les marques citées (Netflix, Flunch, Leboncoin, Porsche…) sont les sujets des études ; leurs logos ne sont pas reproduits.

---

© François Pichon — contenus et rapports. Code de l’application : usage personnel.
