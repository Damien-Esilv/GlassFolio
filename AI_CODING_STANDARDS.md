# AI CODING STANDARDS & ARCHITECTURAL REFERENCE
> **Status:** ACTIVE | **Version:** 1.1 | **Author:** Lead Architect

## 0. Meta-Instruction (The "Prime Directive")
**ALL AI AGENTS MUST READ THIS DOCUMENT BEFORE WRITING CODE.**
This project is an advanced financial dashboard ("GlassFolio"). Homogeneity, aesthetics, and architectural strictness are paramount. Deviations from these standards will likely break the "Dark/Midnight" themes, the offline-first architecture, or the future InstantDB migration.

---

## 1. UI/UX Architecture & Theming
**Goal:** A "Premium" feel with zero hardcoded values.

### 1.1. No Hardcoding (Hex/RGB)
*   **STRICT PROHIBITION:** Never use hex codes (e.g., `#3b82f6`) or RGB values directly in React components (`.tsx`) or inline styles.
*   **ENFORCEMENT:** Scanning the codebase for `#` followed by 6 hex digits outside of `index.html` or `mockData` should return 0 results.

### 1.2. Design System & Tokens
*   **Technology:** Tailwind CSS (via CDN/Script injection in `index.html`).
*   **Variables:** Styling relies on CSS variables defined in `index.html`.
*   **Usage Rule:** Use Tailwind semantic utility classes that map to these variables.
    *   ✅ `bg-card` (maps to `var(--bg-card)`)
    *   ✅ `text-secondary` (maps to `var(--text-secondary)`)
    *   ✅ `border-subtle` (maps to `var(--border-subtle)`)
    *   ❌ `bg-[#1e293b]` (Forbidden)
    *   ❌ `text-gray-500` (Avoid generic colors; use semantic `text-secondary` or `text-tertiary`)

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
*   **Vite Non-Standard:** Note that `pages/` and `components/` reside in the **ROOT**, while `services/` resides in `src/`. Respect this structure; do not move files unnecessarily.
*   **No `docs/` in repo:** Project documentation (feature specs, ADRs, session logs, code summaries) is centralized in the **external Obsidian vault** at `/Users/damien/Developpement/brain/GlassFolio/`, accessible via the MCP `obsidian` server. Do not create a `docs/` folder in this repo.

### 5.5. Strict Typing
*   **No ANY:** The use of `any` is strictly prohibited unless wrapping an external untyped library (and even then, prefer `unknown`).
*   **Return Types:** Explicitly define return types for all Service functions to ensure contract stability.

---

## 6. MCP Memory Maintenance (`glassfolio.json`)
**Goal:** Keep the persistent knowledge graph in sync with the codebase at all times.

### 6.1. Memory Graph Location
*   **File:** `/Users/damien/Developpement/memory/glassfolio.json`
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

Fichier : `.github/workflows/ci.yml`

```
push/PR sur main|develop|feat/**|fix/**|refactor/**
        │
        ├── 🔷 typecheck  ← tsc --noEmit
        ├── 🔍 lint       ← ESLint --quiet (erreurs bloquantes uniquement)
        └── 🧪 test       ← vitest run + coverage (seuils 70%)
                │
                └── 🏗️ build ← vite build (uniquement si tous les gates passent)
                         └── artifact: dist/ (7 jours)
                         └── artifact: coverage/ (14 jours)
```

**Concurrence** : les runs en cours sur la même branche sont annulés lors d'un nouveau push.

### 7.7. Conformité Standards (Phase 3)

- **`check:i18n`** : `scripts/check-i18n-keys.mjs` — scan des `t('key')` vs `locales/en/` et `locales/fr/`. Sortie 1 si clé manquante.
- **ESLint `no-restricted-globals`** : accès direct à `localStorage` interdit hors de `src/services/`, `utils/`, `context/`.
- **ESLint `react-hooks/rules-of-hooks`** : violation bloquante en CI.

### 7.8. Violations Connues (à corriger dans les prochains sprints)

Loggées dans Notion Database-Bugs :
- `react-hooks/rules-of-hooks` × 1 : `Dashboard.tsx` line 210 (`useMemo` conditionnel)
- `no-useless-escape` × ~20 : RegExp dans `csvParser.ts` et `validationService.ts`
- `@typescript-eslint/no-explicit-any` × N : violations existantes (warn, non bloquantes)
- i18n : 8 vraies clés manquantes dans `CashImportWizard` (clés `cashWizard.*`)
