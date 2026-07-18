import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, collection, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { MASTER_EMAILS } from '../constants';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import { decryptValue, hashEmailForSearch } from '../lib/crypto';

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
  logoUrl: string | null;
  updateCompanyLogo: (base64Logo: string | null) => Promise<void>;
  isInstallable: boolean;
  installApp: () => Promise<boolean>;
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
  logoUrl: null,
  updateCompanyLogo: async () => {},
  isInstallable: false,
  installApp: async () => false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(true);
  const [logoUrl, setLogoUrlState] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

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

    // Monitor company branding in real-time
    const unsubBranding = onSnapshot(doc(db, 'system_config', 'branding'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setLogoUrlState(data.logoUrl || null);
      } else {
        setLogoUrlState(null);
      }
    }, (error) => {
      console.error('[Branding] Snapshot error:', error);
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (user) {
        const profileRef = doc(db, 'users', user.uid);
         unsubProfile = onSnapshot(profileRef, async (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            console.log('[useAuth] Profile loaded:', { uid: snapshot.id, status: data.status, role: data.role });
            const decryptedDisplayName = await decryptValue(data.displayName);
            const decryptedEmail = await decryptValue(data.email);
            setProfile({
              uid: snapshot.id,
              ...data,
              displayName: decryptedDisplayName,
              email: decryptedEmail,
            } as UserProfile);
          } else {
            console.log('[useAuth] Profile document does not exist for UID:', user.uid);
            setProfile(null);

            // Attempt self-healing profile migration if their profile was registered under a fallback/sandbox UID
            const emailLower = user.email?.toLowerCase().trim();
            if (emailLower) {
              const emailHash = hashEmailForSearch(emailLower);
              const publicRef = doc(db, 'users_public', emailHash);
              
              getDoc(publicRef).then(async (pubSnap) => {
                if (pubSnap.exists()) {
                  const pubData = pubSnap.data() as any;
                  const oldUid = pubData?.uid;
                  if (oldUid && oldUid !== user.uid) {
                    console.log(`[useAuth] Healing: Profile found under different UID (${oldUid}). Starting copy to actual UID (${user.uid})...`);
                    
                    const oldProfileRef = doc(db, 'users', oldUid);
                    const oldProfileSnap = await getDoc(oldProfileRef);
                    
                    if (oldProfileSnap.exists()) {
                      const oldProfileData = oldProfileSnap.data() as any;
                      
                      // Write new profile under the correct actual UID
                      const newProfileRef = doc(db, 'users', user.uid);
                      await setDoc(newProfileRef, {
                        ...oldProfileData,
                        updatedAt: serverTimestamp()
                      });
                      
                      // Update the public lookup index to point to the correct UID
                      await setDoc(publicRef, {
                        uid: user.uid,
                        updatedAt: serverTimestamp()
                      }, { merge: true });
                      
                      console.log('[useAuth] Healing: Profile successfully migrated client-side!');
                    }
                  }
                }
              }).catch((err) => {
                console.warn('[useAuth] Healing lookup failed:', err);
              });
            }
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
      unsubBranding();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // Sync favicon and apple-touch-icon with custom logo (keeping manifest static to ensure PWA installability)
  useEffect(() => {
    const currentFavicon = logoUrl || "/logo_file/logo_32x32pixel.png";
    const currentLogo = logoUrl || "/logo_file/logo_400pixel.png";

    // 1. Update favicon link (browser tab)
    const faviconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (faviconLink) {
      faviconLink.href = currentFavicon;
    }

    // 2. Update apple touch icon link (mobile icon shortcut)
    const appleLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
    if (appleLink) {
      appleLink.href = currentLogo;
    }
  }, [logoUrl]);

  const updateCompanyLogo = async (base64Logo: string | null) => {
    try {
      await setDoc(doc(db, 'system_config', 'branding'), {
        logoUrl: base64Logo,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('[BrandingRef] failed to update company logo:', error);
      throw error;
    }
  };

  const installApp = async (): Promise<boolean> => {
    if (!deferredPrompt) {
      console.warn('[PWA] Prompt de instalação não está disponível.');
      return false;
    }
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[PWA] Escolha do usuário ao instalar: ${outcome}`);
      setDeferredPrompt(null);
      return outcome === 'accepted';
    } catch (err) {
      console.error('[PWA] Erro ao acionar o prompt de instalação:', err);
      return false;
    }
  };

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
      isDomainAllowed: currentDomainAllowed,
      logoUrl,
      updateCompanyLogo,
      isInstallable: !!deferredPrompt,
      installApp
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
