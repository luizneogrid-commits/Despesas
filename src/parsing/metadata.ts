import { isValidDate, monthFromToken, normalizeYear, toISO } from '../domain/dates';
import { parseBRLToCents } from '../domain/money';

export interface IssuerInfo {
  id: string;
  name: string;
}

/** Detecção do emissor por palavras-chave. Serve para rótulo e dicas de layout. */
const ISSUERS: Array<{ id: string; name: string; re: RegExp }> = [
  { id: 'nubank', name: 'Nubank', re: /\bnu\s?pagamentos\b|\bnubank\b|\bnu\s?bank\b/i },
  { id: 'itau', name: 'Itaú', re: /\bita[uú]\b|\bitaucard\b|\bita[uú]\s?unibanco\b/i },
  { id: 'bradesco', name: 'Bradesco', re: /\bbradesco\b|\bbradescard\b/i },
  { id: 'santander', name: 'Santander', re: /\bsantander\b/i },
  { id: 'bb', name: 'Banco do Brasil', re: /\bbanco do brasil\b|\bourocard\b/i },
  { id: 'caixa', name: 'Caixa', re: /\bcaixa econ[oô]mica\b|\bcart[aã]o caixa\b/i },
  { id: 'inter', name: 'Inter', re: /\bbanco inter\b|\binter\s?&\s?co\b|\bbancointer\b/i },
  { id: 'c6', name: 'C6 Bank', re: /\bc6\s?bank\b|\bc6\s?carbon\b|\bbanco c6\b/i },
  { id: 'xp', name: 'XP', re: /\bxp\s?investimentos\b|\bbanco xp\b|\bcart[aã]o xp\b/i },
  { id: 'btg', name: 'BTG Pactual', re: /\bbtg\s?pactual\b/i },
  { id: 'picpay', name: 'PicPay', re: /\bpicpay\b/i },
  { id: 'mercadopago', name: 'Mercado Pago', re: /\bmercado\s?pago\b/i },
  { id: 'porto', name: 'Porto Bank', re: /\bporto\s?(seguro\s?)?(bank|cart[aã]o)\b/i },
  { id: 'sicredi', name: 'Sicredi', re: /\bsicredi\b/i },
  { id: 'sicoob', name: 'Sicoob', re: /\bsicoob\b/i },
  { id: 'neon', name: 'Neon', re: /\bbanco neon\b|\bneon pagamentos\b/i },
  { id: 'will', name: 'Will Bank', re: /\bwill\s?bank\b/i },
  { id: 'next', name: 'Next', re: /\bbanco next\b/i },
  { id: 'original', name: 'Banco Original', re: /\bbanco original\b/i },
  { id: 'pan', name: 'Banco Pan', re: /\bbanco pan\b/i },
  { id: 'credicard', name: 'Credicard', re: /\bcredicard\b/i },
];

export function detectIssuer(fullText: string): IssuerInfo {
  for (const issuer of ISSUERS) {
    if (issuer.re.test(fullText)) return { id: issuer.id, name: issuer.name };
  }
  return { id: 'generico', name: 'Cartão de crédito' };
}

const MONTHS = 'jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|feb|apr|may|aug|sep|oct|dec';
const NUM_DATE = String.raw`(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})`;
const TXT_DATE = String.raw`(\d{1,2})\s?(?:de\s)?(${MONTHS})[a-zç]*\.?\s?(?:de\s)?(\d{4})`;

function toDate(d: string, m: string, y: string): string | undefined {
  const day = Number(d);
  const month = /^\d+$/.test(m) ? Number(m) : monthFromToken(m);
  const year = normalizeYear(Number(y));
  if (!month || !isValidDate(year, month, day)) return undefined;
  return toISO(year, month, day);
}

function findLabeledDate(text: string, label: string): string | undefined {
  const window = String.raw`[^\n\d]{0,40}?`;
  const numRe = new RegExp(`(?:${label})${window}${NUM_DATE}`, 'i');
  const txtRe = new RegExp(`(?:${label})${window}${TXT_DATE}`, 'i');
  const candidates: Array<{ index: number; iso: string }> = [];
  const n = numRe.exec(text);
  if (n?.[1] && n[2] && n[3]) {
    const iso = toDate(n[1], n[2], n[3]);
    if (iso) candidates.push({ index: n.index, iso });
  }
  const t = txtRe.exec(text);
  if (t?.[1] && t[2] && t[3]) {
    const iso = toDate(t[1], t[2], t[3]);
    if (iso) candidates.push({ index: t.index, iso });
  }
  candidates.sort((a, b) => a.index - b.index);
  return candidates[0]?.iso;
}

export function findDueDate(text: string): string | undefined {
  return findLabeledDate(
    text,
    String.raw`data\s+(?:de|do)\s+vencimento|vencimento\s+da\s+fatura|vencimento|vence\s+em|venc\.?|pagar\s+at[eé]`,
  );
}

export function findClosingDate(text: string): string | undefined {
  return findLabeledDate(
    text,
    String.raw`data\s+(?:de|do)\s+fechamento|fechamento\s+da\s+fatura|fechamento|data\s+de\s+corte|fatura\s+fechada\s+em|emiss[aã]o`,
  );
}

const TOTAL_LABELS = [
  String.raw`total\s+(?:desta|da)\s+fatura`,
  String.raw`valor\s+total\s+(?:desta|da)\s+fatura`,
  String.raw`total\s+a\s+pagar`,
  String.raw`valor\s+(?:da|desta)\s+fatura`,
  String.raw`no\s+valor\s+de`,
  String.raw`total\s+da\s+sua\s+fatura`,
  String.raw`valor\s+a\s+pagar`,
  String.raw`total\s+fatura`,
  String.raw`saldo\s+total\s+(?:da\s+fatura|devedor)`,
];

const AMOUNT = String.raw`(-?\s?(?:R\$)?\s?-?\s?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})`;

export function findDeclaredTotal(text: string): number | undefined {
  for (const label of TOTAL_LABELS) {
    const re = new RegExp(`(?:${label})[^\\n\\d-]{0,30}${AMOUNT}`, 'i');
    const m = re.exec(text);
    if (m?.[1]) {
      const cents = parseBRLToCents(m[1]);
      if (cents !== null) return cents;
    }
  }
  return undefined;
}

/** Última data completa (com ano) do documento — âncora de reserva. */
export function findAnyFullDate(text: string): string | undefined {
  const re = new RegExp(NUM_DATE, 'g');
  let latest: string | undefined;
  for (const m of text.matchAll(re)) {
    if (!m[1] || !m[2] || !m[3] || m[3].length !== 4) continue;
    const iso = toDate(m[1], m[2], m[3]);
    if (iso && (!latest || iso > latest)) latest = iso;
  }
  return latest;
}
