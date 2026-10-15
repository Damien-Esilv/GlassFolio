# GlassFolio 💎

> **A premium, offline-first personal finance and multi-asset wealth management dashboard.**  
> Built with React 19, TypeScript, Vite, and Tailwind CSS.

---

## 🌟 Overview

**GlassFolio** is a modern, high-performance financial tracking web application designed to bring clarity, depth, and aesthetics to personal wealth management. 

Operating entirely **offline-first**, GlassFolio stores all data locally in the browser with an abstracted service layer designed for instant response times and maximum privacy. It supports multi-asset portfolios (Equities, ETFs, Crypto, Cash, Real Estate), comprehensive transaction ledgers, performance analytics, ETF fee impact analysis, French fiscal declarations (PFU, PEA, Cerfa 2042/2074/3916), and idempotent CSV import wizards.

---

## ✨ Key Features

### 📊 1. Multi-Asset Portfolio & Positions Tracking
- **Granular Asset Allocation**: Visualize investments grouped by asset class (*Equities & Funds, Crypto, Cash & Savings, Real Estate*), financial institution (*BoursoBank, Trade Republic, Degiro, etc.*), and specific account (*PEA, CTO, Assurance-Vie, Wallets*).
- **Position Monitoring**: Track quantities, average purchase price (PRU), total current valuation, and real-time unrealized gains/losses.
- **Market Data**: Integrates live and reference price feeds with fallback mock providers.

### 💸 2. Transactions Ledger
- **Complete Operation History**: Log and filter buys, sells, dividend payouts, broker fees, deposits, and cash transfers.
- **Multi-Currency Support**: Native handling of multi-currency entries (EUR, USD, GBP, CHF) with automatic exchange conversion rates.

### 📈 3. Advanced Analytics & Fee Analysis
- **Performance Benchmarks**: Historical portfolio evolution and benchmark comparisons over multiple time horizons (1M, YTD, 1Y, ALL).
- **P&L Breakdown**: Distinct analysis of realized vs. unrealized profit and loss across asset classes.
- **ETF Fee Analyzer & Drag Calculator**: Calculates ongoing management costs (TER), broker drag, and projects the compounding cost of fees over 5 to 30 years. Compare your funds against low-cost benchmark alternatives.

### 🏛️ 4. French Tax Module (*Fiscalité*)
- **Unified Fiscal Hub**: Clear visibility into capital gains and dividend tax regimes (Flat Tax 30% / PFU vs. Progressive Income Scale, PEA 5-year tax exemption threshold).
- **Cerfa Declaration Assistant**: Step-by-step assistance and field-by-field guidance for French tax returns:
  - Form **2042** / **2042-C** (Dividends & financial income)
  - Form **2074** (Capital gains & loss carryover)
  - Form **3916** / **3916-bis** (Foreign account declarations: Trade Republic, Degiro, Interactive Brokers, Revolut, etc.)
- **Tax Optimization & Tax-Loss Harvesting**: Strategies to balance realized gains with capital losses and maximize envelope tax shields.
- **Integrated Fiscal Guide**: Detailed explanations of tax thresholds, holding periods, and applicable social security levies (CSG/CRDS 17.2%).

### 📥 5. Robust CSV Import Engine & Rollback
- **Universal Multi-Broker Support**: Import CSV statements from popular brokers (Trade Republic, Degiro, Interactive Brokers, BoursoBank, Revolut, Finary).
- **Dual Import Modalities**:
  - *History Mode*: Sequential transaction ledger playback and account state reconstruction.
  - *Snapshot Mode*: Point-in-time balance and position reconciliation.
- **Idempotence & Deduplication**: SHA-256 batch hashing and row-level fingerprinting prevent accidental duplicate imports.
- **1-Click Batch Rollback**: Safely undo any import batch from the Import History view without corrupting other transactions.

### 🎯 6. Financial Goals & Gamification
- **Milestone Tracking**: Define custom savings and net worth targets with dynamic progress bars.
- **Achievements & Badges**: Unlockable financial habits milestones (first investment, diversification, regular DCA investing, emergency fund threshold).

### 🔒 7. Zero-Knowledge Security & Access Architecture (Epic E11)
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
  - **RFC 6238 TOTP**: 160-bit Base32 secret, HMAC-SHA1, 30s step, ±1 step clock drift, anti-replay window, and single-use SHA-256 hashed backup codes.
  - **Autonomous QR Engine**: Zero-dependency inline SVG matrix generator (`qrCode.ts`).
  - **WebAuthn PRF Passkeys**: Hardware-bound biometric authentication deriving a dedicated KEK via the WebAuthn PRF extension (`hmac-get-secret`), enabling instant zero-knowledge vault unlock.
  - **Emergency Recovery Key**: 256-bit entropy backup code (`XXXX-XXXX-...`).
- **Encrypted Secrets Vault (BYOK)**:
  - Securely store and mask third-party AI keys (OpenAI, Gemini, Anthropic) for in-app assistant features.
- **AI & MCP Exfiltration Guardrails**:
  - `guardrailsService` automatically detects and redacts sensitive API keys, recovery keys, TOTP seeds, and vault header envelopes before dispatching prompts to LLM contexts.
  - Human-in-the-loop requirement (`requiresConfirmation: true`) for destructive actions (`lock_vault`, `rotate_encryption_key`).
- **Single-Repo Dual-Mode Architecture**:
  - Seamlessly switch between `local` (offline-first browser storage) and `cloud` (ready for InstantDB/cloud sync) via `VITE_DEPLOYMENT_MODE`.

### 🛡️ 8. Privacy & Data Portability
- **100% Offline-First**: No external servers hold your financial balances or personal data.
- **Full JSON Backup & Restore**: One-click complete export and restore of all portfolio entities, settings, and transaction records.

---

## 🎨 Design & Theming Philosophy

GlassFolio follows strict UI and aesthetic standards:
- **Zero Hardcoded Values**: No raw hex/RGB color codes in components. All colors rely on semantic Tailwind utility classes mapped to CSS custom properties defined in `index.html` (`bg-card`, `text-primary`, `border-subtle`, `bg-subtle`).
- **3 Curated Themes**:
  - ☀️ **Light**: Clean, slate-based daytime mode.
  - 🌙 **Dark**: Zinc-based high-contrast dark mode.
  - 🌌 **Midnight**: Deep blue-slate immersive night mode.
- **Fluid Micro-Animations**: Smooth transitions, backdrop blurs (glassmorphism), and animated interactive components.
- **Full Internationalization (i18n)**: 100% externalized user-facing copy in **English** and **French** across 10 specialized namespaces.

---

## 🛠️ Tech Stack

| Domain | Technologies |
|---|---|
| **Framework & Core** | [React 19](https://react.dev/), [TypeScript 5.8](https://www.typescriptlang.org/), [Vite 6](https://vitejs.dev/) |
| **Routing** | [React Router 7](https://reactrouter.com/) (`HashRouter` with route protection) |
| **Styling & Design System** | [Tailwind CSS](https://tailwindcss.com/) (semantic CSS variables injection) |
| **Charts & Visualizations** | [Recharts 3](https://recharts.org/) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Internationalization** | [i18next 25](https://www.i18next.com/) & [react-i18next 16](https://react.i18next.com/) |
| **Zero-Knowledge Security** | Web Crypto API (PBKDF2 600k, HKDF-SHA256, AES-KW, AES-256-GCM, WebAuthn PRF) |
| **Data & Storage Layer** | Dual-Mode `IStorageProvider` ([EncryptedStorageProvider](file:///Users/damien/Developpement/Side-Projects/Builds/GlassFolio/src/services/storage/EncryptedStorageProvider.ts)), ready for InstantDB |
| **Testing & CI/CD** | [Vitest 5](https://vitest.dev/), GitHub Actions (5 quality gates, least privilege, bundle budget) |

---

## 🏗️ Architecture & Data Flow

```
┌───────────────────────────────────────────────────────────┐
│                     React Application                     │
│                                                           │
│  ┌───────────────────────┐     ┌───────────────────────┐  │
│  │      Pages (15+)      │     │  Context Providers    │  │
│  │ Dashboard, Portfolio, │◄────┤ AuthContext (user/th) │  │
│  │ Positions, Analytics, │     │ DataContext (state)   │  │
│  │ TaxHub, ImportWizard  │     └───────────────────────┘  │
│  └───────────┬───────────┘                                │
│              │                                            │
│              ▼                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                   Service Layer                     │  │
│  │  portfolioService, transactionService, goalService, │  │
│  │  feeService, taxEngine, importManager, priceService │  │
│  └───────────────────────────┬─────────────────────────┘  │
│                              │                            │
│                              ▼                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │          Encrypted Storage Layer (appStorage)       │  │
│  │  - Synchronous In-Memory Decrypted Cache            │  │
│  │  - Serialized Async Envelope Encryption Queue       │  │
│  │  - AES-256-GCM + 96-bit Unique IVs + AAD            │  │
│  │  - Instant Memory Wipe on Vault Lock                │  │
│  └───────────────────────────┬─────────────────────────┘  │
│                              │                            │
│                              ▼                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │      Physical Persistence (Dual-Mode Factory)       │  │
│  │      - Local Mode : localStorage Encrypted Envelopes│  │
│  │      - Cloud Mode : InstantDB / Encrypted Sync      │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
GlassFolio/
├── components/          # Reusable UI components (Layout, GoalCard, Modals, Buttons)
├── context/             # Global React Contexts (AuthContext, DataContext)
├── hooks/               # Custom React hooks (CSV import, snapshot reconciliation)
├── locales/             # i18n translation namespaces
│   ├── en/              # English dictionaries (auth, common, dashboard, tax, etc.)
│   └── fr/              # French dictionaries (auth, common, dashboard, tax, etc.)
├── pages/               # Routed page views
│   ├── Analytics.tsx            # Analytics overview hub
│   ├── Dashboard.tsx            # Executive overview & asset distribution
│   ├── DeclarationAssistant.tsx # Tax declaration wizard (2042/2074/3916)
│   ├── FeeAnalysis.tsx          # ETF fees & long-term cost drag calculator
│   ├── ImportHistory.tsx        # Batch manager with rollback capability
│   ├── ImportWizard.tsx         # Multi-broker CSV import wizard
│   ├── Portfolio.tsx            # Categorized portfolio breakdown
│   ├── PortfolioHub.tsx         # Account and asset allocation hub
│   ├── PortfolioPerformance.tsx # Time-weighted return & benchmark charts
│   ├── Positions.tsx            # Granular position & PRU table
│   ├── Progress.tsx             # Goals & gamified achievement badges
│   ├── RealizedUnrealizedPL.tsx # Capital gains and losses analysis
│   ├── Settings.tsx             # Theme, currency, language & backup settings
│   ├── TaxGuide.tsx             # Explanatory guide to French financial taxation
│   ├── TaxHub.tsx               # Tax overview & regime selector
│   └── TaxOptimization.tsx      # Tax-loss harvesting & PEA optimization
├── src/
│   ├── i18n.ts          # i18next setup and namespace registration
│   ├── types/           # Production Super-Schema TypeScript definitions
│   └── services/        # Business logic & data access services
│       ├── core/        # Transaction manager & validator services
│       ├── fiscal/      # Tax calculation engine & French tax rules
│       ├── import/      # CSV parsers & snapshot reconciler
│       ├── db.ts        # Mock database with simulated latency
│       ├── portfolioService.ts
│       ├── transactionService.ts
│       └── etfFeeService.ts
├── test-data/           # Sample broker CSV files for testing imports
├── types.ts             # Domain entity TypeScript interfaces
├── App.tsx              # Application router & route guards
├── index.html           # Design tokens, CSS variables & Tailwind config
└── index.tsx            # React application entry point
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18+ recommended)
- [npm](https://www.npmjs.com/) (or pnpm / yarn)

### 1. Installation
Clone the repository and install the dependencies:
```bash
git clone https://github.com/your-username/GlassFolio.git
cd GlassFolio
npm install
```

### 2. Start the Development Server
Launch the local Vite development server:
```bash
npm run dev
```

Open your browser and navigate to:  
👉 **[http://localhost:3000](http://localhost:3000)** (or the port displayed in your terminal).

### 3. Build for Production
To build the application bundle for production:
```bash
npm run build
```

To preview the built production bundle locally:
```bash
npm run preview
```

---

## 🧪 Testing with Demo Data

GlassFolio comes pre-seeded with rich mock financial portfolios, transactions, and goals.  
- If you wish to test custom imports, sample CSV files are available in the [`test-data/`](file:///Users/damien/Developpement/Side-Projects/Builds/GlassFolio/test-data) directory.
- You can reset or reseed the mock database at any time via the **Settings** page (`/settings`).

---

## 📜 Development Standards & Guidelines

For contributors and AI agents working on this codebase:
- **`AI_CODING_STANDARDS.md`**: Master architectural reference (strict theming, zero hardcoded colors or copy, ISO 8601 date serialization, service layer encapsulation).
- **`AGENTS.md`**: Operating instructions, persistent memory graph integration, and Obsidian knowledge base synchronization protocols.

---

## 📄 License

Private / Proprietary. All rights reserved.
