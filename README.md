# GlassFolio 💎

> **A premium, offline-first personal finance, multi-asset wealth management dashboard, and AI-powered investment copilot.**  
> Built with React 19, TypeScript 5.8, Vite 6, and Tailwind CSS.

---

## 🌟 Overview

**GlassFolio** is a modern, high-performance financial tracking and wealth management web application designed to bring clarity, mathematical rigor, and luxury aesthetics to personal investment management.

Operating entirely **offline-first**, GlassFolio stores all data locally in the browser with an abstracted service layer designed for instant response times and maximum privacy. It supports multi-asset portfolios (Equities, ETFs, Crypto, Cash & Bank Accounts, Real Estate), comprehensive transaction ledgers, performance analytics, ETF fee impact analysis, French fiscal declarations (PFU, PEA, Cerfa 2042/2074/3916), idempotent CSV import wizards, financial goal planning, an investor gamification system, an in-app AI financial copilot, a standalone Model Context Protocol (MCP) server, and client-side AES-256-GCM envelope encryption.

---

## ✨ Key Features & Capabilities

### 📊 1. Multi-Asset Portfolio & Positions Tracking
- **Granular Asset Allocation**: Visualize investments grouped by asset class (*Equities & Funds, ETFs, Crypto, Cash & Savings, Real Estate*), financial institution (*BoursoBank, Trade Republic, Degiro, Interactive Brokers, Revolut, etc.*), and specific account (*PEA, CTO, Assurance-Vie, Crypto Wallets, Livrets*).
- **Position Monitoring**: Track quantities, average purchase price (PRU with transaction fee inclusion compliant with French regulation), total current valuation, and real-time unrealized gains/losses.
- **Market Data Feeds**: Live and reference price feeds via Yahoo Finance and CoinGecko with 15-minute TTL caching and graceful offline fallback.
- **Multi-Currency Conversion**: Native handling of multi-currency assets (EUR, USD, GBP, CHF) with live foreign exchange (FX) rates and automated conversion to the user's base currency.
- **Cash & Liquidity Management**: Dedicated cash import and balance tracking across checking, savings, and broker cash accounts.

### 💸 2. Transactions Ledger
- **Complete Operation History**: Log and filter buys, sells, dividend payouts, broker fees, deposits, withdrawals, and cash transfers.
- **Precision & Typing**: All monetary calculations preserve exact decimal precision with typed domain schemas.
- **Automated Instrument Resolution**: Intelligent resolution of assets by ISIN, ticker, asset class, and exchange to avoid duplicate asset entries.
- **Multi-Criteria Filtering**: Filter and search by date range, transaction type, asset category, account, or free-text query.

### 📈 3. Advanced Analytics & ETF Fee Drag Calculator
- **Performance Benchmarks**: Historical portfolio evolution and benchmark comparisons over multiple time horizons (1M, YTD, 1Y, ALL) with Base 100 rebased index growth.
- **Comparative Asset & Category Analysis**: Compare performance across asset categories or specific assets with customizable merged curves, live ticker search, and a curated market catalog (ETFs, Stocks, Crypto, Indices).
- **P&L Breakdown (Realized vs. Unrealized)**: Dedicated page separating closed capital gains/losses from active market fluctuations, with gainers/losers rankings and asset-class distribution.
- **ETF Fee Analyzer & Drag Calculator**: Calculates ongoing management costs (TER), broker drag, and projects the compounding cost of fees over 5 to 50 years.
- **Side-by-Side ETF Comparison Tool**: Direct head-to-head comparison between funds on TER, returns, and deep Sector & Geographical allocation breakdowns.

### 🏛️ 4. French Tax Module (*Aide Fiscale*)
- **Unified Fiscal Hub**: Clear visibility into capital gains and dividend tax regimes (Flat Tax 30% / PFU vs. Progressive Income Scale with holding period abatements, PEA 5-year tax exemption threshold).
- **Regime Optimization**: Algorithmic comparison between PFU and Progressive Scale with tailored recommendations based on the user's fiscal profile and tax brackets.
- **Cerfa Declaration Assistant**: Step-by-step guidance for French tax returns:
  - Form **2042** / **2042-C** (Dividends, interest, and financial income)
  - Form **2074** (Capital gains, losses, and 10-year loss carryover management)
  - Form **3916** / **3916-bis** (Mandatory declaration of foreign bank and brokerage accounts: Trade Republic, Degiro, Interactive Brokers, Revolut, crypto exchanges)
- **Tax Optimization & Tax-Loss Harvesting**: Strategies to balance realized gains with capital losses and maximize envelope tax shields before the fiscal year ends.
- **Dynamic DGFiP Tax Calendar**: Connected calendar with official DGFiP department zone routing (Zones 1, 2, 3, Paper) and algorithmic fallback.
- **Educational Fiscal Guide**: Multi-country reference guide detailing tax thresholds, social levies (CSG/CRDS 17.2%), and envelope rules (PEA, CTO, Assurance-Vie).

### 📥 5. Robust Multi-Broker CSV Import & Rollback
- **Universal Multi-Broker Support**: Import CSV statements from popular brokers and banks (Trade Republic, Degiro, Interactive Brokers, BoursoBank, Revolut, Finary).
- **Dual Import Modalities**:
  - *History Mode*: Sequential transaction ledger playback and account state reconstruction.
  - *Snapshot Mode*: Point-in-time balance and position reconciliation.
- **Dedicated Cash Import Wizard**: Import and reconcile bank account balances without polluting investment ledgers.
- **Idempotence & Deduplication**: SHA-256 batch hashing and row-level fingerprinting prevent accidental duplicate imports.
- **1-Click Batch Rollback**: Safely undo any import batch from the Import History view without corrupting other transactions.
- **Security Hardening**: Formula injection sanitization protecting CSV exports against spreadsheet execution vulnerabilities (`=`, `+`, `-`, `@`).

### 🎯 6. Gamification, Financial Goals & Investor Progression
- **Financial Goals & Milestone Planning**: Define custom savings targets (Emergency Fund, Real Estate Down Payment, Financial Independence), set target deadlines, link specific assets, and track progress with dynamic progress bars.
- **Investor Ranks (21 Tiers)**: Progress through 21 ranks—from *Novice Investor* to *Market Titan / Warren Buffett*—based on portfolio discipline, asset diversification, and regular savings habits.
- **Real DCA Streak Tracking**: Automated streak calculations rewarding regular monthly investments.
- **Financial Quests & Missions**: Interactive monthly and quarterly missions (`QuestCard`) with claimable XP rewards.
- **Interactive Celebration Engine**: Dynamic canvas-confetti particle explosions upon level up or quest unlock (`CelebrationModal`).
- **Unlockable Visual Themes**: Unlock exclusive dashboard visual themes as rewards for reaching high investor ranks.
- **AI Gamification Tools**: Dedicated MCP tools (`get_gamification_status`, `suggest_next_milestone`, `list_quests`) for conversational progression coaching.

### 🤖 7. In-App AI Assistant & Standalone MCP Server
- **Interactive Financial Copilot**: Sliding header chat drawer (`AIChatDrawer`) with markdown support, suggestion chips, and conversational financial assistance.
- **Hybrid AI Engine**:
  - *Local Ollama*: 100% offline with zero cloud data egress, auto-recovery for reasoning models, and built-in connection diagnostics.
  - *Cloud BYOK*: Connect OpenAI, Anthropic, OpenRouter, or Groq with API keys encrypted client-side in the vault.
- **Chain-of-Thought Reasoning**: Inline collapsible extraction of `<think>` reasoning blocks with real-time stream status, word counts, and one-click copy.
- **Unified AI Tool Registry (`aiToolRegistry`)**: 16 standard bi-directional tools covering portfolio allocation, positions, transactions, fiscal simulations, goals, security, and gamification.
- **Human-in-the-Loop Safeguards**: Sensitive state mutations require explicit user confirmation via interactive action cards (`AIActionApprovalCard`, `requiresConfirmation: true`).
- **Standalone Model Context Protocol (MCP) Server**: Run `mcp-server/index.mjs` via Stdio transport to expose GlassFolio tools and data directly to external AI agents (Claude Desktop, Cursor, Antigravity IDE).

### 🔒 8. End-to-End Encrypted (E2EE) Security & Access Architecture
- **Client-Side Envelope Encryption (E2EE)**:
  - All sensitive financial entities (`transactions`, `holdings`, `wallets`, `goals`, `loans`, `audit_log`, `secrets`) are encrypted in the browser with **AES-256-GCM** using a dedicated Data Encryption Key (`DEK`).
  - Unique 96-bit IVs generated per write operation via `crypto.getRandomValues`.
  - Authenticated Additional Data (`AAD`) binding each ciphertext to its storage key, preventing ciphertext swapping attacks.
- **Dual-Key KDF Derivation (PBKDF2 600k + HKDF)**:
  - Single master password processed through native Web Crypto PBKDF2-SHA256 (600,000 iterations + 16-byte random salt).
  - Expanded via HKDF-SHA256 with distinct domain separation into:
    - `KEK` (`gf-vault-kek-v1`): Strictly used in memory to wrap/unwrap the DEK via AES-KeyWrap (RFC 3394).
    - `AuthKey` (`gf-auth-key-v1`): Dedicated challenge verification key for authentication without decryption capabilities.
- **Multi-Factor Authentication (2FA) & WebAuthn PRF Passkeys**:
  - **RFC 6238 TOTP**: 160-bit Base32 secret, HMAC-SHA1, 30s step, ±1 step clock drift, anti-replay window, and 10 single-use emergency backup codes (`XXXX-XXXX`).
  - **Autonomous QR Engine**: Zero-dependency inline SVG matrix generator (`qrCode.ts`).
  - **WebAuthn PRF Passkeys**: Hardware-bound biometric authentication deriving a dedicated KEK via the WebAuthn PRF extension (`hmac-get-secret`), enabling instant encrypted vault unlock.
  - **Emergency Recovery Key**: 256-bit entropy backup code (`XXXX-XXXX-...`).
- **Client-Side Password Policy**: NIST SP 800-63B compliant password evaluator with Shannon entropy estimation.
- **Encrypted Secrets Vault (BYOK)**:
  - Securely store and mask third-party AI keys (OpenAI, Gemini, Anthropic) for in-app assistant features.
- **Security Audit Logging**: Append-only rolling encrypted log (up to 500 entries) tracking security events, key rotations, unlock failures, and passkey registrations.
- **AI & MCP Exfiltration Guardrails**:
  - `guardrailsService` automatically detects and redacts sensitive API keys, recovery keys, TOTP seeds, and vault header envelopes before dispatching prompts to LLM contexts.
- **Single-Repo Dual-Mode Architecture**:
  - Seamlessly switch between `local` (offline-first browser storage) and `cloud` (ready for InstantDB/cloud sync) via `VITE_DEPLOYMENT_MODE`.

### 🎨 9. Single Source of Truth Design Tokens & Semantic Theming
- **Strict SSOT Architecture**: `THEME_PALETTES` defined as `const` in `src/constants/themeTokens.ts`, synchronized with CSS variables in `src/index.css`.
- **Zero Hardcoded Colors**: Enforced 0 hex/RGB/RGBA in UI components, 0 generic or raw Tailwind palette classes (`text-emerald-*`, `bg-rose-*`, etc.).
- **Financial Micro-Primitives**: Standardized `<TrendValue />` and `<TrendBadge />` micro-components for uniform P&L delta and percentage displays.
- **8-Color Multi-Series Palette**: `CHART_SERIES_PALETTE` with deterministic symbol hashing (`getAssetStableColor`), completely eliminating color collisions with gain/loss indicators.
- **Curated Themes**:
  - ☀️ **Light**: Clean, slate-based daytime mode.
  - 🌙 **Dark**: Zinc-based high-contrast dark mode.
  - 🌌 **Midnight**: Deep blue-slate immersive night mode.
- **Unified Brand Identity**: Authentic royal blue (`#137fec`) uniformly applied to logos, primary chart curves, and brand accents.
- **Full Internationalization (i18n)**: 100% externalized user-facing copy in **English** and **French** across 13 specialized namespaces.

### 💾 10. Privacy, Complete Backup & Merge Capabilities
- **100% Offline-First**: Zero tracking, zero telemetry, and zero third-party cloud dependencies required. Your financial data never leaves your device.
- **Full JSON Backup & Export**: One-click complete export of all accounts, positions, transactions, goals, and settings.
- **Intelligent Backup Merge Wizard**: Merge external or historical backups into your existing portfolio without overwriting current data (`BackupMergeWizard`), with duplicate detection and preview before commit.
- **Zero-Loss Database Reset & Reseed**: Reset or restore demo portfolios at any time from the Settings view.

### 🛡️ 11. DevSecOps Shield & Recruiter-Grade Engineering
- **Pre-Commit Security Shield (<200ms)**: Automated local hook (`scripts/pre-commit-check.mjs`) blocking personal path leaks, secret leaks, raw Tailwind classes, and storage invariant violations before commits are created.
- **8 Blocking CI Quality Gates**: GitHub Actions pipeline enforcing Typecheck, Lint, i18n completeness, Design Standards, MCP Protocol, DevSecOps Security Suite, Unit Tests, and Production Bundle Budget.
- **598 Unit & Integration Tests**: 46 comprehensive test suites executed via Vitest with 100% pass rate.
- **Repository Pattern**: Clean domain separation (`src/services/repositories/`) decoupling domain logic from physical storage providers (ready for hot-swapping between local browser storage and cloud persistence).
- **Functional Error Handling**: Strict `Result<T, E>` monad pattern (`ok`, `err`, `unwrap`) for robust typed error management without uncaught exceptions.
- **In-Memory TTL Caching**: High-performance `MemoryCache<T>` for Yahoo Finance market data and FX conversions.

---

## 🛠️ Tech Stack

| Domain | Technologies |
|---|---|
| **Framework & Core** | [React 19](https://react.dev/), [TypeScript 5.8](https://www.typescriptlang.org/), [Vite 6](https://vitejs.dev/) |
| **Routing** | [React Router 7](https://reactrouter.com/) (`BrowserRouter` HTML5 History API & clean URLs) |
| **Styling & Design System** | [Tailwind CSS](https://tailwindcss.com/) (CSS variables injection, SSOT `THEME_INTENT`, `<TrendValue />`, `<TrendBadge />`) |
| **Charts & Visualizations** | [Recharts 3](https://recharts.org/) (8-slot categorical palette, deterministic asset hashing) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Internationalization** | [i18next 25](https://www.i18next.com/) & [react-i18next 16](https://react.i18next.com/) (13 namespaces in EN & FR) |
| **End-to-End Encryption (E2EE)** | Web Crypto API (PBKDF2 600k, HKDF-SHA256, AES-KW, AES-256-GCM, WebAuthn PRF, TOTP RFC 6238) |
| **AI & MCP Tooling** | In-App AI Assistant (Local Ollama, Cloud BYOK), Model Context Protocol SDK, Stdio transport |
| **Data & Storage Layer** | Dual-Mode `IStorageProvider` ([EncryptedStorageProvider](src/services/storage/EncryptedStorageProvider.ts)), Repository Pattern, MemoryCache TTL |
| **Validation & Schemas** | [Zod 4](https://zod.dev/), Functional `Result<T, E>` monads |
| **Testing & CI/CD** | [Vitest 5](https://vitest.dev/) (598 tests across 46 suites), GitHub Actions (8 quality gates, bundle budget <2MB) |

---

## 🏗️ Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GlassFolio Application                             │
│                                                                             │
│  ┌───────────────────────┐   ┌───────────────────────────────────────────┐  │
│  │      Pages (16+)      │   │             Context Providers             │  │
│  │ Dashboard, Portfolio, │◄──┤ AuthContext (user, vault, themes)         │  │
│  │ Positions, Analytics, │   │ DataContext (positions, transactions, xp) │  │
│  │ TaxHub, ImportWizard  │   └───────────────────────────────────────────┘  │
│  └───────────┬───────────┘                                                  │
│              │                                                              │
│              ▼                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                  Domain Service Layer & Repositories                  │  │
│  │ portfolioService, transactionService, goalService, gamificationService│  │
│  │ etfFeeService, taxEngine, importManager, priceService, backupService  │  │
│  └───────────┬───────────────────────────────────────────┬───────────────┘  │
│              │                                           │                  │
│              ▼                                           ▼                  │
│  ┌───────────────────────┐   ┌───────────────────────────────────────────┐  │
│  │    AI Tool Registry   │◄──┤ Standalone MCP Server (Stdio Transport)   │  │
│  │  16 Financial Tools   │   │ Claude Desktop, Cursor, Antigravity IDE   │  │
│  │  Guardrails & Redact  │   └───────────────────────────────────────────┘  │
│  └───────────┬───────────┘                                                  │
│              │                                                              │
│              ▼                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │          Encrypted Storage Layer (EncryptedStorageProvider)           │  │
│  │  - Synchronous In-Memory Decrypted Cache                              │  │
│  │  - Serialized Async Envelope Encryption Queue                         │  │
│  │  - AES-256-GCM + 96-bit Unique IVs + AAD Cross-Record Binding         │  │
│  │  - Instant Memory Wipe on Vault Lock / Inactivity Timeout             │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │               Physical Persistence (Dual-Mode Factory)                │  │
│  │  - Local Mode : localStorage Encrypted Envelopes (Offline-First)      │  │
│  │  - Cloud Mode : InstantDB / Encrypted Cloud Sync (Ready)              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
GlassFolio/
├── src/                 # All application code (standard Vite layout)
│   ├── main.tsx         # React entry point (loads App or ShowcaseApp by build target)
│   ├── App.tsx          # Application router & route guards
│   ├── ShowcaseApp.tsx  # Public showcase build (landing, legal, consent)
│   ├── pages/           # 16+ routed views (Dashboard, Portfolio, Positions, Tax*, Settings…)
│   ├── components/      # Reusable UI
│   │   ├── ai/          # AI drawer, approval cards, markdown & thinking components
│   │   ├── security/    # Vault gates, lock screen, TOTP/passkey dialogs, secrets
│   │   ├── ui/          # Semantic primitives (TrendValue, TrendBadge)
│   │   └── Layout.tsx   # Main shell with sidebar, headers, and AI trigger
│   ├── context/         # Global React Contexts (AuthContext, DataContext)
│   ├── hooks/           # Custom React hooks (CSV import, snapshot reconciliation)
│   ├── utils/           # CSV, currency and date helpers
│   ├── constants/       # SSOT theme tokens, animations, asset classes
│   ├── config/          # Deployment mode & app target resolution
│   ├── index.css        # Theme tokens (CSS variables per theme) + Tailwind layers
│   ├── i18n.ts          # i18next setup and namespace registration
│   ├── types/           # Domain + backend types, Result monads, Zod schemas
│   └── services/        # Business logic, repositories & data access
│       ├── ai/          # AI engine, tool registry, guardrails
│       ├── core/        # Transaction manager & validator services
│       ├── fiscal/      # Tax calculation engine & calendar rules
│       ├── import/      # CSV parsers & snapshot reconciler
│       ├── repositories/# Repository abstraction pattern (Local / Cloud)
│       ├── security/    # Vault lifecycle, crypto, TOTP, passkeys, secrets
│       └── storage/     # Encrypted storage providers (AES-256-GCM)
├── server/              # Zero-dependency Node runtime (Docker server, Yahoo proxy)
├── docker/              # Dockerfile for the self-hosted image
├── locales/             # i18n translation namespaces (en/ & fr/)
├── mcp-server/          # Standalone Model Context Protocol (MCP) server
├── scripts/             # DevSecOps & validation automation
├── supabase/            # Cloud-mode migrations & edge functions
├── public/              # Static assets
├── test-data/           # Sample broker CSV files for testing imports
├── tests/               # Vitest unit & integration tests
├── docker-compose.yml   # One-command self-hosting
├── tailwind.config.ts   # Tailwind build config (colors derived automatically from src/index.css variables)
├── postcss.config.js
└── index.html           # HTML entry (no third-party script)
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 20+ LTS recommended)
- [npm](https://www.npmjs.com/) (or pnpm / yarn)

### 1. Installation
Clone the repository and install the dependencies:
```bash
git clone https://github.com/your-username/GlassFolio.git
cd GlassFolio
npm install
```
*(The pre-commit DevSecOps shield hook is automatically configured during `npm install`)*

### 2. Start the Development Server
Launch the local Vite development server:
```bash
npm run dev
```

Open your browser and navigate to:  
👉 **[http://localhost:3000](http://localhost:3000)**

### 3. Run the Standalone MCP Server
To expose GlassFolio tools to external AI clients (Claude Desktop, Cursor, Antigravity IDE):
```bash
npm run mcp
```

### 4. Build for Production
To build the application bundle for production:
```bash
npm run build
```

To preview the production bundle locally:
```bash
npm run preview
```

### 5. Self-host with Docker
GlassFolio ships a hardened image (non-root, read-only filesystem, no capabilities) that serves the app and
proxies market data (Yahoo Finance) on the same origin.

```bash
npm run docker:up      # build the image and start it on http://localhost:3000
npm run docker:logs    # follow the logs
npm run docker:down    # stop it (your data is kept)
npm run docker:smoke   # build + start a throw-away container and verify it end to end
```

- **Data** lives in the `glassfolio-data` Docker volume (only end-to-end encrypted vault records are written there).
  Back it up with `docker run --rm -v glassfolio_glassfolio-data:/data -v "$PWD":/backup alpine tar czf /backup/glassfolio-data.tgz -C /data .`
- **Network**: bound to `127.0.0.1` by default. Set `GLASSFOLIO_BIND=0.0.0.0` (and optionally `GLASSFOLIO_PORT`) in
  `docker/docker.env` to expose it on your network — put a TLS reverse proxy in front if you do.
- **Host folder instead of a volume**: set `GLASSFOLIO_DATA=/path/to/folder` (writable by uid 1000).
- **Where your data lives**: in local mode the server volume is the source of truth. The browser keeps only
  preferences (theme, language, consent), so clearing the cache or opening GlassFolio in another browser does not
  lose anything — just unlock the vault with your master password. `npm run dev` behaves the same and writes to
  `./glassfolio-data` (git-ignored). Two browsers editing at the same moment: the last write per record wins.
- **Behind a reverse proxy with a domain name**: set `GLASSFOLIO_ALLOWED_HOSTS=glassfolio.example.com` so the vault
  API accepts that host (localhost and IP addresses always work; this blocks DNS-rebinding attacks).
- **Security headers**: the server sends a strict Content-Security-Policy (`script-src 'self'`, no inline script, no
  `eval`, no framing, Trusted Types enforced for script sinks) plus COOP, Permissions-Policy and `X-Content-Type-Options`. To let the app call another origin
  (e.g. a remote Ollama), set `GLASSFOLIO_CSP_CONNECT_SRC=https://ollama.example.com`.
- **Exposing the container to your network**: set both variables in your shell, never in a file. `npm run docker:up`
  refuses a network bind without a token.
  ```bash
  GLASSFOLIO_BIND=0.0.0.0 GLASSFOLIO_ACCESS_TOKEN=$(openssl rand -hex 16) npm run docker:up
  ```
  The browser then asks once for a login (user `glassfolio`, password = the token). This is HTTP Basic: on an untrusted
  network, put a TLS reverse proxy in front (and list its domain in `GLASSFOLIO_ALLOWED_HOSTS`).
- **Supply chain**: the base image and every GitHub Action are pinned by SHA, npm packages by their lockfile SHA-512
  integrity hashes; `npm run check:supply-chain` fails the build if any of them drifts.

---

## 🧪 Quality Assurance & DevSecOps Commands

GlassFolio enforces strict code quality, security, and theming standards:

| Command | Purpose |
|---|---|
| `npm test` | Run the complete Vitest test suite (598 tests across 46 suites) |
| `npm run test:security` | Run the encrypted vault E2EE adversarial test suite |
| `npm run check:standards` | Run the full DevSecOps audit (theming, zero-hex, zero personal paths, storage invariants) |
| `npm run check:theming` | Verify theme tokens contract and `<TrendValue />` / `<TrendBadge />` micro-primitives |
| `npm run check:types` | Strict TypeScript compilation check (`tsc --noEmit`) |
| `npm run check:i18n` | Verify 100% translation key parity across EN & FR across all 13 namespaces |
| `npm run check:mcp` | Validate the Standalone MCP server protocol |
| `npm run lint` | ESLint 9 validation with 0 warnings tolerated |
| `npm run precommit:check` | Local pre-commit security shield (<200ms) executed before git commits |

---

## 🧪 Testing with Demo Data

GlassFolio comes pre-seeded with rich mock financial portfolios, transactions, and goals.  
- If you wish to test custom imports, sample CSV files are available in the [`test-data/`](test-data/) directory.
- You can reset or reseed the mock database at any time via the **Settings** page (`/settings`).
- Demo credentials: `demo@glassfolio.com` / `password`.

---

## 📜 Development Standards & Guidelines

For contributors and AI agents working on this codebase:
- **`AI_CODING_STANDARDS.md`**: Master architectural reference (strict theming, zero hardcoded colors or copy, ISO 8601 date serialization, service layer encapsulation, AI tool registration).
- **`AGENTS.md`**: Operating instructions, persistent memory graph integration, git branching policy (`feat/tgla-XXX-*`), and Obsidian knowledge base synchronization protocols.

---

## 📄 License

GlassFolio is **source-available**, not open-source in the OSI sense. The code is published under the [PolyForm Noncommercial License 1.0.0](LICENSE):

- You may download, study and modify it, and propose contributions, for any **non-commercial** use.
- Any commercial use or monetization, of the original or of a modified version, is prohibited.
- The intellectual property remains with the author. See [CONTRIBUTING.md](CONTRIBUTING.md) for how contributions are accepted.
