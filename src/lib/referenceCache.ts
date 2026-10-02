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

// Fetch reference collection safely with getDocs and caching (prevents continuous onSnapshot billing)
export async function fetchReferenceCollection<T = any>(
  collectionName: string,
  sortField = 'name',
  force = false
): Promise<T[]> {
  if (!force) {
    const cached = getCachedReference<T[]>(collectionName);
    if (cached && cached.length > 0) {
      return cached;
    }
  }

  try {
    let q = query(collection(db, collectionName));
    if (sortField) {
      try {
        q = query(collection(db, collectionName), orderBy(sortField));
      } catch (e) {
        q = query(collection(db, collectionName));
      }
    }

    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as T[];
    setCachedReference(collectionName, list);
    return list;
  } catch (err) {
    console.warn(`Error fetching reference collection ${collectionName}:`, err);
    return getCachedReference<T[]>(collectionName) || [];
  }
}

// Single active listeners registry to prevent duplicate fetch across multiple components
const activeListeners = new Map<string, { subscribers: Set<(data: any[]) => void> }>();

export function subscribeSharedCollection(
  collectionName: string,
  callback: (data: any[]) => void,
  sortField = 'name'
): () => void {
  // 1. Immediately return cached if available
  const cached = getCachedReference<any[]>(collectionName);
  if (cached && cached.length > 0) {
    callback(cached);
  }

  // 2. Fetch fresh data if cache is empty or expired, without keeping a permanent open stream
  if (!cached || cached.length === 0) {
    fetchReferenceCollection(collectionName, sortField).then((data) => {
      callback(data);
      const entry = activeListeners.get(collectionName);
      if (entry) {
        entry.subscribers.forEach(cb => {
          try {
            cb(data);
          } catch (e) {}
        });
      }
    });
  }

  let entry = activeListeners.get(collectionName);
  if (!entry) {
    const subscribers = new Set<(data: any[]) => void>();
    subscribers.add(callback);
    entry = { subscribers };
    activeListeners.set(collectionName, entry);
  } else {
    entry.subscribers.add(callback);
  }

  return () => {
    const current = activeListeners.get(collectionName);
    if (current) {
      current.subscribers.delete(callback);
      if (current.subscribers.size === 0) {
        activeListeners.delete(collectionName);
      }
    }
  };
}

