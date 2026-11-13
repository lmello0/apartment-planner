import { DateBrPipe, formatBrl, BrlPipe } from './pipes';

describe('brl pipe', () => {
  const nb = (s: string) => s.replace(/ /g, ' ');
  const pipe = new BrlPipe();

  it('formats decimal strings as BRL', () => {
    expect(nb(pipe.transform('2548.00'))).toBe('R$ 2.548,00');
    expect(nb(pipe.transform('302000.40'))).toBe('R$ 302.000,40');
    expect(nb(pipe.transform('0.05'))).toBe('R$ 0,05');
    expect(nb(pipe.transform('15285.6'))).toBe('R$ 15.285,60');
  });

  it('keeps precision beyond float range', () => {
    expect(nb(formatBrl('9007199254740993.01'))).toBe('R$ 9.007.199.254.740.993,01');
  });

  it('handles negatives and empty values', () => {
    expect(nb(pipe.transform('-10.5'))).toBe('-R$ 10,50');
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform('abc')).toBe('—');
  });
});

describe('dateBr pipe', () => {
  it('formats ISO as dd/mm/aaaa without timezone shifts', () => {
    expect(new DateBrPipe().transform('2026-11-15')).toBe('15/11/2026');
    expect(new DateBrPipe().transform(null)).toBe('—');
  });
});
