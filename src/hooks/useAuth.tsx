import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { MASTER_EMAILS } from '../constants';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isApproved: boolean;
  isPending: boolean;
  isBlocked: boolean;
  isDisabled: boolean;
  isEmailVerified: boolean;
  mustChangePassword: boolean;
  isMaster: boolean;
  isDomainAllowed: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isManager: false,
  isApproved: false,
  isPending: false,
  isBlocked: false,
  isDisabled: false,
  isEmailVerified: false,
  mustChangePassword: false,
  isMaster: false,
  isDomainAllowed: true,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    // Monitor allowed domains in real-time
    const unsubDomains = onSnapshot(collection(db, 'allowed_domains'), (snap) => {
      setAllowedDomains(snap.docs.map(doc => doc.id.toLowerCase().trim()));
      setDomainsLoading(false);
    }, (err) => {
      console.error('Error monitoring domains:', err);
      setDomainsLoading(false);
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (user) {
        const profileRef = doc(db, 'users', user.uid);
        unsubProfile = onSnapshot(profileRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            console.log('[useAuth] Profile loaded:', { uid: doc.id, status: data.status, role: data.role });
            setProfile({ uid: doc.id, ...data } as UserProfile);
          } else {
            console.log('[useAuth] Profile document does not exist for UID:', user.uid);
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error('[useAuth] Profile snapshot error:', error);
          if (auth.currentUser) {
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          }
          setLoading(false);
        });
      } else {
        console.log('[useAuth] No user authenticated');
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      unsubDomains();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const isMaster = user?.email ? MASTER_EMAILS.includes(user.email.toLowerCase()) : false;
  
  const currentDomainAllowed = React.useMemo(() => {
    if (!user?.email || isMaster) return true;
    if (domainsLoading) return true; // Don't block while loading
    if (allowedDomains.length === 0) return true; // Bootstrap mode
    
    const parts = user.email.toLowerCase().split('@');
    const domainPart = parts[parts.length - 1];
    const domainWithAt = '@' + domainPart;
    
    return allowedDomains.includes(domainPart) || allowedDomains.includes(domainWithAt);
  }, [user?.email, allowedDomains, domainsLoading, isMaster]);

  const isAdmin = profile?.role === 'admin' || isMaster;
  const isManager = profile?.role === 'manager' || isAdmin;
  const isApproved = profile?.status === 'approved';
  const isPending = profile?.status === 'pending';
  const isBlocked = profile?.status === 'blocked';
  const isDisabled = !!profile?.disabled || isBlocked;
  const isEmailVerified = true;
  const mustChangePassword = !!profile?.mustChangePassword;

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      isAdmin, 
      isManager, 
      isApproved, 
      isPending, 
      isBlocked, 
      isDisabled,
      isEmailVerified,
      mustChangePassword,
      isMaster,
      isDomainAllowed: currentDomainAllowed
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
