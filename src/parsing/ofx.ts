/**
 * Leitor de OFX/QFX (Open Financial Exchange), o formato que a maioria dos
 * bancos brasileiros oferece em "Exportar extrato". Aceita OFX 1.x (SGML, tags
 * sem fechamento) e 2.x (XML). Extratos de conta (<STMTRS>) e de cartão
 * (<CCSTMTRS>). No OFX o sinal é sempre o do dinheiro: negativo = saída.
 */
import { normalizeText, prettifyDescription } from '../categorization/normalize';
import { isValidDate, toISO, yearMonth } from '../domain/dates';
import type { IssuerInfo } from './metadata';
import { classifyAccount } from './parseAccount';
import { classify, type ParsedStatement, type ParsedTransaction } from './parseStatement';

/** Códigos COMPE dos bancos mais comuns. */
const BANK_CODES: Record<string, IssuerInfo> = {
  '001': { id: 'bb', name: 'Banco do Brasil' },
  '033': { id: 'santander', name: 'Santander' },
  '077': { id: 'inter', name: 'Inter' },
  '104': { id: 'caixa', name: 'Caixa' },
  '208': { id: 'btg', name: 'BTG Pactual' },
  '212': { id: 'original', name: 'Banco Original' },
  '237': { id: 'bradesco', name: 'Bradesco' },
  '260': { id: 'nubank', name: 'Nubank' },
  '290': { id: 'pagbank', name: 'PagBank' },
  '323': { id: 'mercadopago', name: 'Mercado Pago' },
  '336': { id: 'c6', name: 'C6 Bank' },
  '341': { id: 'itau', name: 'Itaú' },
  '380': { id: 'picpay', name: 'PicPay' },
  '422': { id: 'safra', name: 'Safra' },
  '748': { id: 'sicredi', name: 'Sicredi' },
  '756': { id: 'sicoob', name: 'Sicoob' },
};

function tag(block: string, name: string): string | undefined {
  const m = new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, 'i').exec(block);
  const v = m?.[1]?.trim();
  return v ? v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : undefined;
}

function ofxDate(raw: string | undefined): string | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw ?? '');
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return isValidDate(y, mo, d) ? toISO(y, mo, d) : undefined;
}

/** "−150.00", "-150,00", "1.234,56" → centavos (sinal do dinheiro). */
export function ofxAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  let s = raw.replace(/\s/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export function isOFX(text: string): boolean {
  return /OFXHEADER|<OFX>/i.test(text.slice(0, 2000));
}

export function parseOFX(text: string): ParsedStatement {
  const isCard = /<CCSTMTRS>|<CCACCTFROM>/i.test(text);
  const bankId = tag(text, 'BANKID')?.padStart(3, '0').slice(-3);
  const org = tag(text, 'ORG');
  const issuer: IssuerInfo =
    (bankId && BANK_CODES[bankId]) ||
    (org
      ? { id: normalizeText(org).toLowerCase(), name: org }
      : { id: 'generico', name: isCard ? 'Cartão de crédito' : 'Conta corrente' });
  const acct = tag(text, 'ACCTID');
  const branch = tag(text, 'BRANCHID');
  const periodStart = ofxDate(tag(text, 'DTSTART'));
  const periodEnd = ofxDate(tag(text, 'DTEND'));
  const ledger =
    /<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>|$)/i.exec(text)?.[1];
  const closing = ofxAmount(ledger ? tag(ledger, 'BALAMT') : undefined);

  const transactions: ParsedTransaction[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0] ?? raw;
    const date = ofxDate(tag(block, 'DTPOSTED') ?? tag(block, 'DTUSER'));
    const money = ofxAmount(tag(block, 'TRNAMT'));
    if (!date || money === undefined || money === 0) continue;
    const name = tag(block, 'NAME');
    const memo = tag(block, 'MEMO');
    const parts = [memo, name].filter((p): p is string => Boolean(p));
    const desc =
      parts.length === 2 &&
      parts[0] &&
      parts[1] &&
      normalizeText(parts[0]).includes(normalizeText(parts[1]))
        ? parts[0]
        : parts.join(' - ');
    const description = desc || tag(block, 'TRNTYPE') || 'Lançamento';
    const normalized = normalizeText(description);
    const credit = money > 0;
    const amountCents = credit ? -Math.abs(money) : Math.abs(money);
    const kind = isCard
      ? classify(normalized, amountCents).kind
      : classifyAccount(normalized, credit);
    const fitid = tag(block, 'FITID');
    transactions.push({
      date,
      description: prettifyDescription(description),
      rawDescription: description,
      amountCents,
      kind,
      international: false,
      sourceLine: `OFX ${date} ${tag(block, 'TRNAMT') ?? ''} ${description}`,
      ...(fitid ? { externalId: `${bankId ?? 'ofx'}:${acct ?? ''}:${fitid}` } : {}),
    });
  }

  const net = transactions.reduce((a, t) => a - t.amountCents, 0);
  const end =
    periodEnd ??
    transactions
      .map((t) => t.date)
      .sort()
      .at(-1);
  const [y, m] = (end ?? '1970-01-01').split('-').map(Number);
  return {
    issuer,
    accountType: isCard ? 'cartao' : 'conta',
    format: 'ofx',
    referenceMonth: yearMonth(y ?? 1970, m ?? 1),
    referenceEstimated: isCard,
    transactions,
    unrecognizedLines: [],
    skippedFutureCount: 0,
    warnings: transactions.length === 0 ? ['O arquivo OFX não tem lançamentos.'] : [],
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd } : {}),
    ...(closing !== undefined && !isCard
      ? { closingBalanceCents: closing, openingBalanceCents: closing - net }
      : {}),
    ...(acct
      ? {
          accountLabel: branch
            ? `Ag. ${branch} · CC ${acct}`
            : isCard
              ? `Cartão ${acct.slice(-4)}`
              : `Conta ${acct}`,
        }
      : {}),
  };
}
