const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('pt-BR');

/** Formata centavos como moeda brasileira (R$ 1.234,56). */
export function formatBRL(
  cents: number,
  opts: { compact?: boolean; signed?: boolean } = {},
): string {
  const value = cents / 100;
  const text =
    opts.compact && Math.abs(value) >= 10_000 ? brlCompact.format(value) : brl.format(value);
  // Normaliza espaço não separável para espaço comum (cópia/CSV mais limpos).
  const clean = text.replace(/[\u00a0\u202f]/g, ' ');
  if (opts.signed && cents > 0) return `+${clean}`;
  return clean;
}

export function formatPercent(ratio: number, decimals = 0): string {
  if (!Number.isFinite(ratio)) return '–';
  return (decimals > 0 ? pct1 : pct).format(ratio);
}

export function formatInt(n: number): string {
  return int.format(n);
}

/**
 * Converte um número no formato brasileiro ("1.234,56", "-12,30", "45,00-")
 * para centavos. Retorna null se o texto não for um valor.
 */
export function parseBRLToCents(text: string): number | null {
  const m =
    /(-|−|–)?\s*(?:R\$|US\$|U\$|USD|EUR|€|\$)?\s*(-|−|–)?\s*(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})\s*(-)?/.exec(
      text.trim(),
    );
  if (!m) return null;
  const intPart = (m[3] ?? '0').replace(/\./g, '');
  const cents = Number(intPart) * 100 + Number(m[4]);
  const negative = Boolean(m[1] || m[2] || m[5]);
  return negative ? -cents : cents;
}

/** Soma segura de centavos. */
export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Valor de um lançamento para exibição: saídas "R$ 10,00", entradas/créditos "+R$ 10,00". */
export function formatMovement(amountCents: number): string {
  return amountCents < 0 ? `+${formatBRL(-amountCents)}` : formatBRL(amountCents);
}
