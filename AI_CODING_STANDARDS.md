# AI CODING STANDARDS & ARCHITECTURAL REFERENCE
> **Status:** ACTIVE | **Version:** 1.1 | **Author:** Lead Architect

## 0. Meta-Instruction (The "Prime Directive")
**ALL AI AGENTS MUST READ THIS DOCUMENT BEFORE WRITING CODE.**
This project is an advanced financial dashboard ("GlassFolio"). Homogeneity, aesthetics, and architectural strictness are paramount. Deviations from these standards will likely break the "Dark/Midnight" themes, the offline-first architecture, or the future InstantDB migration.

---

## 1. UI/UX Architecture & Theming
**Goal:** A "Premium" feel with zero hardcoded values and single-source-of-truth semantic cascading.

### 1.1. No Hardcoding (Hex/RGB/Raw Tailwind Palette)
*   **STRICT PROHIBITION:** Never use hex codes (e.g., `#137fec`), raw RGB/RGBA values (`rgba(16, 185, 129, 0.1)`), or raw Tailwind palette color classes (e.g., `text-emerald-500`, `bg-rose-500`, `text-amber-500`) directly in React components (`.tsx`) or inline styles.
*   **ENFORCEMENT:** Automated CI gates `npm run check:theming` and `npm run check:standards` scan all source files. Any violation will fail the build immediately.

### 1.2. Design System & Tokens
*   **Technology:** Tailwind CSS 3 compiled at build time (`tailwind.config.ts`, theme variables in `src/index.css`, no third-party script) + CSS Variables + typed token registry (`src/constants/themeTokens.ts`).
*   **Semantic Intent Tokens (`THEME_INTENT`):**
    Represent financial and contextual meaning. Declare each color once, as a CSS variable in `src/index.css` — `tailwind.config.ts` derives its utilities from those variables automatically (`--color-x`, `--text-x`, `--bg-x`, `--border-x`; see `src/config/tailwindTheme.mjs`) and must never list colors by hand. Changing `--color-positive` in `src/index.css` cascades across all screens, badges, and charts:
    *   `positive` (`text-positive`, `bg-positive`, `bg-positive-subtle`, `border-positive`): Gains, profits, outperformance, success.
    *   `negative` (`text-negative`, `bg-negative`, `bg-negative-subtle`, `border-negative`): Losses, outflows, underperformance, errors.
    *   `warning` (`text-warning`, `bg-warning`, `bg-warning-subtle`, `border-warning`): Alerts, cautions, untracked holdings, fee notices.
    *   `neutral` (`text-secondary`, `bg-subtle`, `border-subtle`): Baseline, zero delta.
    *   `brand` (`text-brand`, `bg-primary`, `border-brand`): Primary accents and actions.
*   **Categorical & Multi-Series Chart Palette (`CHART_SERIES_PALETTE`):**
    For asset/ETF comparisons (e.g., CW8 vs WPEA vs SWDA vs VWCE) requiring up to 8 distinct curves:
    *   Provides 8 coordinated slots using `--color-accent-*` (blue, amber, indigo, rose, cyan, purple, orange, green).
    *   Identifiers are strictly decoupled from financial gains/losses to avoid semantic contradictions.
    *   Use `getComparisonSeriesTokens(index)` for stable series indexing (wrapping modulo 8).
    *   Use `getAssetStableColor(symbol)` for deterministic, permanent ticker color consistency across all charts and tables.
*   **UI Micro-Primitives:**
    *   `<TrendValue value={delta} format="currency" showIcon />`: Standardized P&L value renderer with automatic signs, colors, and `TrendingUp`/`TrendingDown` icons.
    *   `<TrendBadge value={delta} isPercent />`: Standardized variation badge with semantic subtle background and colored text.

### 1.3. Form Elements (Inputs & Dropdowns)
*   **Problem:** Browser default inputs often have white backgrounds or unreadable text in Dark Mode if transparency is used wrongly.
*   **Standard:** All form elements (`<input>`, `<select>`, `<textarea>`) **MUST** use the following pattern:
    *   **Background:** `bg-subtle` (Adapts to Slate-100 in Light, Zinc-800 in Dark).
    *   **Text:** `text-primary` (Ensures contrast).
    *   **Border:** `border-subtle` (Optional, but recommended).
    *   **Focus:** `focus:ring-primary focus:border-primary`.
*   **Prohibited:** `bg-black/5`, `bg-white/10`, `text-black`, `text-white` on form elements. These cause visibility issues in specific themes.

### 1.4. Dynamic Theming (Light, Dark, Midnight)
The system supports three distinct themes. Your code must support all three automatically by using the semantic variables.
*   **Mechanism:** `AuthContext` updates the `data-theme` attribute and `.dark` class on the `<html>` element.
*   **Themes:**
    1.  **Light**: Default slate-based light mode.
    2.  **Dark**: Zinc-based standard dark mode.
    3.  **Midnight**: Deep slate/blue mode (`data-theme="night"`).
*   **Component Rule:** Test your components against the "Midnight" theme to ensure proper contrast. If it looks good in Midnight, it usually works in Dark.

---

## 2. Infrastructure & Deployment Standards
**Target:** Vercel Edge/Serverless + InstantDB

### 2.1. Stateless & Read-Only
*   **No Server State:** Do not store session data in server memory.
*   **Read-Only Filesystem:** The runtime environment (Vercel) is read-only. Do not attempt to write to `fs` or modify local JSON files during runtime.
*   **Blob Storage abstraction:** If file uploads are needed (e.g., avatars), use a service abstraction that can be swapped for S3/Blob storage later.

### 2.2. Environment Configurations
*   **Config Source:** All secrets and environment-specific configs must come from `process.env`.
*   **Fallback:** Always provide a safe default or a clear error if a critical env var is missing.

### 2.3. Database Architecture (InstantDB Preparation)
*   **Frontend-First:** The architecture is designed for client-side queries (InstantDB).
*   **Anti-Pattern:** Avoid creating a heavy REST API layer. Logic should live in Service classes that can switch between `localStorage` (Mock) and `InstantDB` (Production) seamlessly.
*   **Interfaces:**
    *   **Generic Interface:** All data services must implement a consistent interface (e.g., `getById`, `update`, `list`).
    *   **Typing:** Use strict TypeScript interfaces (`src/types.ts`).
    *   **Row Level Security (RLS) Prep:** All entities (Transactions, Goals, etc.) **MUST** include an `ownerId` field in their interface definition, even if currently unused in the Mock DB. This enables seamless RLS policy enforcement later.
    *   **Date Serialization:** Standardize on **ISO 8601 strings** (e.g., `2024-02-03T17:00:00Z`) for all date storage and transit. Databases like InstantDB prefer serialized formats. Never return or store raw JavaScript `Date` objects in the Mock DB to avoid inconsistency and formatting bugs during future migrations.

---

## 3. Service Layer & Abstraction
**Current State:** `LocalMockService` (via `localStorage`)
**Target State:** `InstantDBService`

### 3.1. The "DatabaseService" Contract
*   The `db.ts` file acts as the central data access point.
*   **Rule:** Components must NEVER access `localStorage` directly. They must call methods in `src/services/`.
*   **Service Pattern:** Services (`goalService`, `transactionService`) should consume `db.ts`, and `db.ts` should abstract the storage mechanism.

### 3.2. Simulation & Latency
*   **Artificial Delay:** A `delay(ms)` function exists (e.g., in `db.ts`).
*   **Preservation:** **DO NOT REMOVE THIS DELAY.** It simulates real-world network conditions (loading states, race conditions).
*   **Usage:** All async service methods must `await delay(500)` (or similar) before returning data.

---

## 4. Internationalization (i18n)
**Goal:** Professional multi-language support with zero hardcoded user-facing text.

### 4.1. Zero Hardcoded Text Policy
*   **STRICT PROHIBITION:** Never hardcode user-facing strings in components, pages, or logic (e.g., Settings cards, Backup/Merge wizards, Asset & Category Comparison tools, confirmation dialogs, back button tooltips, search input placeholders, or toast messages).
*   **ENFORCEMENT:** All UI text must be externalized via the i18n library (`react-i18next`).
*   **Rule:** Use `t('namespace:key')` for all user-visible text. Every new UI key MUST exist in both `locales/en/` and `locales/fr/`.
*   **Scope:** This applies to: labels, buttons, placeholders, error messages, tooltips, notifications, modal wizards, category pills, asset class labels, and all dynamic content.

### 4.2. Translation Structure
*   **Technology:** `i18next` + `react-i18next` for React components.
*   **Location:** `locales/{lang}/{namespace}.json` (e.g., `locales/en/common.json`, `locales/fr/dashboard.json`).
*   **Languages:** English (`en`) and French (`fr`).
*   **Namespaces:**
    *   `common.json` - Shared buttons, actions, labels, errors
    *   `navigation.json` - Menu items, brand name, header elements
    *   `auth.json` - Login, Signup forms
    *   `dashboard.json` - Dashboard-specific labels
    *   `portfolio.json` - Portfolio, Positions page labels
    *   `transactions.json` - Transactions page labels
    *   `progress.json` - Goals & Achievements labels
    *   `settings.json` - Settings page labels
    *   `reports.json` - Reports page labels

### 4.3. Usage Patterns
*   **Import:** `import { useTranslation } from 'react-i18next';`
*   **Hook:** `const { t } = useTranslation();`
*   **Simple Text:** `t('common:buttons.save')` → "Save" (or "Enregistrer" in French)
*   **Interpolation:** `t('dashboard:totalValue', { value: 1000 })` → "Total: $1,000"
*   **Pluralization:** Use i18next plural forms, NEVER string concatenation
*   **Dynamic Content:** Always use i18n interpolation for variable data

### 4.4. Adding New Strings
*   **Process:** When adding UI text, immediately add the key to **both** `en` and `fr` translation files.
*   **Key Naming:** Use descriptive, hierarchical keys (e.g., `settings.profile.displayName`).
*   **Fallback:** Never use inline fallback strings like `t('key', 'fallback text')`.

### 4.5. Language Switching
*   User language preference is stored in `user.preferences.language` via `AuthContext`.
*   The i18n system automatically detects and applies the correct language on mount and language change.
*   **AuthContext** syncs language changes with i18next via `i18n.changeLanguage()`.
*   Components should NEVER manually switch languages; rely on the i18n provider.
*   A language selector is available in **Settings → Preferences**.

### 4.6. Language Behavior
*   The application displays in **one language at a time** - either English or French.
*   When the user switches languages, the entire UI updates immediately.
*   The system is extensible to support additional languages in the future (Spanish, German, etc.).

---

## 5. Critical Value Adds & Strict Rules

### 5.1. Security & Permissions
*   **Client-Side Verification:** `ProtectedRoute` handles navigation guarding, but does not secure data.
*   **Data Isolation:** Ensure all queries implicitly filter by `ownerId` (once added) to prevent data leaks between users in the future shared DB.

### 5.2. Accessibility (A11y)
*   **Mandatory Labels:** Every generic icon button (e.g., `<Bell />`) **MUST** have an `aria-label` attribute describing its action.
*   **Contrast:** Verify that text on custom badges or graphs meets WCAG AA standards, especially in "Midnight" mode.

### 5.3. Error Handling (The "Graceful Failure")
*   **Boundaries:** Major layout sections (Sidebar, Dashboard Widgets) should be wrapped in Error Boundaries to prevent a single widget crash from taking down the entire app.
*   **Toast Notifications:** Use the toast/alert system for user feedback, never `window.alert`.

### 5.4. Directory Structure
*   **All application code lives in `src/`** (standard Vite layout): `src/pages/`, `src/components/`, `src/context/`, `src/hooks/`, `src/utils/`, `src/services/`, `src/types/`, `src/constants/`, plus the entry points `src/main.tsx`, `src/App.tsx` and `src/ShowcaseApp.tsx`. Do not add application code at the repository root.
*   **Root stays minimal:** only configuration (`package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `vercel.json`, `docker-compose.yml`, `index.html`, `tailwind.config.ts`, `postcss.config.js`), project docs/licence, and the top-level folders `src/`, `tests/`, `scripts/` (dev & CI tooling), `server/` (zero-dependency Node runtime shared by Docker and the Vite dev server), `docker/`, `locales/`, `public/`, `mcp-server/`, `supabase/`, `test-data/`. New root files need a justification.
*   **`@` alias** resolves to `src/`.
*   **Security headers / CSP:** defined once in `server/securityHeaders.mjs` (profiles `local` and `cloud`). No inline scripts, no `eval`, no third-party script. A new external origin (API, image host) must be added there, then `npm run security:headers` regenerates `vercel.json`.
*   **No `docs/` in repo:** Project documentation (feature specs, ADRs, session logs, code summaries) is centralized in the **external Obsidian vault** at `$HOME/Developpement/brain/GlassFolio/` (or via `BRAIN_PATH`), accessible via the MCP `obsidian` server. Do not create a `docs/` folder in this repo.

### 5.5. Strict Typing
*   **No ANY:** The use of `any` is strictly prohibited unless wrapping an external untyped library (and even then, prefer `unknown`).
*   **Return Types:** Explicitly define return types for all Service functions to ensure contract stability.

---

## 6. MCP Memory Maintenance (`glassfolio.json`)
**Goal:** Keep the persistent knowledge graph in sync with the codebase at all times.

### 6.1. Memory Graph Location
*   **File:** `$HOME/Developpement/memory/glassfolio.json` (or via `MEMORY_FILE_PATH`)
*   **Server:** MCP `memory` (configured via `MEMORY_FILE_PATH` env var)
*   **Scope:** This file is the **sole** persistence file for GlassFolio. Do NOT read or modify other files in the `memory/` directory.

### 6.2. When to Update the Memory Graph
*   **New module/service/page/component:** Call `create_entities` with: entity type, source file path, exported symbols, dependencies, and any constraints.
*   **New dependency between modules:** Call `create_relations` (e.g., `GlassFolio-PageX depends_on GlassFolio-ServiceY`).
*   **API or interface change:** Call `add_observations` on the affected entity to document the change.
*   **Removed module:** Call `delete_entities` and/or `delete_relations` to remove stale entries.
*   **After major changes (3+ files):** Call `read_graph` to verify graph consistency.

### 6.3. Entity Naming Convention
*   All entity names MUST be prefixed with `GlassFolio-` (e.g., `GlassFolio-PortfolioService`, `GlassFolio-Dashboard`).
*   Entity types: `Project`, `Component`, `Service`, `Page`, `UIComponent`, `Hook`, `Context`, `Config`, `Utility`, `DataFile`, `Script`.

### 6.4. Observation Quality
*   Each entity observation should include at minimum: source file path, exported symbols, direct dependencies, and any relevant constraints or anomalies.
*   Keep observations factual and concise. Avoid duplicating information already in the code.

---
**End of Standards.**
*Accessing this file constitutes a binding agreement to adhere to these architectural principles.*

---

## 7. Tests et CI Obligatoires (Filet de Sécurité)
> **Version:** 1.0 | **Ajouté:** 2026-10-05

**Règle absolue : aucun code cassé ne peut atteindre `main` sans que les gates CI ne l'aient bloqué.**

### 7.1. Infrastructure de Test

| Outil | Usage |
|---|---|
| **Vitest** | Framework de tests unitaires (jsdom, globals, v8 coverage) |
| **@testing-library/react** | Tests composants React |
| **vitest/coverage-v8** | Rapport de couverture (HTML, LCOV, JSON) |
| `tests/setup.ts` | Setup global : reset localStorage, Web Crypto polyfill, fetch guard |

### 7.2. Structure des Tests

```
tests/
├── setup.ts                          # Vitest global setup
└── unit/
    ├── services/
    │   ├── core/                     # validationService, transactionManager
    │   ├── import/                   # csvParser
    │   ├── fiscal/                   # taxCalendarService
    │   ├── goalService.test.ts
    │   ├── currencyService.test.ts
    │   └── priceService.test.ts
    └── utils/
        ├── currency.test.ts
        ├── date.test.ts
        └── csvUtils.test.ts
```

### 7.3. Seuils de Couverture (P1+P2)

Définis dans `vitest.config.ts` — **la CI échoue si non respectés** :

| Métrique | Seuil minimal |
|---|---|
| Lines | **70%** |
| Functions | **70%** |
| Branches | **60%** |
| Statements | **70%** |

Périmètre : `src/services/**`, `utils/**`, `context/**`, `hooks/**`.

### 7.4. Scripts npm Disponibles

```bash
npm run test              # Run all tests once (CI mode)
npm run test:watch        # Watch mode (dev)
npm run test:coverage     # Run tests + generate coverage report
npm run check:types       # TypeScript strict check (tsc --noEmit)
npm run check:i18n        # Audit i18n keys: scans t() usages vs locales/
npm run lint              # ESLint (--max-warnings 0 en CI)
npm run lint:fix          # Auto-fix ESLint issues
```

### 7.5. Règles pour les Tests

1. **Isolation totale** : chaque test doit être indépendant. `localStorage` est vidé entre les tests (via `setup.ts`).
2. **Mocks obligatoires pour le réseau** : tout appel `fetch` doit être intercepté avec `vi.fn()`. Un `fetch` non mocké lèvera une erreur grâce au guard dans `setup.ts`.
3. **Pas de modification de logique métier** pour faire passer un test. Si un test révèle un bug → logguer dans Notion Database-Bugs, ne pas corriger silencieusement.
4. **Imports par chemin relatif correct** : les tests dans `tests/unit/services/core/` utilisent `../../../../src/services/…` (4 niveaux).
5. **Délai artificiel préservé** : les tests mockent `delay()` mais ne le suppriment pas des services réels.

### 7.6. Pipeline CI/CD (GitHub Actions)

Fichiers : `.github/workflows/ci.yml`, `.github/workflows/cd-smoke.yml`, action composite `.github/actions/setup` (Node 22 + `npm ci`).

```
push/PR sur main|develop|feat/**|fix/**|refactor/**|chore/**|ci/**|test/**
        │
        🔒 Gate 1 ← audit npm, intégrité SHA-512, scan de secrets
        │
        ├── 🔷 Gate 2 ← tsc, ESLint, i18n, e-mails
        ├── 🎨 Gate 3 ← standards, thèmes, invariants d'architecture
        ├── 🛡️ Gate 4 ← suite de tests de sécurité
        ├── 🧪 Gate 4 ← tests unitaires en 3 shards ──► 📊 couverture fusionnée
        │                                                (seuils 70/60 ; sécurité 90/78)
        ├── 🤖 Protocole MCP
        └── 🏗️ Gate 5 ← 4 builds : local, cloud-app, showcase, vercel-parity
                │
                └── CI — Required ← seul check exigé par Vercel Deployment Checks
```

**CD (Vercel)** : la branche `develop` est déployée sur son domaine de branche stable (environnement de test réel, URL fixe) ; les autres branches ont des URLs de preview éphémères, non déclarées chez Google/Cloudflare/Supabase. Vercel construit chaque push, mais un déploiement de production (`main`) n'est attribué aux domaines `glassfolio.dev` / `app.glassfolio.dev` qu'une fois `CI — Required` au vert (Deployment Checks, fournisseur GitHub). Après promotion, `cd-smoke.yml` vérifie HTTP 200, le repli SPA et les en-têtes de `vercel.json` (non bloquant ; en cas d'échec, `vercel rollback`).

**Règles** :
- Ne jamais renommer le job `CI — Required` : cela désactiverait silencieusement la garde de production.
- Les seuils de couverture ne sont appliqués que sur le rapport fusionné (`npm run test:coverage:merge`) ; les shards tournent avec `VITEST_PARTIAL_COVERAGE=1`.
- Le build `vercel-parity` reproduit exactement la commande de Vercel (`VITE_DEPLOYMENT_MODE=cloud npm run build`).

**Concurrence** : les runs en cours sur la même branche sont annulés lors d'un nouveau push, sauf sur `main` (un déploiement de production en attente dépend de ce run).

### 7.7. Conformité Standards (Phase 3)

- **`check:i18n`** : `scripts/check-i18n-keys.mjs` — scan des `t('key')` vs `locales/en/` et `locales/fr/`. Sortie 1 si clé manquante.
- **ESLint `no-restricted-globals`** : accès direct à `localStorage` interdit hors de `src/services/`, `src/utils/`, `src/context/`.
- **ESLint `react-hooks/rules-of-hooks`** : violation bloquante en CI.

### 7.8. Violations Connues (à corriger dans les prochains sprints)

Loggées dans Notion Database-Bugs :
- `react-hooks/rules-of-hooks` × 1 : `Dashboard.tsx` line 210 (`useMemo` conditionnel)
- `no-useless-escape` × ~20 : RegExp dans `csvParser.ts` et `validationService.ts`
- `@typescript-eslint/no-explicit-any` × N : violations existantes (warn, non bloquantes)
- i18n : 8 vraies clés manquantes dans `CashImportWizard` (clés `cashWizard.*`)

---

## 8. AI Integration & MCP Standards (Pilier AI-First)
> **Version:** 1.0 | **Ajouté:** 2026-10-09

**Règle absolue : Toute nouvelle capacité métier doit être immédiatement pilotable par l'IA et exportée sur le serveur MCP sans rétro-ingénierie ultérieure.**

### 8.1. Registre d'Outils Centralisé (`aiToolRegistry`)
- Emplacement : `src/services/ai/aiToolRegistry.ts`.
- Tous les outils d'IA (In-App et serveur MCP) partagent le même contrat d'interface `AIToolDefinition`.
- Chaque domaine métier crée ses outils dans `src/services/ai/tools/<domaine>Tools.ts` et les enregistre auprès du registre.

### 8.2. Spécification d'un Outil IA (`AIToolDefinition`)
Tout outil doit comporter :
1. `name` : identifiant snake_case unique (ex: `get_portfolio_summary`, `record_transaction`).
2. `description` : description sémantique claire orientée pour les LLMs.
3. `parameters` : schéma JSON / Zod strict des paramètres attendus.
4. `requiresConfirmation` : **obligatoire à `true`** pour toute création, modification ou suppression de données financières réelles (Human-in-the-loop).
5. `execute(params, context)` : méthode d'exécution asynchrone appelant la couche `src/services/`.

### 8.3. Sécurité et Garde-fous (Guardrails)
- **Mode lecture seule par défaut** : aucune écriture silencieuse n'est autorisée.
- **Human-in-the-loop** : quand `requiresConfirmation === true`, l'action génère une proposition (`PendingActionProposal`) que l'utilisateur doit valider explicitement dans l'UI via le composant `AIActionApprovalCard`.
- **Clés API BYOK** : les clés privées (OpenAI, Anthropic, OpenRouter) restent stockées côté client de manière sécurisée et ne transitent jamais par un serveur intermédiaire tiers.

---

## 9. Git Workflow, Branching & DevSecOps Standards (Pilier Recruiter-Grade)
> **Version:** 1.0 | **Ajouté:** 2026-10-15

**Règle absolue : Aucun commit direct sur `main` ni sur `develop`. L'historique Git doit refléter une rigueur logicielle exemplaire.**

### 9.1. Règle de Branching Systématique
- **Deux branches permanentes, jamais supprimées** :
  - `develop` : branche d'intégration et de test en conditions réelles. Elle est rattachée sur Vercel à un domaine de branche stable (`develop.glassfolio.dev`, à confirmer) dont l'URL ne change jamais : les URI de redirection Google, les hôtes autorisés Turnstile et les URL Supabase n'ont donc à être déclarés qu'une fois.
  - `main` : production uniquement (`glassfolio.dev` / `app.glassfolio.dev`), alimentée exclusivement depuis `develop` (cf. 9.4).
- **Interdiction formelle de commiter directement sur `main` ou `develop`** : `main` est strictement réservé aux livraisons testées, validées sur `develop` et prêtes pour la production ; `develop` ne reçoit que des branches de travail intégrées (cf. 9.4).
- **Convention de nommage des branches** : Chaque nouvelle tâche (`TGLA-XXX`) ou sprint doit faire l'objet d'une branche dédiée créée depuis `develop` à jour (depuis `main` uniquement pour un hotfix de production) :
  - Fonctionnalités : `feat/tgla-XXX-<short-slug>`
  - Corrections : `fix/tgla-XXX-<short-slug>`
  - Maintenance & Outillage : `chore/tgla-XXX-<short-slug>`

### 9.2. Commits Conventionnels Atomiques
- Respect strict de la spécification **Conventional Commits** : `type(scope): description impérative en anglais ou français`.
  - Types autorisés : `feat`, `fix`, `test`, `chore`, `docs`, `refactor`, `perf`, `ci`.
  - Exemples : `feat(vault): add passkey PRF support (#12)`, `fix(tax): correct flat tax bracket calculation`.
- Chaque commit doit être atomique, autonome et passer tous les tests unitaires.

### 9.3. Bouclier de Sécurité Local & Zéro Fuite de Chemins
- **Pre-Commit Hook local obligatoire** (`scripts/pre-commit-check.mjs`) : bloque automatiquement tout commit contenant :
  - Des fichiers `.env` ou secrets non ignorés.
  - Des signatures de tokens / clés d'API réelles (`sk-`, `AIza`, `ghp_`, etc.).
  - Des chemins de système de fichiers personnels absolus (`/Users/`).
  - Des contournements directs de stockage (`localStorage.`) ou des codes hex bruts dans les `.tsx`.
- **Zéro chemin personnel dans le code tracé** : Tout chemin vers des ressources locales doit obligatoirement utiliser des variables d'environnement (`BRAIN_PATH`, `HOME`), des chemins relatifs ou des alias.

### 9.4. Intégration dans `develop` et promotion vers `main`
- **Branche de travail → `develop`** (sur demande explicite de l'utilisateur) : les commits de la branche sont **squashés en un seul commit atomique** (feature comme micro-correction), puis fusionnés avec `git merge --no-ff`. Le commit squashé cite tous les `TGLA-xxx` / `BUG-xxx` (lignes `Closes`). La branche de travail est ensuite supprimée (locale et distante).
- **`develop` → `main`** (sur demande explicite uniquement) : on promeut des fonctionnalités **déjà validées sur `develop`**.
  - Toute la file `develop` est prête : `git merge --no-ff develop -m "merge: promote develop into main"`. **Jamais de squash de `develop`** : il ferait diverger les deux branches durablement.
  - Une partie seulement est prête : `git cherry-pick -x <commit squashé>` sur une branche issue de `main`, puis merge `--no-ff` dans `main` (chaque feature étant un commit unique, elle se déplace seule).
- **Resynchronisation** : après chaque promotion ou hotfix sur `main`, `main` est fusionné dans `develop` (`git merge --no-ff main`) pour qu'elles ne divergent pas.
- **Gates** : les 6 gates locales passent avant tout merge dans `develop` ; la CI distante doit être verte avant de promouvoir.
- **Effets de bord à `main`** : changelog public, Notion (`notion-sync`) et vitrine publique sont traités à la promotion vers `main`, pas à l'intégration dans `develop`.


