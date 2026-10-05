/**
 * MemoryCache<T> — Generic TTL Cache
 *
 * Prevents redundant API calls (Yahoo Finance / BCE Forex) by
 * caching results in memory with configurable time-to-live.
 *
 * Default TTLs:
 *   - Price quotes (Yahoo Finance): 15 min
 *   - FX rates (BCE / Forex): 24 h
 */

// ============================================================================
// TYPES
// ============================================================================

interface CacheEntry<T> {
    value: T;
    expiresAt: number; // Unix timestamp ms
}

// ============================================================================
// MemoryCache
// ============================================================================

export class MemoryCache<T> {
    private store: Map<string, CacheEntry<T>> = new Map();

    /**
     * @param defaultTTLMs  Default TTL in milliseconds (e.g. 15 * 60 * 1000)
     */
    constructor(private readonly defaultTTLMs: number) {}

    /**
     * Retrieve a value from the cache. Returns null if missing or expired.
     */
    get(key: string): T | null {
        const entry = this.store.get(key);
        if (!entry) return null;

        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }

        return entry.value;
    }

    /**
     * Store a value in the cache with an optional custom TTL.
     */
    set(key: string, value: T, ttlMs?: number): void {
        const ttl = ttlMs ?? this.defaultTTLMs;
        this.store.set(key, {
            value,
            expiresAt: Date.now() + ttl,
        });
    }

    /**
     * Remove a specific key from the cache.
     */
    delete(key: string): void {
        this.store.delete(key);
    }

    /**
     * Evict all expired entries (manual cleanup — not needed for correctness).
     */
    evictExpired(): void {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (now > entry.expiresAt) {
                this.store.delete(key);
            }
        }
    }

    /**
     * Clear the entire cache.
     */
    clear(): void {
        this.store.clear();
    }

    /**
     * Returns the number of entries currently stored (including expired ones).
     */
    get size(): number {
        return this.store.size;
    }

    /**
     * Checks whether a key exists and is not expired.
     */
    has(key: string): boolean {
        return this.get(key) !== null;
    }

    /**
     * Get or set pattern — returns cached value or computes it via factory.
     */
    async getOrSet(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T> {
        const cached = this.get(key);
        if (cached !== null) return cached;

        const fresh = await factory();
        this.set(key, fresh, ttlMs);
        return fresh;
    }
}

// ============================================================================
// PRE-CONFIGURED CACHE INSTANCES
// ============================================================================

/** Price quotes cache: 15-minute TTL (Yahoo Finance / broker APIs) */
export const priceCache = new MemoryCache<Record<string, number>>(15 * 60 * 1000);

/** FX rate cache: 24-hour TTL (BCE / Forex APIs) */
export const fxRateCache = new MemoryCache<Record<string, number>>(24 * 60 * 60 * 1000);
