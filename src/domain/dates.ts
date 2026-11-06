/** Utilitários de data sem dependências. Datas são strings ISO (yyyy-mm-dd). */

const MONTH_TOKENS: Record<string, number> = {
  JAN: 1,
  FEV: 2,
  FEB: 2,
  MAR: 3,
  ABR: 4,
  APR: 4,
  MAI: 5,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  AUG: 8,
  SET: 9,
  SEP: 9,
  OUT: 10,
  OCT: 10,
  NOV: 11,
  DEZ: 12,
  DEC: 12,
};

const MONTH_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];
const MONTH_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function monthFromToken(token: string): number | undefined {
  const key = token
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 3)
    .toUpperCase();
  return MONTH_TOKENS[key];
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

function dayNumber(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Normaliza ano de 2 dígitos (26 -> 2026). */
export function normalizeYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/** 'yyyy-mm' a partir de ano/mês. */
export function yearMonth(y: number, m: number): string {
  return `${y}-${pad2(m)}`;
}

export function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const idx = (y ?? 1970) * 12 + ((m ?? 1) - 1) + delta;
  return yearMonth(Math.floor(idx / 12), (idx % 12) + 1);
}

export function monthDiff(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return ((yb ?? 0) - (ya ?? 0)) * 12 + ((mb ?? 0) - (ma ?? 0));
}

/** "out/2026" ou "outubro de 2026". */
export function formatYearMonth(ym: string, style: 'short' | 'long' = 'short'): string {
  const [y, m] = ym.split('-').map(Number);
  const i = (m ?? 1) - 1;
  return style === 'long' ? `${MONTH_LONG[i]} de ${y}` : `${MONTH_SHORT[i]}/${y}`;
}

/** "out" (rótulo curto para eixos). */
export function formatMonthAxis(ym: string): string {
  const [, m] = ym.split('-').map(Number);
  return MONTH_SHORT[(m ?? 1) - 1] ?? '';
}

/** "12/10/2026". */
export function formatDateBR(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return `${pad2(d)}/${pad2(m)}/${y}`;
}

/** "12/10". */
export function formatDayMonth(iso: string): string {
  const { m, d } = parseISO(iso);
  return `${pad2(d)}/${pad2(m)}`;
}

export function weekday(iso: string): number {
  const { y, m, d } = parseISO(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Faturas costumam trazer só dia/mês. Infere o ano usando a data de
 * vencimento (ou fechamento) como âncora. Em compras parceladas a data
 * mostrada costuma ser a da compra original, então a âncora "esperada"
 * recua (parcela atual - 1) meses; escolhemos o ano que deixa a data mais
 * próxima disso sem passar da âncora.
 */
export function inferYear(
  day: number,
  month: number,
  anchorISO: string,
  installmentCurrent?: number,
): number {
  const anchor = parseISO(anchorISO);
  const anchorDay = dayNumber(anchor.y, anchor.m, anchor.d);
  const back = installmentCurrent && installmentCurrent > 1 ? installmentCurrent - 1 : 0;
  const expectedYM = addMonths(yearMonth(anchor.y, anchor.m), -back);
  const [ey, em] = expectedYM.split('-').map(Number);
  const expectedDay = dayNumber(ey ?? anchor.y, em ?? anchor.m, Math.min(anchor.d, 28));

  let best = anchor.y;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let y = anchor.y + 1; y >= anchor.y - 3; y--) {
    const safeDay = isValidDate(y, month, day) ? day : 28;
    const dn = dayNumber(y, month, safeDay);
    if (dn > anchorDay + 10) continue; // compra não pode ser depois do vencimento
    const dist = Math.abs(dn - expectedDay);
    if (dist < bestDist) {
      bestDist = dist;
      best = y;
    }
  }
  return best;
}

export function todayISO(now = new Date()): string {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
