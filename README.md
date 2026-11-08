# Atelier Portefolio — François Pichon, économètre

Portfolio full-stack en **TypeScript** : un frontend **React + Vite**, une API **Express**, et une librairie partagée de modèles statistiques utilisée des deux côtés.
Chaque projet a **sa propre page, habillée à l’image de son sujet**, avec un **module interactif** construit à partir des résultats du rapport.

| Projet | Habillage | Module interactif |
| --- | --- | --- |
| Scoring assurance auto (M2) | encre & or, tableau de bord de risque | simulateur de décision : seuil, coûts FN/FP, portefeuille de 100 assurés, ROC, gains |
| Catalogue Netflix (M2) | codes d’une plateforme de streaming | bascule Films / Séries, rangées Top 10, évolution des genres, publics |
| Avis clients Flunch (M2) | enseigne de restauration, papier & rouge | « classez un avis » (dictionnaire du projet), nuages, familles, carte de l’AFC, adjectifs |
| Churn télécom — modèles de durée (M2) | éditorial vert | courbe de Kaplan–Meier pilotée au curseur, hasard discret mois par mois, cohorte de 100 abonnés |
| Volatilité du S&P 500 — ARCH/GARCH (M2) | journal financier + terminal | séries réelles numérisées (rendements, σ̂ₜ, résidus), ACF, moments de l’ARCH(1), simulateur GARCH(1,1) |
| Immobilier à Arras — économétrie spatiale (M2) | papier & plan cadastral | carte des sections, tests de Rao (W kNN / W sections), laboratoire de l’I de Moran (test par permutations via l’API), AIC, effet de taille OLS / SDEM, note théorique (série de Neumann, matrice d’impacts) |
| Offre de travail & sélection (M2) | nuit bleue & lavande, « ligne de flottaison » | probit pas à pas (AIC), matrice des signes, laboratoire du biais de sélection |
| Leboncoin VO — architecture décisionnelle (M2) | petites annonces | testeur de la règle qualité, pipeline médaillon, schéma en étoile, tableaux Power BI |
| Stage ECM (2026) | identité du portfolio | réplique de l’outil de reporting (sans données internes) |
| Santé infantile en Inde — mémoire M1 | couverture marine & lavande | entonnoir de l’échantillon, lecteur de score Z, gradient social, logits (log-odds / odds ratios), concentration et décomposition de Wagstaff |
| Recours aux soins en Europe — SHARE (M1) | éditorial vert & brique | carte des 11 pays (4 mesures), profils consultants / non-consultants, modèles emboîtés M1 → M4 |
| Marché immobilier du Maine-et-Loire (M1) | étude de marché, ardoise & terre cuite | anneaux autour d’Angers, saisonnalité radiale, R² des 4 spécifications, estimateur de prix (modèle 1, contributions) |
| Scoring marketing (M1) | publipostage (enveloppe par avion) | déciles, V de Cramér, sélection stepwise pas à pas, calculateur de score (formule SAS, vérifiable côté serveur), ROC |
| Prévision ARIMA / SARIMA | deux séries | démarche Box–Jenkins pas à pas |
| Porsche — Power BI | automobile premium | sélecteur de gamme + rapports Power BI |
| DataMind — agent d’analyse de données (perso) | signature DataMind (indigo), captures claires et sombres de l’app | bouton « Essayer la démo » vers la démo publique de l’app (jeux d’exemple, IA du serveur) |
| **Suite Atelier — IA & développement (perso)** | système commun de la suite (charte v2 « Linear ») | schéma de la suite sur l’accueil (section « Le coin atelier ») |
| Atelier Nexus — hub d’agents IA | signature Nexus (orange) | orchestrateur, 17 agents, validation humaine, workflows rejouables |
| Atelier Viz — BI locale | signature Viz (or) | rapports multipages, 22 visuels, export PowerPoint |
| Atelier Tab — tableur & base | signature Tab (vert) | moteur de formules, serveur MCP (25 outils) |
| Atelier Convert — relevés → tables | signature Convert (ocre) | lecture PDF / OCR, contrôle des soldes |
| Atelier Projets — gestion de projet | signature Projets (vert olive) | Gantt interactif, Git/GitHub, IA locale |
| Atelier Trésorerie — finances | signature Trésorerie (bleu roi) | budgets, tableaux de bord, IA 100 % locale |
| Atelier Mission — mini-CRM freelance | signature Mission (ambre) | devis, factures Malt et Factur-X, relances, liens Projets / Trésorerie |
| Agent Ops Lab — TMS piloté par un agent IA | signature Ops Lab (améthyste) | agent de dispatch, validation humaine, carte de la flotte |

Les rapports PDF de chaque projet sont téléchargeables depuis sa page (`client/public/reports`).

### Démos interactives (`/demos`)

Chaque démo tourne entièrement dans le navigateur du visiteur (`client/src/demos/<slug>/`, déclarée dans `client/src/demos/registry.ts`) et a sa tuile dans la Vitrine pro du portail.

| Démo | Ce qu'elle montre |
| --- | --- |
| Observatoire immobilier | prix au m² DVF par commune, carte, tendances, estimation |
| E-commerce en temps réel | boutique simulée, KPI en direct, cartes de contrôle EWMA |
| Labo A/B et inférence causale | taille d'échantillon, significativité, puissance, diff-in-diff |
| Prévision de ventes | CSV → prévision avec intervalles et validation hors échantillon |
| SQL Lab | SQLite (sql.js, WebAssembly) sur la base fictive Comptoir Lumen, 9 défis corrigés automatiquement |
| Qualité des données | profil d'un CSV, score de qualité par dimension, nettoyage avec aperçu |
| Tableau de bord | KPI filtrables de Comptoir Lumen, comparaison N-1, cohortes de fidélité |
| Modélisation de données | schéma relationnel éditable, diagnostic de normalisation, DDL multi-dialecte testé dans SQLite |

Le moteur SQLite est compilé en WebAssembly : la politique de sécurité du serveur autorise `'wasm-unsafe-eval'` (et rien d'autre de plus) dans `script-src`.

### Apparence

- **Enveloppe du site** (accueil, projets, IA & dev, CV, contact, 404, barre et pied de page, lien « Portfolio » des pages projets) : système commun de la Suite Atelier, charte v2 « Linear » (`Atelier_Deploy/DESIGN.md`) — structure crème en clair et bleu nuit en sombre, Inter, plat, accent = signature du portfolio (ardoise `#4a5468`, `data-atelier-app="portfolio"`). Styles : `client/src/styles/site.css`, tous scopés sous `.site`.
- **Cartes de chiffres** : les chiffres clés (rangée « projets / applications / rapports / familles » de l’accueil, chiffres des cartes projets, indicateurs des démos E-commerce, Labo A/B et Observatoire) sont des cartes arrondies à la forme de `.atelier-kpi` (trait de 1 px, coins de 12 px `--atelier-radius-xl`, plates), en rangées espacées plutôt qu’en bandes à filets.
- **Marque v2** : copie verbatim de `Atelier_Projets/design-system/brand/` dans `client/public/atelier-brand/` (`atelier-brand.css`, `atelier-theme.js`, Inter + licence), chargée par `client/index.html`. Toute modification se fait à la source puis dans la copie.
- **Thème** : Système / Clair / Sombre, préférence commune à la suite (`window.atelierTheme`) : cookie `atelier_theme` sur le VPS (`portfolio.atelier.<domaine>`), `localStorage` ailleurs (adresse Netlify, local).
- **Pages à habillage propre** : inchangées, elles gardent leurs couleurs et polices quel que soit le thème.
- **Pages des apps de la Suite Atelier** : gabarit éditorial dans la variante `.ed--atelier` (système de la suite, icône carrée et signature de l’app, clair / sombre).

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
docker run -p 8787:8787 portfolio
```

Variables d’environnement : voir [`.env.example`](.env.example). Le site n’appelle aucune IA.
À la construction, `VITE_DATAMIND_DEMO_URL` donne l’adresse de la démo publique de DataMind (bouton « Essayer la démo » de `/projets/datamind`) ;
sur le VPS, `Atelier_Deploy` la fixe à `https://demo-datamind.<domaine>`. Vide : le bouton est remplacé par une mention.

## Architecture

```
shared/   types du contenu, catalogue des projets, modèles (logit, survie, GARCH, Moran, Heckman, lexique d’avis) + tests
server/   API Express 5 : contenu, profil, prédictions et simulations, contact ; data/ = fiches JSON
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

## Modifier le contenu

- **Profil, compétences, parcours** : `server/data/profile.json`
- **Un projet** : `server/data/projects/<slug>.json` (texte, chiffres clés, tableaux, données des graphiques, modèle)
- **Ordre, couleurs, logos, rapports, liens Power BI** : `shared/src/catalog.ts` (apps de la Suite Atelier : champ `atelierApp`, icônes carrées dans `client/public/img/atelier/<app>.svg`)
- **Ajouter un projet** : une fiche JSON + une entrée au catalogue suffisent (la page générique l’affiche) ; une page thématisée peut ensuite être ajoutée dans `client/src/projects/<slug>/` et déclarée dans `registry.ts`.

Les fiches ont été rédigées à partir des rapports de chaque projet : tous les chiffres viennent des documents. Sans rapport fourni, les fiches ARIMA / SARIMA, Porsche et stage ECM reprennent le contenu de l’ancien site ; la fiche DataMind décrit l’application (README d’Agent_Data) et ses captures sont faites sur ses jeux d’exemple fictifs.
Les marques citées (Netflix, Flunch, Leboncoin, Porsche…) sont les sujets des études ; les logos de Netflix, Flunch et Leboncoin (`client/public/img/brands/`) servent uniquement à identifier le sujet de chaque étude.

---

© François Pichon — contenus et rapports. Code de l’application : usage personnel.
