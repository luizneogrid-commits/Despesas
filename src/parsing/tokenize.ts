import { isValidDate, monthFromToken, normalizeYear } from '../domain/dates';
import { toPdfLine, type Line, type Segment } from './lines';

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
  /** Posição horizontal na página (quando a linha veio do PDF com posições). */
  x?: number;
}

export interface AmountToken {
  kind: 'amount';
  /** Convenção de fatura: negativo = crédito (sinal "-", sufixo "-", "C" ou "CR"). */
  cents: number;
  /** Valor absoluto em centavos. */
  abs: number;
  /** Marcas de sinal como apareceram (extratos usam "-"/"D" para saída e "+"/"C" para entrada). */
  minus: boolean;
  plus: boolean;
  creditMark: boolean;
  debitMark: boolean;
  currency?: 'BRL' | 'USD' | 'EUR';
  raw: string;
  start: number;
  end: number;
  x?: number;
}

export interface TextToken {
  kind: 'text';
  value: string;
  start: number;
  end: number;
  x?: number;
}

export type Token = DateToken | AmountToken | TextToken;

// Valor no formato brasileiro, com sinal/moeda opcionais e indicador de crédito.
const AMOUNT_RE =
  /(?<![\p{L}\d,.])([-−–+]\s?)?((?:R\$|US\$|U\$|USD|EUR|€)\s?)?([-−–+]\s?)?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?![\d,%]|\s?%)(\s?-(?![\d\p{L}])|\s?(?:CR|C|D)(?=\s|$))?/gu;

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
    const signs = `${m[1] ?? ''}${m[3] ?? ''}`;
    const suffix = (m[6] ?? '').trim().toUpperCase();
    const minus = /[-−–]/.test(signs) || suffix === '-';
    const plus = signs.includes('+');
    const creditMark = suffix === 'C' || suffix === 'CR';
    const debitMark = suffix === 'D';
    const negative = minus || creditMark;
    const currency = currencyOf(m[2]);
    found.push({
      kind: 'amount',
      cents: negative ? -cents : cents,
      abs: cents,
      minus,
      plus,
      creditMark,
      debitMark,
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

/** Posição horizontal de um caractere da linha, interpolada dentro do bloco. */
function xAt(segments: Segment[], pos: number): number {
  for (const seg of segments) {
    if (pos >= seg.start && pos < seg.end) {
      const charWidth = (seg.x2 - seg.x) / Math.max(1, seg.text.length);
      return seg.x + (pos - seg.start) * charWidth;
    }
  }
  const next = segments.find((s) => s.start >= pos) ?? segments.at(-1);
  return next ? next.x : pos;
}

/**
 * Tokeniza uma linha preservando a geometria: cada token ganha sua posição x
 * e um texto que atravessa colunas ("PADARIA REAL | SAO PAULO") é dividido
 * em um token por coluna.
 */
export function tokenizePdfLine(line: Line): Token[] {
  const { text, segments } = toPdfLine(line);
  const out: Token[] = [];
  for (const tok of tokenizeLine(text)) {
    if (tok.kind !== 'text') {
      out.push({ ...tok, x: xAt(segments, tok.start) });
      continue;
    }
    const pieces = segments.filter((s) => s.end > tok.start && s.start < tok.end);
    if (pieces.length <= 1) {
      const lead = text.slice(tok.start, tok.end).search(/\S/);
      out.push({ ...tok, x: xAt(segments, tok.start + Math.max(0, lead)) });
      continue;
    }
    for (const seg of pieces) {
      const from = Math.max(tok.start, seg.start);
      const to = Math.min(tok.end, seg.end);
      const slice = text.slice(from, to);
      const value = slice.replace(/\s+/g, ' ').trim();
      if (!value) continue;
      const lead = slice.search(/\S/);
      out.push({
        kind: 'text',
        value,
        start: from,
        end: to,
        x: xAt(segments, from + Math.max(0, lead)),
      });
    }
  }
  return out;
}
