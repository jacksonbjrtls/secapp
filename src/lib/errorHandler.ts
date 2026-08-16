import { auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let isQuotaExceededGlobal = false;
const quotaListeners = new Set<(exceeded: boolean) => void>();

export function isFirestoreQuotaExceeded(): boolean {
  return isQuotaExceededGlobal;
}

export function subscribeToQuotaStatus(listener: (exceeded: boolean) => void): () => void {
  quotaListeners.add(listener);
  listener(isQuotaExceededGlobal);
  return () => quotaListeners.delete(listener);
}

export function notifyQuotaExceeded() {
  if (!isQuotaExceededGlobal) {
    isQuotaExceededGlobal = true;
    quotaListeners.forEach(listener => listener(true));
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const isQuotaError = errMsg.toLowerCase().includes('quota') || 
                       errMsg.toLowerCase().includes('resource-exhausted') || 
                       errMsg.toLowerCase().includes('free tier database');

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  if (isQuotaError) {
    notifyQuotaExceeded();
    console.warn('Firestore Quota Warning: ', JSON.stringify(errInfo));
    return;
  }

  // Do not throw or log console.error on LIST operations (background subscriptions) to prevent crashing the entire UI or triggering automated error monitors
  if (operationType === OperationType.LIST) {
    console.warn('Firestore List Warning: ', JSON.stringify(errInfo));
    return;
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

