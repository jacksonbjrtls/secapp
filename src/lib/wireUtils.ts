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

  // Check if one is a substring of the other (with a minimum safe length)
  if (cleanDb.includes(cleanScanned) || cleanScanned.includes(cleanDb)) {
    const shorterLen = Math.min(cleanDb.length, cleanScanned.length);
    if (shorterLen >= 6) {
      return true;
    }
  }

  // Look for GD matches (Morlan unique IDs)
  // Example: GD03040000125487
  const gdRegex = /gd(\d{8,20})/;
  const dbGd = cleanDb.match(gdRegex);
  const scannedGd = cleanScanned.match(gdRegex);
  if (dbGd && scannedGd && dbGd[1] === scannedGd[1]) {
    return true;
  }

  // Look for any long sequence of digits (8 or more) found in both
  // E.g. "1060259863" in "1060259863 2,18 1620" vs "1060259863"
  const digitsRegex = /\d{8,20}/g;
  const dbDigits = cleanDb.match(digitsRegex) || [];
  const scannedDigits = cleanScanned.match(digitsRegex) || [];

  for (const dbDig of dbDigits) {
    if (cleanScanned.includes(dbDig)) return true;
  }
  for (const scDig of scannedDigits) {
    if (cleanDb.includes(scDig)) return true;
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
