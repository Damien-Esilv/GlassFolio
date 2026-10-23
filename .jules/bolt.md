# Bolt's Journal - Critical Learnings

## 2025-05-18 - Incremental Aggregation & Map Lookups for Historical Chart Data
**Learning:** In portfolio chart generation (`getDashboardSummary`), repeatedly filtering transactions by date and performing `Array.prototype.find()` on positions inside a loop over chart data points creates an O(M * N) bottleneck and excessive Date object allocations. Pre-parsing dates, using a running index pointer over date-sorted transactions, and caching positions in a Map reduces complexity to O(N + M).
**Action:** Always pre-parse dates and maintain running pointers when aggregating sorted time-series data across consecutive chart interval points.

## 2025-05-19 - Pre-indexed Map Lookups & Stack-Scoped Tenant Cache Isolation
**Learning:** Omitting entity collections (such as `instruments`) when transforming lists of transactions forces functions like `convertToLegacyTransaction` to fall back to per-item storage reads (`db.getInstrumentById`), causing N redundant storage reads and JSON parsing operations. Additionally, performing linear `Array.prototype.find()` searches inside transaction loops scales at O(N * (A + I + Inst)). Pre-fetching entity lists once and building O(1) `Map` lookups eliminates redundant storage access. Crucially, these Maps must remain strictly stack-scoped (function local) rather than module-level singletons to preserve tenant isolation and prevent cross-session memory leaks upon sign-out or vault lock.
**Action:** Always pass stack-scoped `Map<string, T>` containers to batch entity conversion functions and position recalculation loops rather than performing nested `.find()` searches or global caching.

## 2026-10-20 - O(1) Map Lookups & Robust Date Parsing in Fiscal Tax Engine
**Learning:** In tax engine calculations (`enrichTransactions`, `calculateCTOCapitalGains`, `calculateCryptoGains`, `calculateDividendTax`, `generateFormMappings`), linear searches on accounts, institutes, instruments and tax form cases scaled at O(N * (A + I + Inst)). Pre-indexing lookups with stack-scoped Maps and extracting the fiscal year using fast-path ISO string slicing with date fallback reduces complexity to O(N + A + I + Inst) while eliminating thousands of redundant `Date` object allocations.
**Action:** Always maintain stack-scoped Map indexing for entity enrichment and use safe string-slice parsing with fallback for ISO date filtering.



## 2026-03-30 - Stack-Scoped O(1) Position Indexing & Single-Pass Cash Aggregation in Alert Service
**Learning:** In multi-domain notification engines (`evaluateSmartAlerts`), iterating through positions array per rule ($O(R \times P)$) and re-calculating total cash via separate `.filter().reduce()` passes adds unnecessary allocations and $O(N)$ overhead per rule. Building a stack-scoped `Map<string, Position>` and accumulating `totalCash` in a single $O(P)$ pass reduces overall evaluation complexity to $O(P + R)$ while preserving tenant memory isolation.
**Action:** Always pre-index positions into stack-scoped Maps and aggregate cash totals in a single upfront loop before running itemized alert or tax rule evaluations.
