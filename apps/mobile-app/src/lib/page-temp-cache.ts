type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const tempCache = new Map<string, CacheEntry<unknown>>();

export function readTempCache<T>(key: string, maxAgeMs: number): T | null {
  const entry = tempCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.updatedAt > maxAgeMs) {
    tempCache.delete(key);
    return null;
  }

  return entry.value;
}

export function writeTempCache<T>(key: string, value: T): void {
  tempCache.set(key, {
    value,
    updatedAt: Date.now(),
  });
}

export function clearTempCache(key: string): void {
  tempCache.delete(key);
}
