/**
 * Universal POS — Frontend Universal Service Duration Helpers.
 */

export type DurationUnitType = 'fixed_time' | 'calendar_period' | 'commercial_count';

export interface DurationSemantics {
  unitType: DurationUnitType;
  fixedMinutes?: number;
  calendarMonths?: number;
  defaultAllowFraction?: boolean;
}

export const DURATION_SEMANTICS_REGISTRY: Record<string, DurationSemantics> = {
  // Fixed physical durations
  min: { unitType: 'fixed_time', fixedMinutes: 1, defaultAllowFraction: true },
  minute: { unitType: 'fixed_time', fixedMinutes: 1, defaultAllowFraction: true },
  minutes: { unitType: 'fixed_time', fixedMinutes: 1, defaultAllowFraction: true },
  hour: { unitType: 'fixed_time', fixedMinutes: 60, defaultAllowFraction: true },
  hours: { unitType: 'fixed_time', fixedMinutes: 60, defaultAllowFraction: true },
  hr: { unitType: 'fixed_time', fixedMinutes: 60, defaultAllowFraction: true },
  day: { unitType: 'fixed_time', fixedMinutes: 1440, defaultAllowFraction: true },
  days: { unitType: 'fixed_time', fixedMinutes: 1440, defaultAllowFraction: true },
  week: { unitType: 'fixed_time', fixedMinutes: 10080, defaultAllowFraction: false },
  weeks: { unitType: 'fixed_time', fixedMinutes: 10080, defaultAllowFraction: false },

  // Calendar periods
  month: { unitType: 'calendar_period', calendarMonths: 1, defaultAllowFraction: false },
  months: { unitType: 'calendar_period', calendarMonths: 1, defaultAllowFraction: false },
  mo: { unitType: 'calendar_period', calendarMonths: 1, defaultAllowFraction: false },
  quarter: { unitType: 'calendar_period', calendarMonths: 3, defaultAllowFraction: false },
  quarters: { unitType: 'calendar_period', calendarMonths: 3, defaultAllowFraction: false },
  qtr: { unitType: 'calendar_period', calendarMonths: 3, defaultAllowFraction: false },
  year: { unitType: 'calendar_period', calendarMonths: 12, defaultAllowFraction: false },
  years: { unitType: 'calendar_period', calendarMonths: 12, defaultAllowFraction: false },
  yr: { unitType: 'calendar_period', calendarMonths: 12, defaultAllowFraction: false },

  // Commercial / Session count units
  session: { unitType: 'commercial_count', defaultAllowFraction: false },
  sessions: { unitType: 'commercial_count', defaultAllowFraction: false },
  visit: { unitType: 'commercial_count', defaultAllowFraction: false },
  visits: { unitType: 'commercial_count', defaultAllowFraction: false },
  service: { unitType: 'commercial_count', defaultAllowFraction: false },
  services: { unitType: 'commercial_count', defaultAllowFraction: false },
  pcs: { unitType: 'commercial_count', defaultAllowFraction: false },
};

export function resolveDurationSemantics(unitCode?: string): DurationSemantics {
  const code = (unitCode ?? '').trim().toLowerCase();
  if (code && DURATION_SEMANTICS_REGISTRY[code]) {
    return DURATION_SEMANTICS_REGISTRY[code];
  }
  return {
    unitType: 'commercial_count',
    defaultAllowFraction: false,
  };
}

export function formatDurationLabel(qty: number, unitCode?: string): string {
  if (!unitCode) return `${qty}`;
  const code = unitCode.trim();
  if (qty === 1) return `1 ${code}`;
  if (code.endsWith('s')) return `${qty} ${code}`;
  return `${qty} ${code}s`;
}
