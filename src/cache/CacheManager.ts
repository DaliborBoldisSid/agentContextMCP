/**
 * Cache manager for storing and retrieving cached results
 */

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

export class CacheManager<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds

  constructor(maxSize: number = 1000, ttl: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) return undefined;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // Update hits
    entry.hits++;

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T): void {
    // Check if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLeastUsed();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) return false;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete key from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    let totalHits = 0;
    let totalEntries = 0;

    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
      totalEntries++;
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: totalEntries > 0 ? totalHits / totalEntries : 0,
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLeastUsed(): void {
    let leastUsedKey: string | null = null;
    let leastUsedEntry: CacheEntry<T> | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!leastUsedEntry || entry.hits < leastUsedEntry.hits) {
        leastUsedKey = key;
        leastUsedEntry = entry;
      }
    }

    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}
