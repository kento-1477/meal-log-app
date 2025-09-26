const DEFAULT_MAX_ENTRIES = 2000;

function nowMs() {
  return Date.now();
}

function createCache({
  ttlSeconds = 0,
  maxEntries = DEFAULT_MAX_ENTRIES,
} = {}) {
  const store = new Map();
  const inflight = new Map();

  function ttlToMs(ttlSec) {
    const ttl = Number.isFinite(ttlSec) && ttlSec > 0 ? ttlSec : ttlSeconds;
    return ttl > 0 ? ttl * 1000 : 0;
  }

  function purgeExpired() {
    const current = nowMs();
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt && entry.expiresAt <= current) {
        store.delete(key);
      }
    }
    if (store.size > maxEntries) {
      const keys = Array.from(store.keys());
      const excess = store.size - maxEntries;
      for (let i = 0; i < excess; i += 1) {
        store.delete(keys[i]);
      }
    }
  }

  function get(key) {
    purgeExpired();
    const entry = store.get(key);
    return entry ? entry.value : null;
  }

  function set(key, value, { ttlSec } = {}) {
    const expiresInMs = ttlToMs(ttlSec);
    const expiresAt = expiresInMs > 0 ? nowMs() + expiresInMs : null;
    store.set(key, { value, expiresAt });
  }

  async function wrap(key, executor, { ttlSec } = {}) {
    const cached = get(key);
    if (cached) return cached;

    if (inflight.has(key)) {
      return inflight.get(key);
    }

    const promise = (async () => {
      try {
        const value = await executor();
        if (value !== undefined) {
          set(key, value, { ttlSec });
        }
        return value;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  }

  function clear() {
    store.clear();
    inflight.clear();
  }

  return { get, set, wrap, clear };
}

module.exports = { createCache };
