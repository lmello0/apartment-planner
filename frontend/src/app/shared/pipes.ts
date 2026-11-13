import { Pipe, PipeTransform } from '@angular/core';
import { Money } from '../core/models';
import { toCents } from '../core/money';

/** Formats a decimal-string amount as BRL ("R$ 2.548,00") without going through floats. */
export function formatBrl(value: Money | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  let cents: bigint;
  try {
    cents = toCents(value);
  } catch {
    return '—';
  }
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const int = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}R$ ${int},${frac}`;
}

@Pipe({ name: 'brl' })
export class BrlPipe implements PipeTransform {
  transform(value: Money | null | undefined): string {
    return formatBrl(value);
  }
}

/** ISO "YYYY-MM-DD" -> "dd/mm/aaaa" (string slicing, no timezone shifts). */
export function formatDateBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

@Pipe({ name: 'dateBr' })
export class DateBrPipe implements PipeTransform {
  transform(iso: string | null | undefined): string {
    return formatDateBr(iso);
  }
}
