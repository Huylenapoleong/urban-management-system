type KVPair = [string, string | null];

const memoryStore = new Map<string, string>();

const normalizeValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  return value == null ? '' : String(value);
};

const AsyncStorageShim = {
  async getItem(key: string): Promise<string | null> {
    return memoryStore.has(key) ? memoryStore.get(key) ?? null : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    memoryStore.set(key, normalizeValue(value));
  },

  async removeItem(key: string): Promise<void> {
    memoryStore.delete(key);
  },

  async mergeItem(key: string, value: string): Promise<void> {
    const current = await AsyncStorageShim.getItem(key);
    if (!current) {
      await AsyncStorageShim.setItem(key, value);
      return;
    }

    try {
      const merged = {
        ...(JSON.parse(current) as Record<string, unknown>),
        ...(JSON.parse(normalizeValue(value)) as Record<string, unknown>),
      };
      await AsyncStorageShim.setItem(key, JSON.stringify(merged));
    } catch {
      await AsyncStorageShim.setItem(key, normalizeValue(value));
    }
  },

  async clear(): Promise<void> {
    memoryStore.clear();
  },

  async getAllKeys(): Promise<string[]> {
    return Array.from(memoryStore.keys());
  },

  async multiGet(keys: string[]): Promise<KVPair[]> {
    return Promise.all(keys.map(async (key) => [key, await AsyncStorageShim.getItem(key)] as KVPair));
  },

  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    keyValuePairs.forEach(([key, value]) => {
      memoryStore.set(key, normalizeValue(value));
    });
  },

  async multiRemove(keys: string[]): Promise<void> {
    keys.forEach((key) => memoryStore.delete(key));
  },

  async multiMerge(keyValuePairs: [string, string][]): Promise<void> {
    for (const [key, value] of keyValuePairs) {
      await AsyncStorageShim.mergeItem(key, value);
    }
  },

  flushGetRequests(): void {
    // noop to match AsyncStorage API surface
  },
};

export const useAsyncStorage = (key: string) => ({
  getItem: () => AsyncStorageShim.getItem(key),
  setItem: (value: string) => AsyncStorageShim.setItem(key, value),
  mergeItem: (value: string) => AsyncStorageShim.mergeItem(key, value),
  removeItem: () => AsyncStorageShim.removeItem(key),
});

export default AsyncStorageShim;
