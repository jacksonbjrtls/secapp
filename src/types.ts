export type UserRole = 'admin' | 'manager' | 'viewer';
export type UserStatus = 'pending' | 'approved' | 'blocked';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status?: UserStatus;
  group?: 'A' | 'B' | 'C' | 'D' | 'E';
  disabled?: boolean;
  isEmailVerifiedOverride?: boolean;
  emailVerifiedInAuth?: boolean;
  mustChangePassword?: boolean;
  isMaster?: boolean;
  createdAt: Date | any;
  updatedAt?: Date | any;
  menuOrder?: string[];
  lastOmissionJustifiedAt?: any;
}

export interface AllowedDomain {
  id: string;
  domain: string;
  addedBy: string;
  createdAt: Date | any;
}

export interface Metric {
  id: string;
  name: string;
  value: number;
  category: string;
  timestamp: Date | any;
  userId?: string;
}

export interface ProductionLine {
  id: string;
  name: string;
  active: boolean;
  order?: number;
}

export interface WireSupplier {
  id: string;
  name: string;
  active: boolean;
}

export interface WireStorageBay {
  id: string;
  name: string;
  active: boolean;
}

export interface WireBatch {
  id: string;
  nfNumber: string;
  supplierId: string;
  supplierName: string;
  responsibleId: string;
  responsibleName: string;
  date: string;
  totalWeight: number;
  coilsCount: number;
  status: 'open' | 'closed';
  createdAt: any;
  storageBayId?: string;
  storageBayName?: string;
}

export interface WireCoil {
  id: string;
  coilNumber: string;
  batchId: string;
  supplierId: string;
  diameter: number;
  weight: number;
  status: 'received' | 'in_use' | 'consumed';
  currentLineId?: string;
  receivedAt: any;
  consumedAt?: any;
  consumedBy?: string;
  consumedShift?: string;
  updatedBy?: string;
  updatedAt?: any;
  isDamaged?: boolean;
  storageBayId?: string;
  storageBayName?: string;
}

export interface QualitySector {
  id: string;
  name: string;
  lineIds: string[]; // IDs das linhas que compõem este setor
  active: boolean;
  createdAt: any;
}

export type ChecklistItemType = 'condition' | 'number' | 'range' | 'barcode' | 'text';

export interface ChecklistItemDefinition {
  id: string;
  label: string;
  type: ChecklistItemType;
  required: boolean;
  min?: number;
  max?: number;
  step?: number;
  conditionOptionsId?: string; // ID for custom options (e.g., ["OK", "NOK"])
  isInteger?: boolean; // For 'number' type
  isRangeDropdown?: boolean; // For 'range' type
  allowObservation?: boolean; // Se o usuário pode colocar uma observação com texto livre
}

export interface QualityChecklistOptionSet {
  id: string;
  name: string; // e.g., "OK / NÃO OK"
  options: string[]; // e.g., ["OK", "NÃO OK"]
  active: boolean;
  createdAt: any;
}

export interface QualityChecklistTemplate {
  id: string;
  name: string;
  description: string;
  sectorId: string; // ID do QualitySector ou 'all'
  frequencyPerShift: number;
  items: ChecklistItemDefinition[];
  active: boolean;
  createdBy: string;
  createdAt: any;
}

export interface QualityChecklistSubmission {
  id: string;
  templateId: string;
  sectorId: string;
  lineId?: string; // ID da linha específica onde foi realizado
  userId: string;
  userName: string;
  shift: string;
  responses: {
    itemId: string;
    value: any;
    observation?: string;
  }[];
  createdAt: any;
}

export interface QualityChecklistOmission {
  id: string;
  userId: string;
  userName: string;
  templateId: string;
  templateName: string;
  date: string; // ISO date YYYY-MM-DD
  shift: string;
  justification: string;
  createdAt: any;
}

export type ConsumableUnit = 'kg' | 'L' | 'un' | 'm';

export interface ConsumableItem {
  id: string;
  name: string;
  unit: ConsumableUnit;
  currentStock: number;
  minStock: number;
  characteristics?: string;
  active: boolean;
  createdAt: any;
  updatedAt?: any;
}

export interface ConsumableLog {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  type: 'entry' | 'consumption';
  lineId?: string;
  lineName?: string;
  usedByUid?: string;
  usedByName?: string;
  processedByUid: string;
  processedByName: string;
  shift?: 'Turno 1' | 'Turno 2' | 'Turno 3' | 'Geral';
  group?: string;
  notes?: string;
  timestamp: any;
}

