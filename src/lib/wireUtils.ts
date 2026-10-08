export interface ParsedWireCoil {
  coilNumber: string;
  diameter: number;
  weight: number;
  supplier: 'Belgo' | 'Morlan' | 'Unknown';
  lotNumber?: string;
  isPartialScan?: boolean;
}

/**
 * Checks if a parsed supplier matches the user-selected supplier name flexibly
 * (e.g. 'Belgo' matches 'Siderúrgica Belgo Bekaert', 'Belgo Bekaert', 'ArcelorMittal Arame e Fios')
 */
export const isSupplierCompatible = (parsedSupplier: string, selectedSupplierName: string): boolean => {
  if (!selectedSupplierName) return true;
  const p = (parsedSupplier || '').toLowerCase().trim();
  const s = (selectedSupplierName || '').toLowerCase().trim();

  if (p === s) return true;

  // Belgo / ArcelorMittal / Bekaert
  const isBelgoParsed = p.includes('belgo') || p.includes('bekaert') || p.includes('arcelor');
  const isBelgoSelected = s.includes('belgo') || s.includes('bekaert') || s.includes('arcelor');
  if (isBelgoParsed && isBelgoSelected) return true;

  // Morlan
  const isMorlanParsed = p.includes('morlan');
  const isMorlanSelected = s.includes('morlan');
  if (isMorlanParsed && isMorlanSelected) return true;

  // Gerdau
  const isGerdauParsed = p.includes('gerdau');
  const isGerdauSelected = s.includes('gerdau');
  if (isGerdauParsed && isGerdauSelected) return true;

  // If parsed supplier is unknown or generic, allow matching by default
  if (p === 'unknown' || !p) return true;

  return false;
};

export const isCoilMatch = (dbNum: string, scanned: string): boolean => {
  if (!dbNum || !scanned) return false;

  const cleanDb = dbNum.trim().toLowerCase().replace(/\s+/g, '');
  const cleanScanned = scanned.trim().toLowerCase().replace(/\s+/g, '');

  if (cleanDb === cleanScanned) return true;

  // 1. Direct Substring Checks (both ways, if length >= 6)
  if (cleanDb.length >= 6 && cleanScanned.includes(cleanDb)) return true;
  if (cleanScanned.length >= 6 && cleanDb.includes(cleanScanned)) return true;

  // 2. GD Code Check for Morlan (Unique IDs)
  // Handles GD followed by 10 to 35 digits (e.g. GD03040000211162 or GD0304000021116200950003500006)
  const gdRegex = /gd(\d{10,35})/i;
  const dbGd = cleanDb.match(gdRegex);
  const scannedGd = cleanScanned.match(gdRegex);
  if (dbGd && scannedGd) {
    if (dbGd[1] === scannedGd[1]) return true;
    // Core unique serial in Morlan barcodes is the first 14 digits after GD (e.g. 03040000211162)
    const dbCore = dbGd[1].substring(0, 14);
    const scannedCore = scannedGd[1].substring(0, 14);
    if (dbCore.length >= 10 && scannedCore.length >= 10 && dbCore === scannedCore) {
      return true;
    }
    if (dbGd[1].includes(scannedGd[1]) || scannedGd[1].includes(dbGd[1])) {
      return true;
    }
  }

  // 3. Extract all numeric sequences of length >= 5
  const getNumSegments = (s: string) => {
    return s.match(/\d{5,35}/g) || [];
  };

  const dbSegs = getNumSegments(cleanDb);
  const scannedSegs = getNumSegments(cleanScanned);

  // If we have numeric segments in both, perform safe segment matching
  if (dbSegs.length > 0 && scannedSegs.length > 0) {
    // Check if any major segment of length >= 8 is shared
    const longDbSegs = dbSegs.filter(seg => seg.length >= 8);
    for (const seg of longDbSegs) {
      if (cleanScanned.includes(seg)) return true;
    }

    const longScannedSegs = scannedSegs.filter(seg => seg.length >= 8);
    for (const seg of longScannedSegs) {
      if (cleanDb.includes(seg)) return true;
    }
  }

  return false;
};

export const parseWireQRCode = (
  rawData: string,
  context?: { defaultDiameter?: number; preferredSupplier?: string }
): ParsedWireCoil | null => {
  if (!rawData) return null;

  // Remove control characters, trim and preserve line breaks for structured parsing
  const cleanData = rawData.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, ' ').trim();
  if (!cleanData) return null;

  const dataUpper = cleanData.toUpperCase();

  // ----------------------------------------------------
  // 1. Morlan Logic (GD Codes or '0002...' material sequence)
  // ----------------------------------------------------
  if (dataUpper.startsWith('0002')) {
    const bitolaCode = dataUpper.substring(0, 7);
    let diameter = 2.30;
    if (bitolaCode === '0002882') diameter = 2.30;
    else if (bitolaCode === '0002274') diameter = 3.00;
    else if (bitolaCode === '0002273') diameter = 2.18;
    else if (bitolaCode === '0002280') diameter = 2.30;
    else if (context?.defaultDiameter) diameter = context.defaultDiameter;

    const gdMatch = dataUpper.match(/GD([0-9]{14})/);
    const coilNumber = gdMatch ? gdMatch[0] : cleanData.trim().replace(/\s+/g, ' ');

    let weight = 0;
    if (gdMatch) {
      const gdIndex = dataUpper.indexOf(gdMatch[0]);
      const potentialWeightStr = dataUpper.substring(gdIndex + 16, gdIndex + 22);
      if (/^[0-9]{6}$/.test(potentialWeightStr)) {
        weight = parseInt(potentialWeightStr, 10) / 10;
      }
    }

    if (weight === 0) {
      const allNumbersMatch = dataUpper.match(/([0-9]{5,6})/g);
      if (allNumbersMatch) {
        for (const m of allNumbersMatch) {
          const val = parseInt(m, 10) / 10;
          if (val >= 100 && val < 2500) {
            weight = val;
            break;
          }
        }
      }
    }

    return {
      coilNumber,
      diameter,
      weight: weight || 1000,
      supplier: 'Morlan'
    };
  }

  // Direct GD code (e.g. GD03040000154890)
  if (dataUpper.startsWith('GD') || /GD\d{10,20}/i.test(dataUpper)) {
    const gdMatch = dataUpper.match(/GD([0-9]{14})/);
    const coilNumber = gdMatch ? gdMatch[0] : dataUpper;
    
    let diameter = context?.defaultDiameter || 2.30;
    const diaMatch = dataUpper.match(/\b([1-4][,\.]\d{2})\b/);
    if (diaMatch) {
      diameter = parseFloat(diaMatch[1].replace(',', '.'));
    }

    let weight = 1000;
    const allNumbersMatch = dataUpper.match(/([0-9]{3,4})/g);
    if (allNumbersMatch) {
      for (const m of allNumbersMatch) {
        const val = parseFloat(m);
        if (val >= 100 && val <= 2500) {
          weight = val;
          break;
        }
      }
    }

    return {
      coilNumber,
      diameter,
      weight,
      supplier: 'Morlan'
    };
  }

  // ----------------------------------------------------
  // 2. Structured Key-Value Label Parsing (Belgo / ArcelorMittal)
  // Example:
  // BOBINA: 1060259863
  // BITOLA: 3,00 MM
  // PESO: 1620 KG
  // LOTE: 837804
  // ----------------------------------------------------
  const hasKeywords = /BITOLA|DIAMETRO|PESO|BOBINA|CORRIDA|BELGO|BEKAERT|ARCELOR|LOTE/i.test(dataUpper);
  if (hasKeywords) {
    let parsedId = '';
    let parsedDiameter = 0;
    let parsedWeight = 0;
    let parsedLot = '';

    // ID / Bobina extraction
    const idMatch = dataUpper.match(/(?:BOBINA|ID|COD(?:IGO)?|SERIE|SERIAL|N[ºO]|NR)[\s:=#-]+([A-Z0-9\-_]{6,25})/i);
    if (idMatch) {
      parsedId = idMatch[1].trim();
    }

    // Diameter extraction (e.g. BITOLA: 3,00 or BIT: 2.18 or DIAMETRO: 3.00MM)
    const diaMatch = dataUpper.match(/(?:BITOLA|DI[AÂ]METRO|BIT|GAUGE|ESPESSURA)[\s:=#-]+([1-4][,\.]\d{1,2})/i);
    if (diaMatch) {
      parsedDiameter = parseFloat(diaMatch[1].replace(',', '.'));
    }

    // Weight extraction (e.g. PESO: 1620 or PESO LIQ: 1004.5 or 1620 KG)
    const weightMatch = dataUpper.match(/(?:PESO|PESO\s*L[IÍ]Q(?:UIDO)?|MASSA|WEIGHT)[\s:=#-]+([0-9]{3,5}(?:[,\.][0-9]{1,2})?)/i);
    if (weightMatch) {
      parsedWeight = parseFloat(weightMatch[1].replace(',', '.'));
    }

    // Lot / Corrida
    const lotMatch = dataUpper.match(/(?:LOTE|CORRIDA|BATCH)[\s:=#-]+([A-Z0-9\-_]{4,20})/i);
    if (lotMatch) {
      parsedLot = lotMatch[1].trim();
    }

    if (parsedId) {
      return {
        coilNumber: parsedId,
        diameter: parsedDiameter || context?.defaultDiameter || 3.00,
        weight: parsedWeight || 1000,
        supplier: 'Belgo',
        lotNumber: parsedLot,
        isPartialScan: !parsedDiameter || !parsedWeight
      };
    }
  }

  // ----------------------------------------------------
  // 3. Multi-token Delimited Belgo Parsing
  // Handles:
  // - Space separated:   "1060259863 3,00 1620"
  // - Semicolon:         "1060259863;3,00;1620" or "1060259863;837804;3.00;1620"
  // - Pipe / Slash:      "1060259863|3.00|1620" or "1060259863/3.00/1620"
  // - Line breaks:       "1060259863\n3,00\n1620"
  // ----------------------------------------------------
  const tokens = cleanData
    .split(/[;\t\n\r|/]+|\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  if (tokens.length >= 2) {
    let coilNumber = '';
    let diameter = 0;
    let weight = 0;
    let lotNumber = '';

    // A) First, detect standard Belgo 3-field format in order: [ID] [Bitola] [Peso]
    const token0IsId = /^[A-Z0-9\-_]{6,25}$/i.test(tokens[0]);
    const token1IsDia = /^[1-4][,\.]\d{1,2}$/.test(tokens[1]);
    const token2IsWeight = tokens[2] && /^[0-9]{3,5}(?:[,\.][0-9]{1,2})?$/.test(tokens[2]);

    if (token0IsId && token1IsDia && token2IsWeight) {
      coilNumber = tokens[0];
      diameter = parseFloat(tokens[1].replace(',', '.'));
      weight = parseFloat(tokens[2].replace(',', '.'));
      if (tokens[3]) lotNumber = tokens[3];

      return {
        coilNumber,
        diameter,
        weight,
        supplier: 'Belgo',
        lotNumber
      };
    }

    // B) If not in strict order, find by semantic matching across all tokens
    // 1. Find diameter token (e.g. 2.18, 2.30, 3.00, 3.20, 2,80)
    for (const t of tokens) {
      if (/^[1-4][,\.]\d{1,2}$/.test(t)) {
        const d = parseFloat(t.replace(',', '.'));
        if (d >= 1.5 && d <= 5.0) {
          diameter = d;
          break;
        }
      }
    }

    // 2. Find weight token (typically 300kg to 2500kg)
    for (const t of tokens) {
      if (/^[0-9]{3,5}(?:[,\.][0-9]{1,2})?$/.test(t)) {
        const w = parseFloat(t.replace(',', '.'));
        if (w >= 300 && w <= 3000) {
          weight = w;
          break;
        }
      }
    }

    // 3. Find coilNumber token (longest identifier >= 6 chars, or matching Belgo pattern e.g. 1060...)
    const candidateIds = tokens.filter(t => {
      // Must not be the diameter or weight
      const isDia = diameter && (t === diameter.toString() || t === diameter.toFixed(2) || t === diameter.toFixed(2).replace('.', ','));
      const isW = weight && (t === weight.toString() || t === Math.round(weight).toString());
      const isBrand = /^(BELGO|BEKAERT|ARCELORMITTAL|ARAME|BBA|OK)$/i.test(t);
      return !isDia && !isW && !isBrand && t.length >= 5;
    });

    // Prefer token starting with '1060' or longest numeric/alphanumeric code
    const belgoPrefixed = candidateIds.find(t => t.startsWith('1060') || t.startsWith('0002'));
    coilNumber = belgoPrefixed || candidateIds[0] || '';

    if (coilNumber) {
      return {
        coilNumber,
        diameter: diameter || context?.defaultDiameter || 3.00,
        weight: weight || 1000,
        supplier: 'Belgo',
        isPartialScan: !diameter || !weight
      };
    }
  }

  // ----------------------------------------------------
  // 4. Single-Token or Direct Barcode Scans
  // Often on Belgo coils, the 2D DataMatrix or 1D Barcode contains
  // ONLY the unique coil code: e.g. "1060259863" or "1060259863-1"
  // ----------------------------------------------------
  const singleCandidate = cleanData.replace(/^(ID|BOBINA|NR)[\s:=#]+/i, '').trim();
  if (/^[A-Z0-9\-_]{6,25}$/i.test(singleCandidate)) {
    // If it starts with 1060 or is a standard 8-15 digit coil identifier
    const isLikelyBelgo = singleCandidate.startsWith('1060') || singleCandidate.length >= 8;
    return {
      coilNumber: singleCandidate,
      diameter: context?.defaultDiameter || 3.00,
      weight: 1000,
      supplier: isLikelyBelgo ? 'Belgo' : 'Unknown',
      isPartialScan: true
    };
  }

  return null;
};

