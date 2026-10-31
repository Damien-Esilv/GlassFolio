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
- **UI / Theming** : Tailwind 3 **compilé au build** (`tailwind.config.ts`, `src/index.css`, aucun script tiers) + **classes sémantiques** mappées sur variables CSS.
- **i18n** : `i18next` + `react-i18next`, traductions dans `locales/`.
- **Charts** : Recharts. **Icons** : lucide-react.
- **Data** : couche `src/services/` + `src/services/db.ts` (mock `localStorage`) avec **délai artificiel** à conserver.
- **Cible (non implémentée)** : déploiement Vercel + InstantDB, sans API REST lourde.
- **Vercel** : deux projets sur le même dépôt et le même `vercel.json`. `glassfolio-showcase` sert le site public prérendu (`glassfolio.dev`, test : `dev-showcase.glassfolio.dev`) ; `glassfolio-app` sert l'application (`app.glassfolio.dev`, test : `dev-app.glassfolio.dev`). `scripts/vercel-build.mjs` choisit le build selon le projet. Les pages publiques se déclarent dans `src/config/publicRoutes.ts`, leurs textes SEO dans `locales/{en,fr}/seo.json`. La redirection entre `www` et l'apex se règle uniquement dans les domaines Vercel.

## Structure du repo (actuelle)

```
GlassFolio/
├── src/
│   ├── main.tsx, App.tsx, ShowcaseApp.tsx   # Points d'entrée
│   ├── pages/       # Pages routées (Dashboard, Portfolio, Transactions, …)
│   ├── components/  # Composants UI réutilisables (Layout, cards, boutons, …)
│   ├── context/     # Auth/Data context (thèmes, préférences, auth)
│   ├── hooks/       # Hooks React
│   ├── utils/       # Utilitaires (ex: CSV)
│   ├── services/    # Couche data (db.ts + services)
│   └── types/       # Interfaces TypeScript (barrel : src/types/index.ts)
├── server/          # Runtime Node sans dépendance (serveur Docker, proxy Yahoo, coffre local)
├── docker/          # Dockerfile de l'image auto-hébergée (+ docker-compose.yml à la racine)
├── locales/         # Traductions i18n (en/, fr/)
├── test-data/       # CSV d'exemples (imports)
├── tailwind.config.ts / postcss.config.js  # Build Tailwind (couleurs = variables CSS)
└── index.html       # Point d'entrée HTML (méta, JSON-LD) — aucun script tiers
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
  - Toute modification de `--color-positive` dans `src/index.css` doit cascader sur l'ensemble des écrans sans contradiction sémantique.
- **Form elements** : respecter le pattern `bg-subtle text-primary border-subtle focus:ring-primary focus:border-primary`.
- **Data access** : les composants/pages ne touchent jamais `localStorage` directement ; passer par `src/services/`.
- **Mode local = serveur source de vérité** : en mode local (Docker / `npm run dev`), les clés `glassfolio_*`, `gf_vault_header` et `gf_manual_price_history` sont persistées sur le serveur (`isServerPersistedKey` + liste blanche `server/localVault.mjs`, vérifiées par un test). Une nouvelle donnée utilisateur doit donc utiliser le préfixe `glassfolio_` ; seules les préférences d'appareil (thème, langue, consentement, état UI) restent dans le navigateur.
- **CSP & en-têtes de sécurité** : source unique `server/securityHeaders.mjs` (Docker + `vercel.json` généré par `npm run security:headers`, vérifié par `check:standards` et par le smoke post-déploiement). `script-src 'self'` : aucun script tiers, aucun `unsafe-eval`. Tout nouvel hôte appelé par l'app (API, images) doit être ajouté à la liste de ce fichier (un test scanne `src/` et échoue sinon).
- **Trusted Types** : la CSP exige `require-trusted-types-for 'script'`. Jamais de `innerHTML`/`dangerouslySetInnerHTML` avec une chaîne brute : passer par une politique nommée de `src/services/security/trustedTypes.ts` (liste des noms dans `TRUSTED_TYPES_POLICIES`, vérifiée par test). Le SVG du QR TOTP est toujours dessiné localement, jamais pris tel quel d'un serveur.
- **Exposition réseau Docker** : `GLASSFOLIO_BIND` hors loopback exige `GLASSFOLIO_ACCESS_TOKEN` (≥ 16 car., HTTP Basic, utilisateur `glassfolio`) ; `docker:up` refuse sinon.
- **Chaîne d'approvisionnement** : image Docker épinglée par digest, GitHub Actions épinglées par SHA de commit, paquets npm par intégrité du lockfile ; `npm run check:supply-chain` doit rester vert.
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

Pour garantir une traçabilité logicielle de niveau professionnel visible des recruteurs et des auditeurs :

1. **Deux branches permanentes : `develop` (test) et `main` (production)** :
   - `develop` est rattachée sur Vercel à un domaine de branche **stable** (`dev-showcase.glassfolio.dev` et `dev-app.glassfolio.dev`) : c'est l'environnement de test en conditions réelles (Google OAuth, Turnstile, Supabase y sont déclarés une seule fois). **Elle n'est jamais supprimée.**
   - `main` est une branche protégée réservée exclusivement aux versions de production, alimentée uniquement depuis `develop`.
   - **Interdiction formelle de commiter directement sur `develop` ou `main`** : on y entre uniquement par merge d'une branche de travail (vers `develop`) ou par promotion de `develop` (vers `main`).
   - **L'agent IA ne doit JAMAIS fusionner sur `develop` ni sur `main` de sa propre initiative**, même si tous les tests et la CI passent au vert. Le merge vers `develop`, puis la promotion vers `main`, s'effectuent **UNIQUEMENT lorsque l'utilisateur le demande de manière claire et explicite** dans le fil de discussion. Le push d'une branche de travail sur `origin` reste libre.
   - Toute tâche (`TGLA-XXX`), refactorisation ou correction **doit obligatoirement démarrer par la création et la bascule sur une branche dédiée, créée depuis `develop` à jour** (depuis `main` seulement pour un hotfix de production) :
     - `feat/tgla-XXX-<short-slug>`
     - `fix/tgla-XXX-<short-slug>`
     - `chore/tgla-XXX-<short-slug>`

2. **Gestion des Branches, Consolidation des Commits & Zéro Pollution Distante** :
   - Tout commit sur la branche de travail doit suivre le standard Conventional Commits : `feat(scope): message`, `fix(scope): message`, `test(scope): message`, etc.
   - **Cycle d'itération sur la branche** : L'IA a l'entière liberté de créer des commits intermédiaires ou correctifs sur la branche dédiée afin de valider localement et déclencher les workflows CI GitHub Actions.
   - **Consolidation obligatoire avant merge dans `develop` (Squash en 1 seul commit avec traçabilité Notion complète)** :
     - Le squash vaut pour **toutes** les branches de travail, grosses features comme micro-corrections : chacune entre dans `develop` sous la forme d'un seul commit. C'est ce qui rend ensuite une feature promouvable seule vers `main` (cf. point 6).
     - Lorsque l'utilisateur demande explicitement le merge dans `develop`, l'ensemble des commits intermédiaires, micro-ajustements cosmétiques ou essais de la branche de feature doivent impérativement être **consolidés / squashe en un seul commit atomique et auto-suffisant** représentant la livraison complète et fonctionnelle.
     - **Préservation intégrale des identifiants Notion dans le message de commit consolidé** :
       - Le titre et le corps du commit squashed unique **DOIVENT impérativement citer TOUS les identifiants de tâches (`TGLA-xxx`) et bugs (`BUG-xxx`)** concernés par la branche :
         ```gitcommit
         feat(epic-XX): description synthétique de la fonctionnalité (TGLA-097, TGLA-098, TGLA-099, TGLA-100)

         Closes TGLA-097
         Closes TGLA-098
         Closes TGLA-099
         Closes TGLA-100
         ```
       - Le workflow CI GitHub Actions `notion-sync` (`scripts/notion-sync.mjs`) extrait automatiquement l'ensemble de ces clés `TGLA-*`, passe chacune de ces tâches à `Fait` dans Notion et lie directement l'URL et le hash du commit squashed final.
       - Ainsi, **l'historique Git sur `main` reste 100% linéaire et propre**, et **100% de la traçabilité Notion est préservée** vers ce commit de livraison unique.
     - **Nouveautés publiques (changelog) à chaque merge** : le commit squashé ajoute une entrée en tête de `src/constants/changelog.ts` (version, date ISO, points forts typés `new`/`improved`) et ses textes dans `locales/{en,fr}/changelog.json`, rédigés pour l'utilisateur (bénéfices, pas de détail technique ni de correctif de sécurité). `tests/unit/constants/changelog.test.ts` vérifie l'ordre, l'unicité des versions et la parité EN/FR. La page `/roadmap` (`src/constants/roadmap.ts`) se met à jour quand un epic produit change de statut, sans jamais y lister de sujet sécurité.
     - **Forme du merge** : lorsque l'utilisateur demande de « merger », l'agent **squashe d'abord les commits de la branche en un seul commit**, puis fusionne cette branche dans `develop` avec un **commit de merge explicite** : `git merge --no-ff <branche> -m "merge: integrate <branche> into develop"`. **Jamais de fast-forward** (`--ff-only`) : l'historique GitHub doit montrer la branche qui part de `develop` puis y revient, avec le commit squashé et le commit de merge.
     - Résultat attendu sur `develop` : un commit de merge `merge: integrate <branche> into develop` dont le second parent est l'unique commit de la feature (message contenant tous les `TGLA-xxx` / `BUG-xxx` et les lignes `Closes`).
   - **Nettoyage drastique des branches distantes** : Dès qu'une branche de travail est fusionnée dans `develop`, la branche distante associée doit obligatoirement être supprimée de GitHub (`git push origin --delete <branch>`). Seules `main` et `develop` sont permanentes ; aucune branche orpheline ou obsolète ne doit polluer le dépôt distant.

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
   - `public` : dépôt miroir public en code source disponible, licence PolyForm Noncommercial (uniquement les releases propres validées de `main`).
   - Synchronisation vers la vitrine publique :
     ```bash
     git checkout main
     npm run check:standards && npm test
     git push public main:main --tags
     ```

6. **Promotion `develop` → `main` (production)** :
   - Uniquement sur demande explicite de l'utilisateur, et uniquement pour du travail **déjà testé sur `dev-showcase.glassfolio.dev` et `dev-app.glassfolio.dev`**.
   - **Tout `develop` est prêt** : `git merge --no-ff develop -m "merge: promote develop into main"`. **Jamais de squash de `develop`** (les deux branches divergeraient durablement).
   - **Seulement certaines features sont prêtes** : chaque feature étant un commit unique sur `develop`, la reprendre avec `git cherry-pick -x <hash>` sur une branche issue de `main`, puis merge `--no-ff` dans `main`. Citer les `TGLA-xxx` / `BUG-xxx` correspondants.
   - **Resynchronisation obligatoire** : juste après, fusionner `main` dans `develop` (`git merge --no-ff main`) pour éviter toute dérive ; un hotfix fait sur `main` suit le même chemin.
   - Les 6 gates locales et la CI distante doivent être vertes avant la promotion ; la synchro Notion, le changelog public et la vitrine (`public`) se font à ce moment-là.

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
| `src/index.css` + `tailwind.config.ts` | Tokens (variables CSS par thème) ; `tailwind.config.ts` en dérive **automatiquement** (`--color-x`→`bg-x`/`text-x`/…, `--text-x`, `--bg-x`, `--border-x`) | Déclarer une couleur **une seule fois**, comme variable dans `src/index.css` (dans `:root` et les thèmes) ; ne jamais la lister dans `tailwind.config.ts` (test `tailwindTheme`) |
| `index.html` | Entrée HTML | Aucun `<script src>` tiers (vérifié par test) |
| `locales/` | Source de vérité des textes | Ne jamais supprimer une clé sans rechercher ses usages |
| `src/services/` | Contrat data & futur InstantDB | Ne pas casser les interfaces ; pas de `localStorage` depuis les composants |
| `src/context/AuthContext.tsx` | Gestion thèmes + préférences | Respecter le mécanisme `data-theme` + `.dark` |

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
