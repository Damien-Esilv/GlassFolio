# AGENTS — GlassFolio (source de vérité)

Ce fichier est la **source de vérité** pour les agents IA intervenant sur ce dépôt.

## Prime directive

Avant d'écrire ou modifier du code, **lire et respecter** `AI_CODING_STANDARDS.md`.
En cas de conflit entre des règles, `AI_CODING_STANDARDS.md` prime.

---

## Contexte projet

- **Type** : Application web frontend (Vite + React). Pas de backend à ce stade.
- **Objectif** : Dashboard financier « premium » (portefeuille, transactions, positions, objectifs), **offline-first** et prêt pour une future migration InstantDB.
- **Contraintes clés** : multi-thèmes (Light/Dark/Midnight), i18n FR/EN, zéro hardcoding (texte + visuel), typage strict.

## Stack technique (réelle)

- **Frontend** : React, React Router, TypeScript, Vite.
- **UI / Theming** : Tailwind via CDN dans `index.html` + **classes sémantiques** mappées sur variables CSS.
- **i18n** : `i18next` + `react-i18next`, traductions dans `locales/`.
- **Charts** : Recharts. **Icons** : lucide-react.
- **Data** : couche `src/services/` + `src/services/db.ts` (mock `localStorage`) avec **délai artificiel** à conserver.
- **Cible (non implémentée)** : déploiement Vercel + InstantDB, sans API REST lourde.

## Structure du repo (actuelle)

```
GlassFolio/
├── pages/           # Pages routées (Dashboard, Portfolio, Transactions, …)
├── components/      # Composants UI réutilisables (Layout, cards, boutons, …)
├── context/         # Auth/Data context (thèmes, préférences, auth)
├── src/services/    # Couche data (db.ts + services)
├── src/types.ts     # Interfaces TypeScript
├── locales/         # Traductions i18n (en/, fr/)
├── utils/           # Utilitaires (ex: CSV)
├── test-data/       # CSV d'exemples (imports)
├── index.html       # Variables CSS + injection Tailwind CDN
└── curated-agent-kit/  # Pack réutilisable (référence) — pas la source de vérité
```

> ℹ️ Il n'y a plus de dossier `docs/` dans ce dépôt. Toute la documentation projet (features, ADRs, sessions IA, codemaps) est centralisée dans le coffre Obsidian global accessible via le serveur MCP `obsidian`.

---

## Règles non négociables (résumé opérationnel)

Les détails complets sont dans `AI_CODING_STANDARDS.md`.

- **Zéro texte UI en dur** : tout texte visible passe par i18n (`t('namespace:key')`) et doit exister en `locales/en` + `locales/fr`.
- **Zéro valeur visuelle codée en dur & Tokens sémantiques d'intention** :
  - Pas de hex, raw RGB/RGBA, ni classes Tailwind brutes (`text-emerald-*`, `bg-rose-*`, `text-amber-*`, etc.) dans les `.tsx`.
  - Utiliser obligatoirement les tokens d'intention `positive`, `negative`, `warning`, `neutral`, `brand` (`THEME_INTENT` de `src/constants/themeTokens.ts`) et les micro-composants `<TrendValue>` / `<TrendBadge>`.
  - Pour les comparatifs multi-courbes et dashboards comparatifs (jusqu'à 8 couleurs sans confusion avec les gains/pertes), utiliser `CHART_SERIES_PALETTE` via `getComparisonSeriesTokens(index)` ou `getAssetStableColor(symbol)`.
  - Toute modification de `--color-positive` dans `index.html` doit cascader sur l'ensemble des écrans sans contradiction sémantique.
- **Form elements** : respecter le pattern `bg-subtle text-primary border-subtle focus:ring-primary focus:border-primary`.
- **Data access** : les composants/pages ne touchent jamais `localStorage` directement ; passer par `src/services/`.
- **Dates** : stocker/transporter en **ISO 8601 string** ; ne pas persister de `Date` brute dans le mock DB.
- **Typage strict** : pas de `any` ; types explicites, retours explicites sur les services.
- **Latence simulée** : ne pas supprimer le `delay(ms)` des services/mock DB.
- **AI-First & Compatibilité MCP Systématique** :
  - **Toute nouvelle fonctionnalité ou entité métier** (ex: emprunts, actifs, alertes, budgets) **DOIT obligatoirement** déclarer ses outils IA correspondants dans `src/services/ai/tools/` et les enregistrer dans `aiToolRegistry`.
  - **Human-in-the-loop obligatoire** : Toute action provoquant une modification ou création de données financières réelles **DOIT** définir `requiresConfirmation: true` afin d'exiger une validation explicite de l'utilisateur avant exécution.
  - **Objectif zéro rétro-ingénierie** : Tout nouveau développement doit être immédiatement exploitable par l'assistant In-App et les clients MCP externes (Claude Desktop, Cursor, Antigravity) dès son implémentation.

---

## Workflow agent (low-token)

### Priorité de contexte

1. Lire `AI_CODING_STANDARDS.md` (règles techniques) + ce fichier (règles projet).
2. **MCP `memory`** (`glassfolio.json`) — mémoire persistante inter-sessions. Fichier : `$HOME/Developpement/memory/glassfolio.json` (ou via `MEMORY_FILE_PATH`). Contient le graphe d'entités, relations et observations du projet. Interroger `read_graph` ou `search_nodes` avant toute exploration de code.
3. **MCP `obsidian`** — coffre global (`$HOME/Developpement/brain`) : lire les specs de features, ADRs, sessions IA et codemaps dans le dossier `GlassFolio/`.
4. **Explorer le code en ciblé** : `grep_search` / recherche par symbole avant d'ouvrir de gros fichiers.
5. N'ouvrir des fichiers bruts que pour un détail précis et uniquement les portions pertinentes.

### Utilisation du MCP Obsidian

Le coffre s'appelle `brain`. Les notes GlassFolio sont dans le sous-dossier `GlassFolio/` :

| Dossier | Contenu | Quand le consulter |
|---|---|---|
| `GlassFolio/00-Index/` | Vue d'ensemble projet, stack, contraintes | Début de session |
| `GlassFolio/01-Architecture/` | Architecture système, data flow | Avant tout changement structural |
| `GlassFolio/02-Features/` | Specs features (FEAT-KEY-Name.md) | Pour comprendre le périmètre d'une feature |
| `GlassFolio/03-Decisions/` | ADRs (décisions d'architecture) | Avant de choisir une approche technique |
| `GlassFolio/04-Relationships/` | MOC, dépendances modules | Pour comprendre l'impact d'un changement |
| `GlassFolio/05-Sessions-IA/` | Logs de sessions (écriture après PR majeure) | Pour retrouver des décisions passées |
| `GlassFolio/06-Summaries/` | Codemaps pages/components/services | Alternative rapide à la lecture de code |

### Protocole maintenance documentaire & Notion MCP (Règle d'Ingénierie Stricte)

L'espace Notion est un reflet contractuel et professionnel de l'état du code source. Tout agent IA intervenant sur le dépôt doit **obligatoirement** respecter les règles suivantes à chaque session ou PR (> 3 fichiers) :

1. **Moments de Synchronisation Notion (Étape Pré-Commit Obligatoire)** :
   - **Pendant la phase exploratoire ou itérative** : Ne pas polluer Notion à chaque micro-changement qui pourrait être annulé ou retravaillé en cours de route.
   - **AVANT de commiter et pusher (Point de Validation Définitif)** :
     - Dès que l'utilisateur valide le résultat ou demande de commiter/pusher, l'agent IA **doit obligatoirement mettre à jour Notion AVANT de créer le commit Git**.
     - **Harmonisation et complétude** : Si l'utilisateur a créé manuellement des tâches ou epics avec seulement un titre sommaire et des colonnes vides, l'IA a pour consigne explicite de les **réécrire pour un rendu clair, précis et professionnel**, et de **remplir 100% des colonnes manquantes**.
     - Si de nouvelles tâches ou sous-tâches ont été réalisées, les insérer dans `Database - Tâches` et les rattacher à l'Epic et au Sprint actif.

2. **Règle du Zéro Omission sur les colonnes Notion** :
   - Toute tâche créée ou mise à jour dans `Database - Tâches` doit **remplir 100% de ses colonnes** :
     - `Tasks` (Titre clair, rédigé professionnellement)
     - `ID of tasks` (Code unique formaté `TGLA-xxx`)
     - `Type` (`Fonctionnalité`, `Architecture`, `Sécurité`, `Qualité`, `Test`, `Bug`, `Autre`)
     - `Statut` (`En cours`, `Fait`, `Prêt à commencer`, `Bloqué`)
     - `Priorité` (`Critique`, `Élevée`, `Moyenne`, `Faible`, `Meilleur effort`) — **INTERDICTION ABSOLUE de laisser sur `Manquant`**.
     - `Epic` (Liaison bidirectionnelle obligatoire vers l'Epic parent)
     - `Sprint` (Liaison bidirectionnelle obligatoire vers le Sprint adéquat)
     - `Admin` (Assignation `Damien`)
   - Le corps Markdown de la fiche de tâche **doit obligatoirement inclure la section `### 🔗 Traçabilité Git & Software Engineering`** (hashes de commits, nom de la branche, et résultat des tests CI).

3. **Traçabilité Multi-Tâches & Epics dans Git** :
   - **Lorsqu'un commit ou une PR couvre plusieurs tâches (`TGLA-xxx`) ou un Epic entier** :
     - Le message de commit / description de PR **doit obligatoirement citer tous les identifiants** (ex: `feat(epic-21): complete settings overhaul (TGLA-083, TGLA-084, TGLA-085)`).
     - Dans le corps du commit ou de la PR, lister explicitement :
       ```markdown
       Closes TGLA-083
       Closes TGLA-084
       Closes TGLA-085
       ```
     - Le workflow `notion-sync` scannera l'ensemble de ces identifiants et passera automatiquement chaque tâche à `Fait` sur Notion avec le lien du commit/PR.
   - **Mise à jour en direct pendant le développement** :
     - Lorsque l'Epic est achevé et mergé sur `main`, la `Phase` de l'Epic parent dans `Database - Epics` doit être basculée sur `Done` / `Version définitive`.

4. **Gouvernance des Sprints & Epics** :
   - **Sprint actif obligatoire** : Tout développement doit être rattaché à un Sprint dont `Sprint actif = true`.
   - **Démarrage d'un nouvel Epic / Gros Chantier** : Si aucun sprint actif ne correspond au chantier, créer un nouveau Sprint dans `Database - Sprints` avec :
     - `Name`, `Monday Groups`, `Objectifs du sprint`, `Date de début`, `Date de fin`, `Échéancier du sprint`, `Terminé ? = false`, `Sprint actif = true`.
     - Désactiver (`Sprint actif = false`) le sprint précédent si applicable.
   - **Clôture de Sprint** : Dès que l'ensemble des tâches d'un sprint actif sont terminées et validées par la CI (`npm test`, `npm run check:types`, `npm run check:i18n`), marquer le sprint avec `Terminé ? = true` et `Sprint actif = false`.
   - **Échéanciers & Dates sur les Epics** : Renseigner systématiquement `Échéancier planifié` (start / end) sur les Epics, et basculer la `Phase` à `Done` ou `Version définitive` à la livraison. Pour les Epics en étude, maintenir la phase `Phase d'étude` avec dates prévisionnelles et priorités explicites.

5. **Maintenance des Bugs & Retouches UI vs Consolidation Git** :
   - Les micro-ajustements UI (boutons, marges, fixes cosmétiques) vont dans `Database - Bugs` (`Amélioration / Retouche UI`).
   - Tout bug résolu par un fix ou vérifié conforme en CI doit être immédiatement passé à `Corrigé` dans Notion.
   - **Consolidation Git vs Suivi des Tâches** :
     - Pendant les itérations sur la branche de feature, des commits de fix peuvent exister (`fix: adjust padding`, `fix: typo`).
     - Lors du merge ou squash final sur `main`, pour garder un arbre git épuré tout en préservant le suivi :
       - Le commit consolidé ou la PR conserve dans son message l'identifiant des bugs ou tâches corrigés (ex: `feat(settings): ... (closes TGLA-083, fixes BUG-12)`).
       - Ainsi, `notion-sync` et l'historique Notion conservent 100% de la traçabilité même si les commits intermédiaires ont été condensés.
- **Nouvelle feature structurante** : créer/mettre à jour `FEAT-[KEY]-[nom].md` dans `02-Features/`.
- **Choix architectural** : créer un `ADR-[date]-[titre].md` dans `03-Decisions/`.
- **Changement API d'un service** : mettre à jour le codemap correspondant dans `06-Summaries/`.

### Protocole maintenance MCP Memory (`glassfolio.json`)

Le graphe Memory persisté dans `$HOME/Developpement/memory/glassfolio.json` doit être maintenu à jour :

- **Nouveau module/service/page/composant** : `create_entities` avec type, fichier source, exports, dépendances.
- **Nouvelle dépendance entre modules** : `create_relations` (ex: `PageX depends_on ServiceY`).
- **Modification d'API ou d'interface** : `add_observations` sur l'entité concernée.
- **Suppression de module** : `delete_entities` ou `delete_relations` pour les entrées obsolètes.
- **Après changements majeurs** : `read_graph` pour vérifier la cohérence du graphe.

> ⚠️ Ne jamais lire, modifier ou créer d'autres fichiers dans `$HOME/Developpement/memory/` — seul `glassfolio.json` est géré par ce projet.

### Protocole Git, Branching & DevSecOps (Règle Recruiter-Grade)

Pour garantir une traçabilité logicielle de niveau professionnel visible des recruteurs et auditeurs open-source :

1. **Interdiction formelle de commiter directement sur `main`** :
   - `main` est une branche protégée réservée exclusivement aux versions de production livrables sur Azure et synchronisables vers le dépôt public.
   - Toute tâche (`TGLA-XXX`), refactorisation ou correction **doit obligatoirement démarrer par la création et la bascule sur une branche dédiée** :
     - `feat/tgla-XXX-<short-slug>`
     - `fix/tgla-XXX-<short-slug>`
     - `chore/tgla-XXX-<short-slug>`

2. **Gestion des Branches, Consolidation des Commits & Zéro Pollution Distante** :
   - Tout commit doit suivre le standard Conventional Commits : `feat(scope): message`, `fix(scope): message`, `test(scope): message`, etc.
   - **Consolidation obligatoire des micro-corrections** : Pendant le développement sur une branche dédiée, des commits intermédiaires sont autorisés. Cependant, lors de la fusion ou de la finalisation, tous les micro-ajustements cosmétiques, retouches ou essais successifs d'une même tâche doivent impérativement être **consolidés / fusionnés en un seul commit atomique et auto-suffisant** par feature majeure ou correction.
   - **Arborescence épurée sur `main`** : Sur `main`, chaque commit représente une livraison claire et documentée.
   - **Nettoyage drastique des branches distantes** : Dès qu'une PR est fusionnée dans `main`, la branche distante associée doit obligatoirement être supprimée de GitHub (`git push origin --delete <branch>`). Aucune branche orpheline ou obsolète ne doit polluer le dépôt distant.

3. **Garantie 6-Gates Pré-Merge (Local)** :
   - Avant de fusionner toute branche ou d'ouvrir une PR, les 6 gates doivent impérativement passer à 100% en local :
     - `npm run check:types`
     - `npm run lint`
     - `npm run check:i18n`
     - `npm run check:standards`
     - `npm run test:security`
     - `npm test`

4. **Attente & Validation Obligatoire de la CI/CD GitHub Actions (Distant)** :
   - Dès qu'un commit ou une PR est poussé sur GitHub (`git push`), l'agent IA **a l'obligation stricte d'attendre et vérifier l'exécution des workflows GitHub Actions**.
   - Il est formellement interdit de clore une intervention tant que les checks CI distants ne sont pas terminés et passés avec succès (`success` / vert).
   - En cas d'échec du runner distant (différence d'environnement, timeout, cache), l'agent doit inspecter les logs, corriger le code sur la branche, re-pousser et attendre à nouveau la validation complète de la CI.

5. **Architecture Dual-Remote (Lab Privé vs Vitrine Publique)** :
   - `origin` : dépôt de travail privé (toutes branches de sprint, discussions et historiques détaillés).
   - `public` : dépôt miroir public open-source (uniquement les releases propres validées de `main`).
   - Synchronisation vers la vitrine publique :
     ```bash
     git checkout main
     npm run check:standards && npm test
     git push public main:main --tags
     ```

### Règles tokens / latence

- Toujours préférer une requête MCP structurée à la lecture brute de fichiers.
- Interroger `memory` en premier, puis `obsidian`, puis le code source si la réponse n'y est pas.
- **Changements minimaux** : éviter les refactors esthétiques (renommages, formatage massif) non demandés.
- **Validation** : après changement, vérifier TypeScript et cohérence i18n (clés EN+FR).

---

## Zones sensibles

| Zone | Pourquoi | Règle |
|------|----------|-------|
| `AI_CODING_STANDARDS.md` | Référence architecturale | Toujours prioritaire |
| `index.html` | Tokens (variables CSS) + injection Tailwind | Ne pas inventer des couleurs/classes non sémantiques |
| `locales/` | Source de vérité des textes | Ne jamais supprimer une clé sans rechercher ses usages |
| `src/services/` | Contrat data & futur InstantDB | Ne pas casser les interfaces ; pas de `localStorage` depuis les composants |
| `context/AuthContext.tsx` | Gestion thèmes + préférences | Respecter le mécanisme `data-theme` + `.dark` |

---

## Commandes de développement
 
- `npm install` : installer les dépendances (installe automatiquement le hook pre-commit)
- `npm run dev` : lancer le serveur local (port 3000)
- `npm run check:theming` : valider la conformité des tokens visuels et micro-primitives
- `npm run check:standards` : valider l'ensemble des standards visuels, d'architecture, de sécurité et zéro fuite de chemin
- `npm run check:types` : validation TypeScript stricte (tsc)
- `npm run check:i18n` : contrôle d'exhaustivité des clés i18n FR/EN
- `npm run precommit:check` : bouclier de sécurité local exécuté avant chaque git commit
- `npm run test:security` : exécuter les tests de sécurité (Vault E2EE, guardrails AI, RBAC)
- `npm test` : exécuter la suite de tests unitaires (Vitest)
- `npm run build` : build de prod
- `npm run preview` : prévisualisation du build
