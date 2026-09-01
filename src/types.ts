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
  birthDate?: string;
  tshirtSize?: string;
  cargoId?: string;
  cargoName?: string;
  sectorId?: string;
  sectorName?: string;
}

export interface WorkSector {
  id: string;
  name: string; // Cortadeira, Prensa, etc.
  area?: string; // Secagem, Enfardamento, etc.
  areaId?: string;
  active: boolean;
  createdAt?: any;
}

export interface WorkFunction {
  id: string;
  name: string; // Operador de Área 1, Especialista, etc.
  sectorId: string; // ID do setor de trabalho
  active: boolean;
  createdAt: any;
}

export interface VacationRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  group?: string; // Letra / Escala (A, B, C, D, E)
  cargoId?: string;
  cargoName?: string;
  sectorId?: string;
  sectorName?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  days: number;
  thirteenthAdvance?: boolean;
  status: 'pending' | 'approved' | 'rejected';
  rejectedReason?: string;
  createdAt: any;
  updatedAt?: any;
  approvedBy?: string;
  approvedByName?: string;
}

export interface VacationQueueItem {
  id: string;
  userId: string;
  userName: string;
  sectorId: string; // Secagem ou Enfardamento
  position: number; // Ordem de escolha: 1, 2, 3...
  lastYearSelectionDate?: string;
  updatedAt?: any;
}

export interface VacationLimitConfig {
  id: string; // E.g., 'global_limits' or custom
  byCargo: Record<string, number>; // cargoName -> max simultaneous in any month
  byGroup: Record<string, number>; // groupLetter -> max simultaneous in any month
  updatedAt: any;
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
  sector?: string;
  sectorId?: string;
  area?: string;
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

export interface WireReceivingDraft {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  currentBatch: Partial<WireBatch>;
  scannedCoils: Partial<WireCoil>[];
  lastSavedAt: string;
  status?: 'in_progress' | 'completed' | 'discarded';
  updatedAt?: any;
}

export interface WireAuditLog {
  id: string;
  action: 'WIRE_BATCH_SAVED' | 'WIRE_BATCH_EDITED' | 'WIRE_COIL_STATUS_CHANGED' | 'WIRE_DRAFT_DISCARDED';
  batchId?: string;
  managerId: string;
  managerName: string;
  managerEmail?: string;
  nfNumber?: string;
  supplierName?: string;
  coilsCount?: number;
  totalWeight?: number;
  storageBayName?: string;
  details?: Record<string, any>;
  timestamp: any;
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
  minRange?: number;
  maxRange?: number;
  step?: number;
  unit?: string; // Unidade de medida/tipo de dado (ex: %, Hz, kN, bar, kPa, ms, mm, N/m, etc.)
  defaultValue?: number | string; // Valor padrão/alvo pré-definido (ex: 1.85, 2000, "normal")
  autoFillDefaultValue?: boolean; // Se deve preencher automaticamente na abertura ou apenas ficar disponível com botão Usar Norma
  expectedValue?: string; // Resposta considerada CONFORME/ESPERADA (ex: "NÃO", "SIM", "ok", "not_ok", etc.)
  conditionOptionsId?: string; // ID for custom options (e.g., ["OK", "NOK"])
  isInteger?: boolean; // For 'number' type
  isRangeDropdown?: boolean; // For 'range' type
  allowObservation?: boolean; // Se o usuário pode colocar uma observação com texto livre
  radiatorCount?: number; // Quantidade de radiadores para inspeção do secador
  showPreviousValue?: boolean; // Habilitar exibição do valor da última medição como referência histórica
  requiresCover?: boolean; // Se o item é exclusivo para produtos com aplicação de capa (ex: capa rasgada, integridade da capa)
  includeCoverFormatRef?: boolean; // Opcional: incluir parâmetro de referência para Formato Capa
  coverFormatRefValue?: number | string; // Valor ou especificação de referência para Formato Capa
  includeBaleFormatRef?: boolean; // Opcional: incluir parâmetro de referência para Formato Fardo
  baleFormatRefValue?: number | string; // Valor ou especificação de referência para Formato Fardo
}

export interface QualityChecklistOptionSet {
  id: string;
  name: string; // e.g., "OK / NÃO OK"
  options: string[]; // e.g., ["OK", "NÃO OK"]
  active: boolean;
  createdAt: any;
}

export interface TemplatePhotoRequirement {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
}

export interface UnitPhotoInspectionData {
  enabled: boolean;
  photos: Record<string, string>; // e.g. { front: "...", back: "...", top: "..." } or custom photo ids
  photoLabels?: Record<string, string>; // e.g. { front: "Lado Frontal", top: "Topo / Em Cima" }
  evaluation?: {
    sideEvaluations?: Record<string, 'Conforme' | 'Não Conforme' | 'N/A'>;
    wireTyingStatus?: 'Conforme' | 'Não Conforme' | 'N/A';
    coverQualityStatus?: 'Conforme' | 'Não Conforme' | 'N/A';
    labelPrintingStatus?: 'Conforme' | 'Não Conforme' | 'N/A';
    unitHeightStatus?: 'Conforme' | 'Não Conforme' | 'N/A';
    notes?: string;
    overallStatus?: 'Conforme' | 'Não Conforme';
  };
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
  requireProductSelection?: boolean;
  enableUnitPhotoInspection?: boolean;
  photoRequirements?: TemplatePhotoRequirement[];
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
  editedAt?: any;
  editedBy?: string;
  productId?: string;
  productName?: string;
  unitInspection?: UnitPhotoInspectionData;
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
  updatedAt?: any;
  updatedByUid?: string;
  updatedByName?: string;
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
  coverFormat?: string; // Formato da Capa (ex: 1400 x 1600 mm ou Padrão A)
  baleFormat?: string; // Formato do Fardo (ex: 800 x 600 mm ou 250 kg)
  photoUrl?: string; // Foto Modelo do Produto
  active: boolean;
  createdAt: any;
}

export interface StopWorkFrontPhoto {
  id: string;
  url: string; // Base64 data URL
  caption?: string;
  createdAt?: string;
}

export interface StopWorkFront {
  id: string;
  front: string;
  description: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  photos?: StopWorkFrontPhoto[];
}

export interface StopReport {
  id: string;
  type: 'programada' | 'geral' | 'emergencia' | 'inspecao';
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
  userEmail?: string;
  createdBy?: string;
  createdAt: any;
  updatedAt?: any;
}

export interface OvertimeJustification {
  id: string;
  userId: string;
  userName: string;
  group: 'A' | 'B' | 'C' | 'D' | 'E' | string;
  roleName: string; // Função do usuário
  shift: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  totalHours: number;
  area: string;
  justification: string;
  createdBy: string;
  createdByName: string;
  createdAt: any;
}

export interface OvertimeFunction {
  id: string;
  name: string;
  active: boolean;
  createdAt: any;
}

export interface OvertimeArea {
  id: string;
  name: string;
  active: boolean;
  createdAt: any;
}

// Maintenance Module Interfaces
export interface MaintenanceEquipment {
  id: string;
  tag: string;
  name: string;
  area?: string;
  sector?: string;
  line?: string;
  active: boolean;
  createdAt?: any;
}

export interface MaintenanceInspectionType {
  id: string;
  name: string;
  active: boolean;
  createdAt?: any;
}

export interface MaintenanceInspectionName {
  id: string;
  inspectionTypeId: string;
  inspectionTypeName: string;
  name: string;
  active: boolean;
  createdAt?: any;
}

export interface MaintenanceResponsibleCenter {
  id: string;
  name: string;
  active: boolean;
  createdAt?: any;
}

export interface MaintenanceProgrammingType {
  id: string;
  name: string;
  active: boolean;
  createdAt?: any;
}

export interface MaintenanceStatus {
  id: string;
  name: string;
  color?: string;
  isCompleted?: boolean;
  active: boolean;
  createdAt?: any;
}

export interface MaintenanceIssue {
  id: string;
  date: string; // YYYY-MM-DD
  area: string;
  sector: string;
  line: string;
  shift: string;
  teamLetter: string; // Letra (A, B, C, D)
  equipmentTag: string;
  equipmentName: string;
  inspectionType: string;
  inspectionName: string;
  responsibleCenter: string;
  programmingType: string;
  status: string; // 'Pendente', 'Concluído', etc.
  sapNote: string; // Número da nota do SAP
  description: string;
  attachments: string[]; // URLs or base64 photo strings
  origin?: 'Manual' | 'Rota Operacional';
  routeSubmissionId?: string;
  createdBy: string;
  createdByName: string;
  resolvedAt?: any;
  resolvedBy?: string;
  resolvedByName?: string;
  createdAt: any;
  updatedAt?: any;
}






