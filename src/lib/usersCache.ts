import { collection, getDocs } from 'firebase/firestore';
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
}

const STORAGE_KEY = 'app_cached_users_list_v1';
let inMemoryUsersCache: CachedUserItem[] | null = null;
let lastFetchPromise: Promise<CachedUserItem[]> | null = null;

export function getLocalCachedUsers(): CachedUserItem[] {
  if (inMemoryUsersCache && inMemoryUsersCache.length > 0) {
    return inMemoryUsersCache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
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
}

export async function fetchUsersSafely(): Promise<CachedUserItem[]> {
  // If a fetch is currently in progress, return the existing promise
  if (lastFetchPromise) {
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
            role: data.role || 'operator',
            status: data.status || 'approved',
            group: data.group || '',
            sectorId: data.sectorId || '',
            sectorName: data.sectorName || '',
            cargoId: data.cargoId || '',
            cargoName: data.cargoName || '',
            birthDate: data.birthDate || '',
            tshirtSize: data.tshirtSize || '',
            registration: data.registration || '',
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
