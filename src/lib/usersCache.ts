import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './firebase';
import { decryptValue } from './crypto';
import { notifyQuotaExceeded } from './errorHandler';

export interface CachedUserItem {
  uid: string;
  displayName: string;
  email: string;
  role?: string;
  status?: string;
  group?: string;
  sectorId?: string;
  sectorName?: string;
  cargoId?: string;
  cargoName?: string;
  birthDate?: string;
  tshirtSize?: string;
  registration?: string;
  isMaster?: boolean;
  mustChangePassword?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

const STORAGE_KEY = 'app_cached_users_list_v1';
const STORAGE_TIME_KEY = 'app_cached_users_time_v1';
const USERS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL

let inMemoryUsersCache: CachedUserItem[] | null = null;
let lastFetchPromise: Promise<CachedUserItem[]> | null = null;
let lastFetchTime = 0;

// Subscribers list
type UsersSubscriber = (users: CachedUserItem[]) => void;
const subscribers = new Set<UsersSubscriber>();

function notifySubscribers(users: CachedUserItem[]) {
  subscribers.forEach((cb) => {
    try {
      cb(users);
    } catch (e) {
      console.warn('Error in users subscriber callback', e);
    }
  });
}

export function isUsersCacheFresh(): boolean {
  if (inMemoryUsersCache && inMemoryUsersCache.length > 0 && Date.now() - lastFetchTime < USERS_CACHE_TTL_MS) {
    return true;
  }
  try {
    const rawTime = localStorage.getItem(STORAGE_TIME_KEY);
    if (rawTime) {
      const savedTime = parseInt(rawTime, 10);
      if (Date.now() - savedTime < USERS_CACHE_TTL_MS) {
        return true;
      }
    }
  } catch (e) {}
  return false;
}

export function getLocalCachedUsers(): CachedUserItem[] {
  if (inMemoryUsersCache && inMemoryUsersCache.length > 0) {
    return inMemoryUsersCache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryUsersCache = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse cached users from localStorage', e);
  }
  return [];
}

export function setLocalCachedUsers(users: CachedUserItem[]) {
  inMemoryUsersCache = users;
  lastFetchTime = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    localStorage.setItem(STORAGE_TIME_KEY, String(lastFetchTime));
  } catch (e) {
    console.warn('Failed to write cached users to localStorage', e);
  }
  notifySubscribers(users);
}

/**
 * Controlled fetch of users without keeping permanent onSnapshot connections open.
 */
export function ensureUsersLiveSync(): () => void {
  // If cache is not fresh, fetch users safely
  if (!isUsersCacheFresh() || getLocalCachedUsers().length === 0) {
    fetchUsersSafely();
  }
  return () => {};
}

/**
 * Subscribe to user list changes.
 */
export function subscribeToUsers(callback: UsersSubscriber): () => void {
  subscribers.add(callback);

  // Immediately invoke with existing cached users if available
  const initial = getLocalCachedUsers();
  if (initial.length > 0) {
    callback(initial);
  }

  // If cache is stale or missing, fetch in background
  if (!isUsersCacheFresh() || initial.length === 0) {
    fetchUsersSafely().then((fresh) => {
      if (fresh && fresh.length > 0) {
        callback(fresh);
      }
    });
  }

  return () => {
    subscribers.delete(callback);
  };
}

/**
 * React hook to receive real-time, automatically updated list of users across the app.
 */
export function useLiveUsers(): { users: CachedUserItem[]; loading: boolean } {
  const [users, setUsers] = useState<CachedUserItem[]>(() => getLocalCachedUsers());
  const [loading, setLoading] = useState<boolean>(() => users.length === 0);

  useEffect(() => {
    const unsub = subscribeToUsers((updatedUsers) => {
      setUsers(updatedUsers);
      setLoading(false);
    });

    // Also trigger a safe fetch if cache was empty
    if (users.length === 0) {
      fetchUsersSafely().then((fetched) => {
        setUsers(fetched);
        setLoading(false);
      });
    }

    return () => {
      unsub();
    };
  }, []);

  return { users, loading };
}

export async function fetchUsersSafely(force = false): Promise<CachedUserItem[]> {
  // If force is requested or no fetch in progress, perform fresh getDocs
  if (!force && lastFetchPromise) {
    return lastFetchPromise;
  }

  lastFetchPromise = (async () => {
    try {
      const q = collection(db, 'users');
      const snapshot = await getDocs(q);
      const decryptedUsersList: CachedUserItem[] = await Promise.all(
        snapshot.docs.map(async (d) => {
          const data = d.data();
          const decName = await decryptValue(data.displayName);
          const decEmail = await decryptValue(data.email);
          return {
            uid: d.id,
            displayName: decName || 'Sem nome',
            email: (decEmail || '').toLowerCase().trim(),
            role: data.role || 'viewer',
            status: data.status || 'approved',
            group: data.group || '',
            sectorId: data.sectorId || '',
            sectorName: data.sectorName || '',
            cargoId: data.cargoId || '',
            cargoName: data.cargoName || '',
            birthDate: data.birthDate || '',
            tshirtSize: data.tshirtSize || '',
            registration: data.registration || '',
            isMaster: !!data.isMaster,
            mustChangePassword: !!data.mustChangePassword,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        })
      );

      const validList = decryptedUsersList.filter(u => u.displayName !== 'Sem nome');
      setLocalCachedUsers(validList);
      return validList;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource-exhausted')) {
        notifyQuotaExceeded();
      }
      console.warn('Could not fetch latest users from Firestore (falling back to cache):', errMsg);
      const cached = getLocalCachedUsers();
      return cached;
    } finally {
      lastFetchPromise = null;
    }
  })();

  return lastFetchPromise;
}
