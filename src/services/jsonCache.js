const STORAGE_PREFIX = 'mtgjson-cache-v1';
const MAX_ENTRY_SIZE = 2_000_000; // ~2MB per entry
const memoryCache = new Map();

const buildStorageKey = (key) => `${STORAGE_PREFIX}:${key}`;

const readEntry = (key) => {
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const raw = localStorage.getItem(buildStorageKey(key));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    memoryCache.set(key, entry);
    return entry;
  } catch (error) {
    console.warn('Failed to read cache entry', key, error);
    return memoryCache.get(key) ?? null;
  }
};

const persistEntry = (key, entry) => {
  try {
    const serialized = JSON.stringify(entry);
    if (serialized.length > MAX_ENTRY_SIZE) {
      if (import.meta?.env?.DEV) {
        console.info(
          `Skip caching entry ${key} (> ${MAX_ENTRY_SIZE} chars). Data stays in-memory for this session.`,
        );
      }
      return;
    }
    localStorage.setItem(buildStorageKey(key), serialized);
  } catch (error) {
    console.warn('Failed to persist cache entry', key, error);
  }
};

const removeEntry = (key) => {
  memoryCache.delete(key);
  try {
    localStorage.removeItem(buildStorageKey(key));
  } catch (error) {
    console.warn('Failed to remove cache entry', key, error);
  }
};

const clearAll = () => {
  memoryCache.clear();
  const keysToRemove = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const storageKey = localStorage.key(i);
      if (storageKey?.startsWith(`${STORAGE_PREFIX}:`)) {
        keysToRemove.push(storageKey);
      }
    }
    keysToRemove.forEach((storageKey) => localStorage.removeItem(storageKey));
  } catch (error) {
    console.warn('Failed to clear cache', error);
  }
};

export const jsonCache = {
  get(key) {
    const entry = readEntry(key);
    if (!entry) return null;

    const isExpired = entry.expiresAt && entry.expiresAt < Date.now();
    if (isExpired) {
      removeEntry(key);
      return null;
    }

    return entry.payload;
  },

  set(key, payload, ttlMs) {
    const entry = {
      payload,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    };
    memoryCache.set(key, entry);
    persistEntry(key, entry);
  },

  clear(prefix) {
    if (!prefix) {
      clearAll();
      return;
    }

    Array.from(memoryCache.keys())
      .filter((entryKey) => entryKey.startsWith(prefix))
      .forEach((entryKey) => removeEntry(entryKey));

    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const storageKey = localStorage.key(i);
        if (storageKey?.startsWith(`${STORAGE_PREFIX}:${prefix}`)) {
          keysToRemove.push(storageKey);
        }
      }
      keysToRemove.forEach((storageKey) => localStorage.removeItem(storageKey));
    } catch (error) {
      console.warn('Failed to clear cache prefix', prefix, error);
    }
  },
};

