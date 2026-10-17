# Bolt's Journal - Critical Learnings

## 2025-05-18 - Incremental Aggregation & Map Lookups for Historical Chart Data
**Learning:** In portfolio chart generation (`getDashboardSummary`), repeatedly filtering transactions by date and performing `Array.prototype.find()` on positions inside a loop over chart data points creates an O(M * N) bottleneck and excessive Date object allocations. Pre-parsing dates, using a running index pointer over date-sorted transactions, and caching positions in a Map reduces complexity to O(N + M).
**Action:** Always pre-parse dates and maintain running pointers when aggregating sorted time-series data across consecutive chart interval points.

## 2025-10-17 - Map Lookups for Entity Relations in Transaction Loops
**Learning:** In `portfolioService.recalculatePositions`, executing `Array.prototype.find()` on `instruments`, `accounts`, and `institutes` inside the `for (const tx of sortedTxs)` loop creates an O(N * (I + A + Inst)) linear search bottleneck. Pre-indexing entities into `Map` data structures reduces lookup complexity to O(1) per transaction and overall time complexity to O(N + I + A + Inst).
**Action:** Pre-build Map indices for key/ID lookups whenever processing collections of transactions or events against relational entities.
