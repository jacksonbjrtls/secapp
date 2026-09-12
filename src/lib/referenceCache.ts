import { collection, getDocs, onSnapshot, query, orderBy, DocumentData } from 'firebase/firestore';
import { db } from './firebase';

/**
 * In-memory & localStorage cache for reference collections that change infrequently
 * (e.g. production_lines, wire_suppliers, wire_storage_bays, quality_sectors, etc.)
 * This prevents repeated full collection reads across page navigation.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const MEMORY_CACHE = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL

export function getCachedReference<T>(key: string): T | null {
  // Check memory
  const mem = MEMORY_CACHE.get(key);
  if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
    return mem.data as T;
  }

  // Check localStorage
  try {
    const raw = localStorage.getItem(`secapp_ref_${key}`);
    if (raw) {
      const parsed: CacheEntry<T> = JSON.parse(raw);
      if (parsed && Date.now() - parsed.timestamp < CACHE_TTL_MS) {
        MEMORY_CACHE.set(key, parsed);
        return parsed.data;
      }
    }
  } catch (e) {
    // Ignore storage parse error
  }
  return null;
}

export function setCachedReference<T>(key: string, data: T) {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now()
  };
  MEMORY_CACHE.set(key, entry);
  try {
    localStorage.setItem(`secapp_ref_${key}`, JSON.stringify(entry));
  } catch (e) {
    // LocalStorage quota or blocked
  }
}

export function invalidateReferenceCache(key?: string) {
  if (key) {
    MEMORY_CACHE.delete(key);
    try {
      localStorage.removeItem(`secapp_ref_${key}`);
    } catch (e) {}
  } else {
    MEMORY_CACHE.clear();
  }
}

// Single active listeners registry to prevent duplicate onSnapshot across multiple components
const activeListeners = new Map<string, { unsub: () => void; subscribers: Set<(data: any[]) => void> }>();

export function subscribeSharedCollection(
  collectionName: string,
  callback: (data: any[]) => void,
  sortField = 'name'
): () => void {
  // Return cached immediately if available
  const cached = getCachedReference<any[]>(collectionName);
  if (cached && cached.length > 0) {
    callback(cached);
  }

  let entry = activeListeners.get(collectionName);
  if (!entry) {
    const subscribers = new Set<(data: any[]) => void>();
    subscribers.add(callback);

    let q = query(collection(db, collectionName));
    if (sortField) {
      try {
        q = query(collection(db, collectionName), orderBy(sortField));
      } catch (e) {
        q = query(collection(db, collectionName));
      }
    }

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCachedReference(collectionName, list);
        subscribers.forEach(cb => {
          try {
            cb(list);
          } catch (err) {
            console.warn(`Subscriber error for ${collectionName}:`, err);
          }
        });
      },
      (err) => {
        console.warn(`Error in shared listener for ${collectionName}:`, err);
      }
    );

    entry = { unsub, subscribers };
    activeListeners.set(collectionName, entry);
  } else {
    entry.subscribers.add(callback);
  }

  return () => {
    const current = activeListeners.get(collectionName);
    if (current) {
      current.subscribers.delete(callback);
      if (current.subscribers.size === 0) {
        current.unsub();
        activeListeners.delete(collectionName);
      }
    }
  };
}
