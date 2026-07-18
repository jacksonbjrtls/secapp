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
  isAuditWriteOff?: boolean;
  auditReason?: string;
}

export interface QualitySector {
  id: string;
  name: string;
  lineIds: string[]; // IDs das linhas que compõem este setor
  active: boolean;
  createdAt: any;
}

export type ChecklistItemType = 'condition' | 'number' | 'range' | 'barcode' | 'text' | 'product';

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
  radiatorCount?: number; // Quantidade de radiadores para inspeção do secador
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
  scheduleType?: 'shift' | 'daily' | 'weekly' | 'fortnightly' | 'specific_date';
  specificDate?: string; // YYYY-MM-DD
  weeklyDay?: number; // 0-6 (domingo a sábado)
  items: ChecklistItemDefinition[];
  active: boolean;
  createdBy: string;
  createdAt: any;
  productId?: string;
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
  productId?: string;
  productName?: string;
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

export interface TrainingCourse {
  id: string;
  title: string;
  period: string;
  hours: number;
  syllabus: string;
  instructor: string;
  instructorTitle: string;
  participants: string[];
  createdAt: any;
  updatedAt?: any;
  createdBy: string;
  createdByName?: string;
  accessCode?: string;
  signedParticipants?: string[];
  signatures?: {
    userId: string;
    userName: string;
    email: string;
    signedAt: string;
  }[];
}

export interface SecagemProduct {
  id: string;
  code: string;
  name: string;
  applyCover: boolean; // sim ou não
  wireGauge: '2.18' | '2.30' | 'sem arame'; // 2,18 ou 2,30 ou sem arame
  tieWireQty1: number;
  tieWireQty2: number;
  bigBaleWireQty: number;
  unitWireQty: number;
  sealType: string;
  specialSeal: string;
  photoUrl?: string; // Foto Modelo do Produto
  active: boolean;
  createdAt: any;
}

export interface StopWorkFront {
  id: string;
  front: 'Mecânica' | 'Elétrica' | 'Instrumentação' | 'Hidráulica' | 'Civil' | 'Caldeiraria';
  description: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

export interface StopReport {
  id: string;
  type: 'programada' | 'geral';
  date: string; // YYYY-MM-DD
  lineId: string; // Line ID or name
  lineName?: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  rejectionTime: string; // e.g. "15 minutos" or minutes
  cutterSpeedMS1: number;
  cutterSpeedMS2: number;
  workFronts: StopWorkFront[];
  observation: string;
  userId: string;
  userName: string;
  createdAt: any;
  updatedAt?: any;
}




