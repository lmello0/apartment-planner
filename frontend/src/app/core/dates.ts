import { IsoDate } from './models';

/**
 * Calendar-date helpers that work on ISO "YYYY-MM-DD" strings in UTC so a date never
 * shifts a day because of the browser's timezone.
 */

export function parseIso(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Today in the user's local calendar, as ISO. */
export function localTodayIso(now = new Date()): IsoDate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Adds months keeping the day of month, clamped to the month's last day. */
export function addMonths(iso: IsoDate, months: number, dayOfMonth?: number): IsoDate {
  const d = parseIso(iso);
  const day = dayOfMonth ?? d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return toIso(target);
}

export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);
}

export function monthKey(iso: IsoDate): string {
  return iso.slice(0, 7);
}

export function monthsBetween(fromMonth: string, toMonth: string): number {
  const [fy, fm] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function nextMonthKey(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Converts a Date coming from a date-picker (local midnight) into ISO. */
export function pickerToIso(date: Date | null | undefined): IsoDate | null {
  return date ? localTodayIso(date) : null;
}

/** Converts ISO into a local Date for date-pickers. */
export function isoToPicker(iso: IsoDate | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`;
}
