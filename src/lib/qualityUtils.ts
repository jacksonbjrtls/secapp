import { QualityChecklistTemplate, QualityChecklistOptionSet } from '../types';

/**
 * Checks whether an item's label refers to an anomaly, defect, breakage or fault.
 * Examples: "Arame Quebrado?", "Existe vazamento?", "Trincas na base?", "Tamponamento?"
 */
export function isDefectOrNegativeQuestion(label: string | undefined): boolean {
  if (!label) return false;
  const lower = label.toLowerCase().trim();

  const defectKeywords = [
    'arame quebrado',
    'arame solto',
    'quebrado',
    'quebrada',
    'quebra',
    'trinca',
    'trincado',
    'trincada',
    'fissura',
    'rachadura',
    'vazamento',
    'vazando',
    'vaza',
    'infiltração',
    'infiltracao',
    'defeito',
    'avaria',
    'avarias',
    'danificado',
    'danificada',
    'dano',
    'estragado',
    'estragada',
    'sujeira',
    'sujo',
    'suja',
    'tamponado',
    'tamponada',
    'tamponamento',
    'obstrução',
    'obstrucao',
    'obstruído',
    'obstruida',
    'ruído',
    'ruido',
    'barulho',
    'vibração',
    'vibracao',
    'aquecimento',
    'alta temperatura',
    'superaquecimento',
    'folga',
    'desalinhado',
    'desalinhada',
    'desalinhamento',
    'travado',
    'travada',
    'frouxo',
    'frouxa',
    'solto',
    'solta',
    'anomalia',
    'anormalidade',
    'irregularidade',
    'problema',
    'falha',
    'falhas',
    'perigo',
    'contaminação',
    'contaminacao',
    'impureza',
    'rejeito'
  ];

  return defectKeywords.some(kw => lower.includes(kw));
}

/**
 * Checks whether an item's label or definition is specifically related to Bale Cover inspection
 * (e.g. "Capa Rasgada?", "Integridade da Capa", "Aplicação de Capa", "Formato Capa").
 */
export function isCoverRelatedChecklistItem(item: any): boolean {
  if (!item) return false;
  if (item.requiresCover) return true;
  if (item.includeCoverFormatRef) return true;
  const label = (item.label || item.name || '').toLowerCase().trim();
  return /capa|rasgad|cover/i.test(label);
}

/**
 * Centralized function to determine if a checklist answer response is compliant according to norm.
 */
export function isResponseCompliant(
  itemId: string,
  value: any,
  template?: QualityChecklistTemplate | any,
  optionSets: QualityChecklistOptionSet[] = []
): boolean {
  if (value === undefined || value === null || value === '') return true;

  // N/A or Dispensado values are always compliant / not a failure
  const stringified = String(value).trim().toUpperCase();
  if (stringified === 'N/A' || stringified.startsWith('N/A') || stringified === 'DISPENSADO' || stringified === 'N.A.') {
    return true;
  }

  if (!template || !template.items) return true;
  const item = template.items.find((i: any) => i.id === itemId);
  if (!item) return true;

  // 1. Dryer cleaning specialized matrix (Radiadores / Secador)
  const isDryer = template?.name
    ? (template.name.toLowerCase().includes('limpeza') || template.name.toLowerCase().includes('secador'))
    : false;

  if (isDryer && value) {
    if (typeof value === 'object' && value !== null) {
      const statuses = Object.values(value) as string[];
      const hasNonCompliant = statuses.some(s => {
        const lowerS = String(s).toLowerCase();
        if (lowerS.includes('pouco') || lowerS.includes('limp')) return false;
        return lowerS.includes('suj') || lowerS.includes('tamponado') || lowerS.includes('tamponada') || lowerS.includes('vermelho');
      });
      return !hasNonCompliant;
    } else {
      const lowerVal = String(value).toLowerCase();
      if (lowerVal.includes('pouco') || lowerVal === 'pouco sujo' || lowerVal === 'pouco suja' || lowerVal.includes('limp')) {
        return true;
      }
      if (lowerVal.includes('suj') || lowerVal.includes('tamponado') || lowerVal.includes('tamponada') || lowerVal.includes('vermelho')) {
        return false;
      }
    }
  }

  // 2. Explicit expectedValue defined on the template item by administrator
  if (item.expectedValue !== undefined && item.expectedValue !== null && item.expectedValue !== '') {
    if (value === undefined || value === null || value === '') return true;
    const normVal = String(value).trim().toLowerCase();
    const normExp = String(item.expectedValue).trim().toLowerCase();

    if (normVal === normExp) return true;

    // Normalizing synonyms for "ok / conforme"
    if (normExp === 'ok' || normExp === 'conforme' || normExp === 'sim') {
      if (normVal === 'conforme' || normVal === 'ok' || normVal === 'sim' || normVal === 'c' || normVal === 'bom' || normVal === 'normal' || normVal === 'limpo') {
        return true;
      }
    }

    // Normalizing synonyms for "not_ok / não conforme / não"
    if (normExp === 'not_ok' || normExp === 'não conforme' || normExp === 'nao conforme' || normExp === 'não' || normExp === 'nao' || normExp === 'nok') {
      if (normVal === 'não conforme' || normVal === 'nao conforme' || normVal === 'nok' || normVal === 'not_ok' || normVal === 'não' || normVal === 'nao' || normVal === 'não ok' || normVal === 'nao ok') {
        return true;
      }
    }

    return false;
  }

  // 3. Condition Type Items
  if (item.type === 'condition') {
    if (value === undefined || value === null || value === '') return true;
    const valStr = String(value).toUpperCase().trim();
    const isDefectQuestion = isDefectOrNegativeQuestion(item.label || item.name);

    // If the question is about a defect / problem (e.g., "Arame Quebrado?", "Existe Vazamento?")
    if (isDefectQuestion) {
      // "NÃO" or "AUSENTE" means there is NO defect -> It is COMPLIANT!
      if (
        valStr === 'NÃO' ||
        valStr === 'NAO' ||
        valStr === 'N' ||
        valStr === 'SEM' ||
        valStr === 'NÃO HÁ' ||
        valStr === 'NAO HA' ||
        valStr === 'AUSENTE' ||
        valStr === 'NENHUM' ||
        valStr === 'INEXISTENTE' ||
        valStr === 'SEM ARAME QUEBRADO' ||
        valStr === 'NÃO QUEBRADO' ||
        valStr === 'NAO QUEBRADO' ||
        valStr === 'OK' ||
        valStr === 'CONFORME' ||
        valStr === 'NORMAL' ||
        valStr === 'BOM' ||
        valStr === 'LIMPO'
      ) {
        return true;
      }

      // "SIM" or "PRESENTE" or "QUEBRADO" means defect occurred -> Non-compliant!
      if (
        valStr === 'SIM' ||
        valStr === 'S' ||
        valStr === 'PRESENTE' ||
        valStr === 'EXISTE' ||
        valStr === 'QUEBRADO' ||
        valStr === 'TRINCADO' ||
        valStr === 'COM DEFEITO' ||
        valStr === 'NOT_OK' ||
        valStr === 'NÃO OK' ||
        valStr === 'NAO OK' ||
        valStr === 'NOK' ||
        valStr === 'REJEITADO' ||
        valStr === 'FALHA' ||
        valStr === 'NÃO CONFORME' ||
        valStr === 'NAO CONFORME' ||
        valStr === 'ANORMAL'
      ) {
        return false;
      }
    }

    // Custom option sets
    if (item.conditionOptionsId && optionSets && optionSets.length > 0) {
      const optionSet = optionSets.find(os => os.id === item.conditionOptionsId);
      if (optionSet && optionSet.options && optionSet.options.length > 0) {
        // If option set is Sim/Não and this was a defect question, we already handled it above.
        // For general sets (like ['OK', 'NÃO OK'], ['CONFORME', 'NÃO CONFORME'], ['BOM', 'RUIM']):
        if (valStr === 'OK' || valStr === 'CONFORME' || valStr === 'BOM' || valStr === 'NORMAL' || valStr === 'LIBERADO' || valStr === 'LIMPO') {
          return true;
        }
        if (
          valStr === 'NOT_OK' ||
          valStr === 'NÃO OK' ||
          valStr === 'NAO OK' ||
          valStr === 'NOK' ||
          valStr === 'REJEITADO' ||
          valStr === 'FALHA' ||
          valStr === 'NÃO CONFORME' ||
          valStr === 'NAO CONFORME' ||
          valStr === 'ANORMAL' ||
          valStr === 'RUIM' ||
          valStr === 'BLOQUEADO' ||
          valStr === 'SUJO'
        ) {
          return false;
        }

        // Fallback to matching the first option of the custom set
        return String(value) === String(optionSet.options[0]);
      }
    }

    // General fallback for condition values
    if (
      valStr === 'NOT_OK' ||
      valStr === 'NÃO OK' ||
      valStr === 'NAO OK' ||
      valStr === 'NOK' ||
      valStr === 'REJEITADO' ||
      valStr === 'FALHA' ||
      valStr === 'NÃO CONFORME' ||
      valStr === 'NAO CONFORME' ||
      valStr === 'ANORMAL' ||
      valStr === 'RUIM' ||
      valStr === 'FAIL'
    ) {
      return false;
    }

    if (valStr === 'OK' || valStr === 'CONFORME' || valStr === 'BOM' || valStr === 'SIM' || valStr === 'NORMAL' || valStr === 'LIMPO') {
      return true;
    }

    if (valStr === 'NÃO' || valStr === 'NAO') {
      // In positive questions (e.g. "Proteção fixada?"), "NÃO" means non-compliant
      return false;
    }
  }

  // 4. Range Type Items
  if (item.type === 'range') {
    const valLower = String(value).toLowerCase().trim();
    if (valLower === 'low' || valLower === 'high' || valLower === 'baixo' || valLower === 'alto') {
      return false;
    }
    return true;
  }

  // 5. Number Type Items
  if (item.type === 'number') {
    if (value === undefined || value === null || value === '') return true;
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      if (item.min !== undefined && numValue < item.min) return false;
      if (item.max !== undefined && numValue > item.max) return false;
    }
    return true;
  }

  return true;
}
