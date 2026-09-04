import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeToDate(timestamp: any): Date | null {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (typeof timestamp.seconds === 'number') {
    return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
  }
  if (typeof timestamp === 'string') {
    const trimmed = timestamp.trim();
    // YYYY-MM-DD format (fix timezone shift)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
    // DD/MM/YYYY format
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      const [d, m, y] = trimmed.split('/').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
  }
  const d = new Date(timestamp);
  return isNaN(d.getTime()) ? null : d;
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
    return `${day}/${month}/${year}`;
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
