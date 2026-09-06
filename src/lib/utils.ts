import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts Excel serial date code (e.g. 46230 -> 2026-07-27) to a JavaScript Date.
 * Excel day 1 is 1900-01-01, Unix epoch is 1970-01-01 (serial 25569).
 */
export function excelSerialToDate(serial: number): Date {
  const utc_days = Math.floor(serial - 25569);
  const d = new Date(utc_days * 86400 * 1000);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function safeToDate(timestamp: any): Date | null {
  if (!timestamp && timestamp !== 0) return null;
  if (timestamp instanceof Date) {
    if (isNaN(timestamp.getTime())) return null;
    const y = timestamp.getFullYear();
    if (y >= 20000 && y <= 80000) {
      return excelSerialToDate(y);
    }
    return timestamp;
  }
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (typeof timestamp.seconds === 'number') {
    return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
  }
  // Number that could be an Excel serial date (e.g. 46230)
  if (typeof timestamp === 'number') {
    if (timestamp >= 20000 && timestamp <= 80000) {
      return excelSerialToDate(timestamp);
    }
    return new Date(timestamp);
  }
  if (typeof timestamp === 'string') {
    const trimmed = timestamp.trim();
    if (!trimmed) return null;

    // Numeric string representing Excel serial (e.g. "46230")
    if (/^\d{5}$/.test(trimmed)) {
      const num = Number(trimmed);
      if (num >= 20000 && num <= 80000) {
        return excelSerialToDate(num);
      }
    }

    // YYYY-MM-DD or YYYY/MM/DD (check if year is an Excel serial code like 46230-01-01)
    if (/^(\d{4,6})[-\/](\d{1,2})[-\/](\d{1,2})$/.test(trimmed)) {
      const match = trimmed.match(/^(\d{4,6})[-\/](\d{1,2})[-\/](\d{1,2})$/)!;
      const yNum = Number(match[1]);
      if (yNum >= 20000 && yNum <= 80000) {
        return excelSerialToDate(yNum);
      }
      return new Date(yNum, Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
    }

    // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (check if year is an Excel serial code like 01/01/46230)
    if (/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4,6})$/.test(trimmed)) {
      const match = trimmed.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4,6})$/)!;
      const yNum = Number(match[3]);
      if (yNum >= 20000 && yNum <= 80000) {
        return excelSerialToDate(yNum);
      }
      return new Date(yNum, Number(match[2]) - 1, Number(match[1]), 12, 0, 0);
    }
  }
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return null;
  const yr = d.getFullYear();
  if (yr >= 20000 && yr <= 80000) {
    return excelSerialToDate(yr);
  }
  return d;
}

/**
 * Default Brazilian industrial timezone (Brasília standard time)
 */
export const BRAZIL_TIMEZONE = 'America/Sao_Paulo';

/**
 * Resolves local browser timezone, falling back to America/Sao_Paulo if running in UTC/server container
 */
export function getLocalTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== 'UTC' && tz !== 'Etc/UTC') {
      return tz;
    }
  } catch {}
  return BRAZIL_TIMEZONE;
}

/**
 * Returns YYYY-MM-DD string in local Brazilian timezone (America/Sao_Paulo)
 */
export function getLocalDateStrBR(dateInput: any): string {
  if (!dateInput && dateInput !== 0) return '';

  // Handle direct numeric Excel serial (e.g. 46230)
  if (typeof dateInput === 'number' && dateInput >= 20000 && dateInput <= 80000) {
    const d = excelSerialToDate(dateInput);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return '';

    // Handle numeric string Excel serial (e.g. "46230")
    if (/^\d{5}$/.test(trimmed)) {
      const num = Number(trimmed);
      if (num >= 20000 && num <= 80000) {
        const d = excelSerialToDate(num);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }

    // If YYYY-M-D or YYYY/M/D (with possible Excel serial year)
    if (/^(\d{4,6})[-\/](\d{1,2})[-\/](\d{1,2})$/.test(trimmed)) {
      const match = trimmed.match(/^(\d{4,6})[-\/](\d{1,2})[-\/](\d{1,2})$/)!;
      const yNum = Number(match[1]);
      if (yNum >= 20000 && yNum <= 80000) {
        const d = excelSerialToDate(yNum);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }

    // If DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (with possible Excel serial year, e.g. 01/01/46230)
    if (/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4,6})$/.test(trimmed)) {
      const match = trimmed.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4,6})$/)!;
      const yNum = Number(match[3]);
      if (yNum >= 20000 && yNum <= 80000) {
        const d = excelSerialToDate(yNum);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
  }

  const d = safeToDate(dateInput);
  if (!d || isNaN(d.getTime())) return '';
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: getLocalTimeZone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  } catch {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Formats a date to Brazilian local date string: DD/MM/AAAA in local timezone
 */
export function formatLocalDateBR(dateInput: any): string {
  if (!dateInput && dateInput !== 0) return '';
  const dateStr = getLocalDateStrBR(dateInput);
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  const d = safeToDate(dateInput);
  if (!d || isNaN(d.getTime())) return typeof dateInput === 'string' ? dateInput : '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: getLocalTimeZone(),
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d);
  } catch {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
}

/**
 * Formats a time to Brazilian local time string: HH:MM in local timezone
 */
export function formatLocalTimeBR(dateInput: any): string {
  const d = safeToDate(dateInput);
  if (!d || isNaN(d.getTime())) return '--:--';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: getLocalTimeZone(),
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  } catch {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}

/**
 * Formats full datetime in Brazilian local time: DD/MM/AAAA às HH:MM or DD/MM/AAAA HH:MM
 */
export function formatLocalDateTimeBR(dateInput: any, separator = ' '): string {
  const d = safeToDate(dateInput);
  if (!d || isNaN(d.getTime())) return '';
  const dateStr = formatLocalDateBR(d);
  const timeStr = formatLocalTimeBR(d);
  if (!dateStr) return '';
  return `${dateStr}${separator}${timeStr}`;
}

/**
 * Formats any date / timestamp / string to Brazilian standard format: DD/MM/AAAA
 */
export function formatDateBR(dateInput: any, includeTime = false): string {
  if (!dateInput) return '';

  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-');
      return `${day}/${month}/${year}`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed;
    }
  }

  const d = safeToDate(dateInput);
  if (!d || isNaN(d.getTime())) return '';

  if (includeTime) {
    return formatLocalDateTimeBR(d, ' às ');
  }

  return formatLocalDateBR(d);
}

/**
 * Formats date to DD-MM-AAAA format (e.g. 15-08-2026)
 */
export function formatDateDDMMAAAA(dateInput: any): string {
  if (!dateInput) return '';
  const d = safeToDate(dateInput);
  if (!d || isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}
