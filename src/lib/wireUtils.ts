export interface ParsedWireCoil {
  coilNumber: string;
  diameter: number;
  weight: number;
  supplier: 'Belgo' | 'Morlan' | 'Unknown';
}

export const isCoilMatch = (dbNum: string, scanned: string): boolean => {
  if (!dbNum || !scanned) return false;

  const cleanDb = dbNum.trim().toLowerCase().replace(/\s+/g, '');
  const cleanScanned = scanned.trim().toLowerCase().replace(/\s+/g, '');

  if (cleanDb === cleanScanned) return true;

  // Extract all numeric sequences of length >= 5
  const getNumSegments = (s: string) => {
    return s.match(/\d{5,35}/g) || [];
  };

  const dbSegs = getNumSegments(cleanDb);
  const scannedSegs = getNumSegments(cleanScanned);

  // If we have numeric segments in both, perform safe segment matching
  if (dbSegs.length > 0 && scannedSegs.length > 0) {
    // 1. Find the primary long identifier segment, if any (usually length >= 8, e.g. "0002273002394374" or "1060259863")
    const longDbSeg = dbSegs.find(seg => seg.length >= 8);
    const longScannedSeg = scannedSegs.find(seg => seg.length >= 8);
    
    if (longDbSeg && cleanScanned.includes(longDbSeg)) {
      // They share the main catalog/lot/serial code!
      // To prevent false matching across different items in the same lot, 
      // check if the DB item has a secondary segment (like a 5 or 6 digit corrida: e.g. "837804")
      const testSegs = dbSegs.filter(seg => seg !== longDbSeg && seg.length >= 5);
      if (testSegs.length > 0) {
        // True match only if the scanned code ALSO contains these secondary segments
        const allTestPassed = testSegs.every(tSeg => cleanScanned.includes(tSeg));
        if (allTestPassed) return true;
      } else {
        // DB code was generic (had no secondary part).
        return true;
      }
    }
  }

  // Fallback substring check with a safety length threshold of 8 characters
  if (cleanDb.includes(cleanScanned) && cleanScanned.length >= 8) return true;
  if (cleanScanned.includes(cleanDb) && cleanDb.length >= 8) return true;

  // GD code check for Morlan (Unique IDs)
  // Example: GD03040000125487
  const gdRegex = /gd(\d{10,20})/;
  const dbGd = cleanDb.match(gdRegex);
  const scannedGd = cleanScanned.match(gdRegex);
  if (dbGd && scannedGd && dbGd[1] === scannedGd[1]) {
    return true;
  }

  return false;
};

export const parseWireQRCode = (data: string): ParsedWireCoil | null => {
  if (!data) return null;

  // Morlan logic
  // Example: 0002882001706427      L396501  GD03040000125487009650000027000
  // 0002882 -> 2,30
  // 0002274 -> 3,00
  // 0002273 -> 2,18
  // 0002280 -> 2,30
  // Weight sequence: 009650 -> 965 kg
  // Unique ID: GD03040000125487
  
  if (data.startsWith('0002')) {
    const bitolaCode = data.substring(0, 7);
    let diameter = 0;
    if (bitolaCode === '0002882') diameter = 2.30;
    else if (bitolaCode === '0002274') diameter = 3.00;
    else if (bitolaCode === '0002273') diameter = 2.18;
    else if (bitolaCode === '0002280') diameter = 2.30;

    // The unique ID is typically in the middle. Let's try to find the GD sequence
    const gdMatch = data.match(/GD([0-9]{14})/);
    // If gdMatch is null, we do NOT use random dynamic fallback MOR-Date.now().
    // Instead we clean and use the input string deterministically!
    const coilNumber = gdMatch ? gdMatch[0] : data.trim().replace(/\s+/g, ' ');

    let weight = 0;
    if (gdMatch) {
      // Based on the example: GD03040000125487009650000027000
      // Weight (009650) starts 16 characters after 'GD' starts
      const gdIndex = data.indexOf(gdMatch[0]);
      const potentialWeightStr = data.substring(gdIndex + 16, gdIndex + 22);
      if (/^[0-9]{6}$/.test(potentialWeightStr)) {
        weight = parseInt(potentialWeightStr, 10) / 10;
      }
    }

    if (weight === 0) {
      // Fallback: search for 6 digits that look like a weight
      const allNumbersMatch = data.match(/([0-9]{5,6})/g);
      if (allNumbersMatch) {
        // Find one that is likely weight (between 100 and 2000)
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
      weight,
      supplier: 'Morlan'
    };
  }

  // Belgo logic
  // Example: 1060259863 2,18 1620
  // [UniqueID] [Bitola] [Weight]
  const belgoParts = data.trim().split(/\s+/);
  if (belgoParts.length >= 3) {
    const coilNumber = belgoParts[0];
    const diameter = parseFloat(belgoParts[1].replace(',', '.'));
    const weight = parseFloat(belgoParts[2].replace(',', '.'));

    if (!isNaN(diameter) && !isNaN(weight)) {
      return {
        coilNumber,
        diameter,
        weight,
        supplier: 'Belgo'
      };
    }
  }

  return null;
};
