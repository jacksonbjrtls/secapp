import { doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile } from '../types';

export type RequiredProfileFieldId = 
  | 'displayName' 
  | 'group' 
  | 'sectorId' 
  | 'cargoId' 
  | 'birthDate' 
  | 'tshirtSize';

export interface RequiredProfileFieldMeta {
  id: RequiredProfileFieldId;
  label: string;
  category: string;
  description: string;
  placeholder: string;
  iconName: 'User' | 'Users' | 'Factory' | 'Briefcase' | 'Calendar' | 'Shirt';
}

export const REQUIRED_PROFILE_FIELDS: RequiredProfileFieldMeta[] = [
  {
    id: 'displayName',
    label: 'Nome Completo',
    category: 'Identificação',
    description: 'Necessário para assinatura digital, relatórios e certificações.',
    placeholder: 'Ex: João da Silva Santos',
    iconName: 'User'
  },
  {
    id: 'group',
    label: 'Letra de Trabalho (Escala)',
    category: 'Escala & Turno',
    description: 'Sua turma operacional na escala de revezamento (Letra A, B, C, D ou E).',
    placeholder: 'Selecione a Letra da Escala',
    iconName: 'Users'
  },
  {
    id: 'sectorId',
    label: 'Setor de Trabalho',
    category: 'Lotação Fabril',
    description: 'Área da fábrica onde você atua (ex: Secagem, Enfardamento).',
    placeholder: 'Selecione seu Setor',
    iconName: 'Factory'
  },
  {
    id: 'cargoId',
    label: 'Cargo / Função',
    category: 'Função Operacional',
    description: 'Sua função oficial para controle de tarefas e permissões.',
    placeholder: 'Selecione seu Cargo',
    iconName: 'Briefcase'
  },
  {
    id: 'birthDate',
    label: 'Data de Nascimento',
    category: 'Informação Pessoal',
    description: 'Fundamental para a lista e homenagem dos aniversariantes do mês.',
    placeholder: 'DD/MM/AAAA',
    iconName: 'Calendar'
  },
  {
    id: 'tshirtSize',
    label: 'Tamanho da Camisa',
    category: 'Fardamento & Brindes',
    description: 'Utilizado para encomendas de fardamentos, EPIs e brindes corporativos.',
    placeholder: 'Selecione seu Tamanho (P, M, G, GG...)',
    iconName: 'Shirt'
  }
];

export interface ProfileCompletionStatus {
  isComplete: boolean;
  missingFields: RequiredProfileFieldMeta[];
  filledFields: RequiredProfileFieldMeta[];
  filledCount: number;
  totalCount: number;
  percentage: number;
  reminderCount: number;
  isLocked: boolean;
}

/**
 * Checks which of the 6 required profile fields are missing.
 */
export function getProfileCompletionStatus(profile: UserProfile | null): ProfileCompletionStatus {
  if (!profile) {
    return {
      isComplete: false,
      missingFields: [...REQUIRED_PROFILE_FIELDS],
      filledFields: [],
      filledCount: 0,
      totalCount: REQUIRED_PROFILE_FIELDS.length,
      percentage: 0,
      reminderCount: 0,
      isLocked: false
    };
  }

  const missing: RequiredProfileFieldMeta[] = [];
  const filled: RequiredProfileFieldMeta[] = [];

  for (const field of REQUIRED_PROFILE_FIELDS) {
    let hasValue = false;

    switch (field.id) {
      case 'displayName': {
        const val = profile.displayName?.trim() || '';
        hasValue = Boolean(
          val.length >= 2 && 
          val.toLowerCase() !== 'sem nome' && 
          val.toLowerCase() !== 'usuário' && 
          val.toLowerCase() !== 'usuario'
        );
        break;
      }
      case 'group': {
        const val = profile.group;
        hasValue = Boolean(val && ['A', 'B', 'C', 'D', 'E'].includes(val));
        break;
      }
      case 'sectorId': {
        hasValue = Boolean(profile.sectorId?.trim() || profile.sectorName?.trim());
        break;
      }
      case 'cargoId': {
        hasValue = Boolean(profile.cargoId?.trim() || profile.cargoName?.trim());
        break;
      }
      case 'birthDate': {
        const val = profile.birthDate?.trim() || '';
        hasValue = Boolean(val.length >= 4);
        break;
      }
      case 'tshirtSize': {
        const val = profile.tshirtSize?.trim() || '';
        hasValue = Boolean(val.length >= 1);
        break;
      }
    }

    if (hasValue) {
      filled.push(field);
    } else {
      missing.push(field);
    }
  }

  const totalCount = REQUIRED_PROFILE_FIELDS.length;
  const filledCount = filled.length;
  const percentage = Math.round((filledCount / totalCount) * 100);
  const isComplete = missing.length === 0;

  // Retrieve reminder count with local fallback
  let localCount = 0;
  if (typeof window !== 'undefined' && profile.uid) {
    try {
      const stored = localStorage.getItem(`secapp_profile_reminder_count_${profile.uid}`);
      if (stored) {
        localCount = parseInt(stored, 10) || 0;
      }
    } catch {
      // ignore storage access error
    }
  }

  const reminderCount = Math.max(profile.profileReminderCount || 0, localCount);
  
  // According to rule: if not completed and reached 3 times (reminderCount >= 3), system locks to /profile
  const isLocked = !isComplete && reminderCount >= 3;

  return {
    isComplete,
    missingFields: missing,
    filledFields: filled,
    filledCount,
    totalCount,
    percentage,
    reminderCount,
    isLocked
  };
}

/**
 * Records that the user postponed or dismissed the profile reminder modal.
 * Increments reminderCount by 1 and marks session as postponed.
 */
export async function recordProfileReminderDismiss(userId: string, currentCount: number): Promise<number> {
  const nextCount = currentCount + 1;
  
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`secapp_profile_reminder_count_${userId}`, String(nextCount));
      sessionStorage.setItem(`secapp_profile_reminder_postponed_${userId}`, 'true');
    } catch {
      // ignore
    }
  }

  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      profileReminderCount: increment(1),
      profileReminderLocked: nextCount >= 3,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('[profileCompletion] Could not update profileReminderCount in Firestore:', err);
  }

  return nextCount;
}

/**
 * Clears the reminder count when profile is 100% completed.
 */
export async function resetProfileReminder(userId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(`secapp_profile_reminder_count_${userId}`);
      sessionStorage.removeItem(`secapp_profile_reminder_postponed_${userId}`);
    } catch {
      // ignore
    }
  }

  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      profileReminderCount: 0,
      profileReminderLocked: false,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('[profileCompletion] Could not reset profileReminderCount in Firestore:', err);
  }
}
