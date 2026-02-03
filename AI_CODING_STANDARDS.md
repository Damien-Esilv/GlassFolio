# AI CODING STANDARDS & ARCHITECTURAL REFERENCE
> **Status:** ACTIVE | **Version:** 1.0 | **Author:** Lead Architect

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

### 1.3. Dynamic Theming (Light, Dark, Midnight)
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

## 4. Critical Value Adds & strict Rules

### 4.1. Security & Permissions
*   **Client-Side Verification:** `ProtectedRoute` handles navigation guarding, but does not secure data.
*   **Data Isolation:** Ensure all queries implicitly filter by `ownerId` (once added) to prevent data leaks between users in the future shared DB.

### 4.2. Accessibility (A11y)
*   **Mandatory Labels:** Every generic icon button (e.g., `<Bell />`) **MUST** have an `aria-label` attribute describing its action.
*   **Contrast:** Verify that text on custom badges or graphs meets WCAG AA standards, especially in "Midnight" mode.

### 4.3. Error Handling (The "Graceful Failure")
*   **Boundaries:** Major layout sections (Sidebar, Dashboard Widgets) should be wrapped in Error Boundaries to prevent a single widget crash from taking down the entire app.
*   **Toast Notifications:** Use the toast/alert system for user feedback, never `window.alert`.

### 4.4. Directory Structure
*   **Vite Non-Standard:** Note that `pages/` and `components/` reside in the **ROOT**, while `services/` resides in `src/`. Respect this structure; do not move files unnecessarily.

### 4.5. Strict Typing
*   **No ANY:** The use of `any` is strictly prohibited unless wrapping an external untyped library (and even then, prefer `unknown`).
*   **Return Types:** Explicitly define return types for all Service functions to ensure contract stability.

---
**End of Standards.**
*Accessing this file constitutes a binding agreement to adhere to these architectural principles.*
