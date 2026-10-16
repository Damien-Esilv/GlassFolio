# Bolt's Journal - Critical Learnings

## 2025-05-18 - Incremental Aggregation & Map Lookups for Historical Chart Data
**Learning:** In portfolio chart generation (`getDashboardSummary`), repeatedly filtering transactions by date and performing `Array.prototype.find()` on positions inside a loop over chart data points creates an O(M * N) bottleneck and excessive Date object allocations. Pre-parsing dates, using a running index pointer over date-sorted transactions, and caching positions in a Map reduces complexity to O(N + M).
**Action:** Always pre-parse dates and maintain running pointers when aggregating sorted time-series data across consecutive chart interval points.

## 2025-05-19 - Pre-indexed Map Lookups & Avoiding Implicit Fallback Storage Reads in Entity Transformers
**Learning:** Omitting entity collections (such as `instruments`) when transforming lists of transactions forces functions like `convertToLegacyTransaction` to fall back to per-item storage reads (`db.getInstrumentById`), causing N redundant `localStorage` reads and JSON parsing operations. Additionally, performing linear `Array.prototype.find()` searches for accounts, institutes, and instruments inside transaction mapping loops scales at O(N * (A + I + Inst)). Pre-fetching entity lists once and building O(1) `Map` lookups eliminates redundant storage access and reduces transformation complexity to O(N + A + I + Inst).
**Action:** Always pass pre-built `Map<string, T>` containers to batch entity conversion functions and position recalculation loops rather than performing nested `.find()` searches or fallback storage calls inside loops.
