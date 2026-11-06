import { describe, expect, it } from 'vitest';
import { addMonths, formatYearMonth, inferYear, monthDiff } from './dates';
import { formatBRL, parseBRLToCents } from './money';

describe('inferYear', () => {
  it('usa o ano do vencimento para compras recentes', () => {
    expect(inferYear(5, 1, '2027-01-10')).toBe(2027);
    expect(inferYear(28, 12, '2027-01-10')).toBe(2026);
  });
  it('recua para parcelas antigas', () => {
    expect(inferYear(15, 12, '2026-11-10', 11)).toBe(2025);
    expect(inferYear(15, 9, '2026-11-10', 3)).toBe(2026);
  });
  it('aceita a data da parcela no mês corrente', () => {
    expect(inferYear(5, 11, '2026-11-15', 3)).toBe(2026);
  });
});

describe('meses', () => {
  it('soma e compara meses', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthDiff('2026-10', '2027-01')).toBe(3);
  });
  it('formata', () => {
    expect(formatYearMonth('2026-10')).toBe('out/2026');
    expect(formatYearMonth('2026-03', 'long')).toBe('março de 2026');
  });
});

describe('dinheiro', () => {
  it('converte texto em centavos', () => {
    expect(parseBRLToCents('R$ 1.234,56')).toBe(123456);
    expect(parseBRLToCents('-R$ 12,30')).toBe(-1230);
    expect(parseBRLToCents('45,00-')).toBe(-4500);
    expect(parseBRLToCents('abc')).toBeNull();
  });
  it('formata em reais', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(-990)).toBe('-R$ 9,90');
  });
});
