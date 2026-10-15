# Bolt's Journal - Critical Learnings

## 2025-05-18 - Incremental Aggregation & Map Lookups for Historical Chart Data
**Learning:** In portfolio chart generation (`getDashboardSummary`), repeatedly filtering transactions by date and performing `Array.prototype.find()` on positions inside a loop over chart data points creates an O(M * N) bottleneck and excessive Date object allocations. Pre-parsing dates, using a running index pointer over date-sorted transactions, and caching positions in a Map reduces complexity to O(N + M).
**Action:** Always pre-parse dates and maintain running pointers when aggregating sorted time-series data across consecutive chart interval points.
