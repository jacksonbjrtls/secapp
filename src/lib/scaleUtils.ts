
/**
 * Scale Utility for Shift Rotation
 * Based on the 35-day cycle provided in the "ESCALA DE TURNO - 2026"
 */

export type Shift = 'Turno 1' | 'Turno 2' | 'Turno 3';
export type Group = 'A' | 'B' | 'C' | 'D' | 'E';

const ANCHOR_DATE = new Date('2026-01-01T00:00:00');

// Sequences derived from the 2026 calendar image (35-day cycle)
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
 * Calculates which group is assigned to a specific shift on a specific date.
 */
export function getGroupForShift(date: Date, shift: Shift): Group {
  // Calculate days difference from anchor
  const diffTime = date.getTime() - ANCHOR_DATE.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // Since the cycle is 35 days, use modulo
  // Handle negative difference if user checks date before anchor (unlikely but safe)
  let dayInCycle = diffDays % 35;
  if (dayInCycle < 0) dayInCycle += 35;
  
  return SEQUENCES[shift][dayInCycle];
}

/**
 * Determines the current shift based on the time of day.
 */
export function getCurrentShift(): Shift {
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 8) return 'Turno 1';
  if (hour >= 8 && hour < 16) return 'Turno 2';
  return 'Turno 3';
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
