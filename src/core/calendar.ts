/**
 * Days as the game names them ('2026-10-24'), with pure calendar arithmetic: the app reads the
 * phone's date, and the core only ever sees these strings.
 */
import type { Size } from './grid';

/** Days since 1970-01-01 for a 'YYYY-MM-DD' day, by the civil calendar. */
export function dayNumber(day: string): number {
  const [y0, m, d] = day.split('-').map(Number) as [number, number, number];
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The day a day number names. */
export function dayOf(n: number): string {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The Monday of a day's week: the name of its Weekly Garden. */
export function mondayOf(day: string): string {
  const n = dayNumber(day);
  // 1970-01-01 was a Thursday, three days after a Monday.
  return dayOf(n - ((n + 3) % 7));
}

/**
 * The name a Daily Garden goes by in saves and best scores: the day for 6×6, as it always was,
 * and the day and size for the others.
 */
export const dailyKey = (day: string, size: Size): string => (size === 6 ? day : `${day}/${size}`);
export function dailyParts(key: string): { day: string; size: Size } {
  const [day, size] = key.split('/');
  return { day: day!, size: (Number(size) || 6) as Size };
}
