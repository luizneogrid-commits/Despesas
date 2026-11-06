import { isValidDate, monthFromToken, normalizeYear } from '../domain/dates';

/**
 * Tokenizador de linhas de fatura. Uma linha vira uma sequência de
 * DATA, VALOR e TEXTO — o parser então reconhece o padrão
 * DATA TEXTO [PARCELA] VALOR, inclusive quando há duas colunas de
 * lançamentos lado a lado na mesma linha.
 */

export interface DateToken {
  kind: 'date';
  day: number;
  month: number;
  year?: number;
  /** true para formatos dd/mm (que também podem ser uma parcela "02/10"). */
  numeric: boolean;
  raw: string;
  start: number;
  end: number;
}

export interface AmountToken {
  kind: 'amount';
  cents: number;
  currency?: 'BRL' | 'USD' | 'EUR';
  raw: string;
  start: number;
  end: number;
}

export interface TextToken {
  kind: 'text';
  value: string;
  start: number;
  end: number;
}

export type Token = DateToken | AmountToken | TextToken;

// Valor no formato brasileiro, com sinal/moeda opcionais e indicador de crédito.
const AMOUNT_RE =
  /(?<![\p{L}\d,.])([-−–]\s?)?((?:R\$|US\$|U\$|USD|EUR|€)\s?)?([-−–]\s?)?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?![\d,%]|\s?%)(\s?-(?![\d\p{L}])|\s?(?:CR|C)(?=\s|$))?/gu;

const DATE_NUM_RE = /(?<![\d/.,-])(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?![\d/]|[.,]\d)/g;

const MONTH_WORD =
  '(?:JAN(?:EIRO)?|FEV(?:EREIRO)?|FEB(?:RUARY)?|MAR(?:[CÇ]O)?|ABR(?:IL)?|APR(?:IL)?|MAI(?:O)?|MAY|JUN(?:HO)?|JUL(?:HO)?|AGO(?:STO)?|AUG(?:UST)?|SET(?:EMBRO)?|SEP(?:TEMBER)?|OUT(?:UBRO)?|OCT(?:OBER)?|NOV(?:EMBRO)?|DEZ(?:EMBRO)?|DEC(?:EMBER)?)';

const DATE_TXT_RE = new RegExp(
  `(?<![\\p{L}\\d])(\\d{1,2})\\s?(?:DE\\s)?(${MONTH_WORD})\\.?(?:\\s?(?:DE\\s)?(\\d{4}))?(?![\\p{L}\\d])`,
  'giu',
);

function currencyOf(prefix: string | undefined): AmountToken['currency'] {
  if (!prefix) return undefined;
  const p = prefix.trim().toUpperCase();
  if (p === 'R$') return 'BRL';
  if (p === 'EUR' || p === '€') return 'EUR';
  return 'USD';
}

function mask(text: string, start: number, end: number): string {
  return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
}

export function tokenizeLine(line: string): Token[] {
  const found: Array<DateToken | AmountToken> = [];
  let masked = line;

  for (const m of line.matchAll(AMOUNT_RE)) {
    const start = m.index ?? 0;
    const raw = m[0];
    const end = start + raw.length;
    const intPart = (m[4] ?? '0').replace(/\./g, '');
    const cents = Number(intPart) * 100 + Number(m[5]);
    const negative = Boolean(m[1] || m[3] || (m[6] && m[6].trim().length > 0));
    const currency = currencyOf(m[2]);
    found.push({
      kind: 'amount',
      cents: negative ? -cents : cents,
      ...(currency ? { currency } : {}),
      raw: raw.trim(),
      start,
      end,
    });
    masked = mask(masked, start, end);
  }

  for (const m of masked.matchAll(DATE_TXT_RE)) {
    const day = Number(m[1]);
    const month = monthFromToken(m[2] ?? '');
    const start = m.index ?? 0;
    if (!month || day < 1 || day > 31) continue;
    const year = m[3] ? Number(m[3]) : undefined;
    found.push({
      kind: 'date',
      day,
      month,
      ...(year ? { year } : {}),
      numeric: false,
      raw: m[0],
      start,
      end: start + m[0].length,
    });
    masked = mask(masked, start, start + m[0].length);
  }

  for (const m of masked.matchAll(DATE_NUM_RE)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const start = m.index ?? 0;
    const year = m[3] ? normalizeYear(Number(m[3])) : undefined;
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    if (year && !isValidDate(year, month, day)) continue;
    found.push({
      kind: 'date',
      day,
      month,
      ...(year ? { year } : {}),
      numeric: true,
      raw: m[0],
      start,
      end: start + m[0].length,
    });
  }

  found.sort((a, b) => a.start - b.start);

  const tokens: Token[] = [];
  let cursor = 0;
  const pushText = (from: number, to: number) => {
    const value = line.slice(from, to).replace(/\s+/g, ' ').trim();
    if (value) tokens.push({ kind: 'text', value, start: from, end: to });
  };
  for (const tok of found) {
    if (tok.start < cursor) continue; // sobreposição (não deveria ocorrer)
    pushText(cursor, tok.start);
    tokens.push(tok);
    cursor = tok.end;
  }
  pushText(cursor, line.length);
  return tokens;
}
