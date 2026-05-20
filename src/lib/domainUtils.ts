import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from './firebase';
import { MASTER_EMAILS } from '../constants';

/**
 * Validates if an email domain is allowed.
 * @param email The email to validate
 * @returns { Promise<{ allowed: boolean, domain: string, isMaster: boolean }> }
 */
export async function validateEmailDomain(email: string): Promise<{ allowed: boolean, domain: string, isMaster: boolean }> {
  if (!email) return { allowed: false, domain: '', isMaster: false };
  
  const emailLower = email.toLowerCase().trim();
  const parts = emailLower.split('@');
  if (parts.length < 2) return { allowed: false, domain: '', isMaster: false };
  
  const domain = parts[parts.length - 1].trim(); // Get the last part after last @ and trim
  const isMaster = MASTER_EMAILS.includes(emailLower);

  if (isMaster) {
    return { allowed: true, domain, isMaster: true };
  }

  try {
    const domainsSnap = await getDocs(collection(db, 'allowed_domains'));
    
    // If no domains are explicitly allowed yet, we allow everyone (bootstrapping phase)
    if (domainsSnap.empty) {
      return { allowed: true, domain, isMaster: false };
    }

    const allowedDomains = domainsSnap.docs.map(d => {
      let id = d.id.toLowerCase().trim();
      if (!id.startsWith('@')) id = '@' + id;
      return id;
    });

    const normalizedDomain = domain.startsWith('@') ? domain.toLowerCase().trim() : '@' + domain.toLowerCase().trim();
    const isAllowed = allowedDomains.includes(normalizedDomain);

    return { allowed: isAllowed, domain: normalizedDomain, isMaster: false };
  } catch (error) {
    console.error('Error validating domain:', error);
    // On error, only allow if it's a master email
    return { allowed: isMaster, domain, isMaster };
  }
}
