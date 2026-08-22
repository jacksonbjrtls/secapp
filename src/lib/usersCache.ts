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
let inMemoryUsersCache: CachedUserItem[] | null = null;
let lastFetchPromise: Promise<CachedUserItem[]> | null = null;

// Real-time subscribers list
type UsersSubscriber = (users: CachedUserItem[]) => void;
const subscribers = new Set<UsersSubscriber>();
let activeUnsub: (() => void) | null = null;

function notifySubscribers(users: CachedUserItem[]) {
  subscribers.forEach((cb) => {
    try {
      cb(users);
    } catch (e) {
      console.warn('Error in users subscriber callback', e);
    }
  });
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } catch (e) {
    console.warn('Failed to write cached users to localStorage', e);
  }
  notifySubscribers(users);
}

/**
 * Start or ensure the active real-time Firestore listener on the users collection.
 */
export function ensureUsersLiveSync(): () => void {
  if (activeUnsub) {
    return activeUnsub;
  }

  try {
    const q = collection(db, 'users');
    activeUnsub = onSnapshot(
      q,
      async (snapshot) => {
        try {
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
        } catch (err: any) {
          console.warn('Real-time decryption of users failed:', err);
        }
      },
      (err) => {
        const errMsg = err?.message || String(err);
        if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource-exhausted')) {
          notifyQuotaExceeded();
        }
        console.warn('Real-time users snapshot error (keeping local cache):', errMsg);
      }
    );
  } catch (e) {
    console.warn('Could not initialize users live sync:', e);
  }

  return () => {
    if (activeUnsub) {
      activeUnsub();
      activeUnsub = null;
    }
  };
}

/**
 * Subscribe to real-time user list changes.
 */
export function subscribeToUsers(callback: UsersSubscriber): () => void {
  subscribers.add(callback);
  ensureUsersLiveSync();

  // Immediately invoke with existing cached users if available
  const initial = getLocalCachedUsers();
  if (initial.length > 0) {
    callback(initial);
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
