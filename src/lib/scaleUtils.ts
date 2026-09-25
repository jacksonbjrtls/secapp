/**
 * Scale Utility for Shift Rotation
 * Based on the 35-day continuous cycle provided in the "ESCALA DE TURNO - 2026"
 * Plant location timezone: America/Cuiaba (Horário de Cuiabá - AMT / UTC-4)
 */

export type Shift = 'Turno 1' | 'Turno 2' | 'Turno 3';
export type Group = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * Anchor date: 2026-01-01 UTC.
 * Pure UTC date arithmetic guarantees exact 35-day rotation with no daylight savings or timezone drift.
 * - 2026-01-01 (day 0, cycle 0): Turno 1 = 'B', Turno 2 = 'A', Turno 3 = 'C'
 * - 2026-09-25 (day 267, cycle 22): Turno 1 = 'A', Turno 2 = 'E', Turno 3 = 'C', Folgas = 'B', 'D'
 */
const ANCHOR_UTC = Date.UTC(2026, 0, 1);

// Sequences derived from the 2026 calendar (35-day continuous industrial rotation)
const SEQUENCES: Record<Shift, Group[]> = {
  'Turno 1': [ // 00 às 08 h
    'B', 'B', 'C', 'C', 'C', 'D', 'D', 'E', 'E', 'A', 'A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'D', 'E', 'E', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'D', 'D', 'E', 'E', 'E', 'A', 'A'
  ],
  'Turno 2': [ // 08 às 16 h
    'A', 'A', 'B', 'B', 'B', 'C', 'C', 'D', 'D', 'E', 'E', 'E', 'A', 'A', 'B', 'B', 'C', 'C', 'C', 'D', 'D', 'E', 'E', 'A', 'A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'D', 'E', 'E'
  ],
  'Turno 3': [ // 16 às 24 h
    'C', 'D', 'D', 'D', 'E', 'E', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'D', 'D', 'E', 'E', 'E', 'A', 'A', 'B', 'B', 'C', 'C', 'C', 'D', 'D', 'E', 'E', 'A', 'A', 'A', 'B', 'B', 'C'
  ]
};

/**
 * Extracts calendar { year, month, day } safe from timezone shifting.
 * For local calendar dates (midnight: new Date(year, month, day)), keeps local parts.
 * For live timestamps or ISO dates, resolves in Cuiabá operational timezone (America/Cuiaba).
 */
export function getCalendarParts(date: Date): { year: number; month: number; day: number } {
  if (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  ) {
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate()
    };
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Cuiaba',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.format(date).split('-');
    if (parts.length === 3) {
      return {
        year: parseInt(parts[0], 10),
        month: parseInt(parts[1], 10) - 1, // 0-indexed month
        day: parseInt(parts[2], 10)
      };
    }
  } catch {}

  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate()
  };
}

/**
 * Returns current hour (0-23) in Cuiabá operational timezone (America/Cuiaba).
 */
export function getOperationalHour(date: Date = new Date()): number {
  try {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Cuiaba',
      hour: 'numeric',
      hour12: false
    });
    const parsed = parseInt(formatter.format(date), 10);
    return isNaN(parsed) ? date.getHours() : (parsed % 24);
  } catch {
    return date.getHours();
  }
}

/**
 * Calculates which group is assigned to a specific shift on a specific calendar date.
 */
export function getGroupForShift(date: Date, shift: Shift): Group {
  const { year, month, day } = getCalendarParts(date);
  const targetUtc = Date.UTC(year, month, day);
  const diffDays = Math.round((targetUtc - ANCHOR_UTC) / (24 * 3600 * 1000));

  let dayInCycle = diffDays % 35;
  if (dayInCycle < 0) dayInCycle += 35;

  return SEQUENCES[shift][dayInCycle];
}

/**
 * Determines the current operational shift based on Brazilian plant time.
 * - Turno 1: 00:00 às 08:00
 * - Turno 2: 08:00 às 16:00
 * - Turno 3: 16:00 às 24:00
 */
export function getCurrentShift(date: Date = new Date()): Shift {
  const hour = getOperationalHour(date);
  if (hour >= 0 && hour < 8) return 'Turno 1';
  if (hour >= 8 && hour < 16) return 'Turno 2';
  return 'Turno 3';
}

/**
 * Returns the operational shift time range (start/end) for a given date and shift.
 */
export function getShiftTimeRange(date: Date, shift: Shift): { start: Date; end: Date } {
  const { year, month, day } = getCalendarParts(date);

  if (shift === 'Turno 1') {
    // 00:00:00 to 08:00:00
    const start = new Date(year, month, day, 0, 0, 0, 0);
    const end = new Date(year, month, day, 8, 0, 0, 0);
    return { start, end };
  } else if (shift === 'Turno 2') {
    // 08:00:00 to 16:00:00
    const start = new Date(year, month, day, 8, 0, 0, 0);
    const end = new Date(year, month, day, 16, 0, 0, 0);
    return { start, end };
  } else {
    // Turno 3: 16:00:00 to 23:59:59
    const start = new Date(year, month, day, 16, 0, 0, 0);
    const end = new Date(year, month, day, 23, 59, 59, 999);
    return { start, end };
  }
}

/**
 * Checks if the current time is strictly within the designated shift and date of the session.
 */
export function isWithinShiftWindow(sessionDate: Date, shift: Shift, currentDate: Date = new Date()): boolean {
  const curParts = getCalendarParts(currentDate);
  const sessParts = getCalendarParts(sessionDate);

  const isSameDay =
    curParts.year === sessParts.year &&
    curParts.month === sessParts.month &&
    curParts.day === sessParts.day;

  if (!isSameDay) return false;

  const currentShift = getCurrentShift(currentDate);
  return currentShift === shift;
}

/**
 * Gets all duty groups for today across all shifts.
 */
export function getTodayGroups(date: Date = new Date()): Record<Shift, Group> {
  return {
    'Turno 1': getGroupForShift(date, 'Turno 1'),
    'Turno 2': getGroupForShift(date, 'Turno 2'),
    'Turno 3': getGroupForShift(date, 'Turno 3'),
  };
}
