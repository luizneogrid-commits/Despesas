import { normalizeText, prettifyDescription } from '../categorization/normalize';
import { inferYear, isValidDate, parseISO, toISO, todayISO, yearMonth } from '../domain/dates';
import type { AccountType, Installment, TxKind } from '../domain/types';
import { BREAK_LINE } from './lines';
import {
  detectIssuer,
  findAnyFullDate,
  findClosingDate,
  findDeclaredTotal,
  findDueDate,
  type IssuerInfo,
} from './metadata';
import { detectDocumentType } from './metadata';
import { parseAccountText } from './parseAccount';
import { tokenizeLine, type AmountToken, type Token } from './tokenize';

export interface ParsedTransaction {
  date: string;
  description: string;
  rawDescription: string;
  amountCents: number;
  kind: TxKind;
  installment?: Installment;
  international: boolean;
  foreign?: { currency: string; amountCents: number };
  cardLast4?: string;
  sourceLine: string;
  /** Saldo após o lançamento (extratos de conta). */
  balanceCents?: number;
  /** Identificador do banco (OFX FITID). */
  externalId?: string;
}

export interface ParsedStatement {
  issuer: IssuerInfo;
  dueDate?: string;
  closingDate?: string;
  referenceMonth: string;
  /** true quando o mês de referência foi estimado (sem vencimento no PDF). */
  referenceEstimated: boolean;
  declaredTotalCents?: number;
  transactions: ParsedTransaction[];
  /** Linhas com valor que não viraram lançamento (para revisão/diagnóstico). */
  unrecognizedLines: string[];
  skippedFutureCount: number;
  warnings: string[];
  /** Fatura de cartão (padrão) ou extrato de conta corrente. */
  accountType?: AccountType;
  format?: 'pdf' | 'ofx' | 'csv';
  periodStart?: string;
  periodEnd?: string;
  openingBalanceCents?: number;
  closingBalanceCents?: number;
  accountLabel?: string;
}

export interface RawTx {
  day: number;
  month: number;
  year?: number;
  text: string[];
  amounts: AmountToken[];
  installment?: Installment;
}

// ---------------------------------------------------------------- seções

/** Bloco de parcelas que só vencem em faturas futuras: não é gasto deste mês. */
const FUTURE_SECTION =
  /pr[óo]xim[ao]s?\s+faturas?|lan[çc]amentos\s+futuros|parcelas\s+a\s+vencer|demais\s+faturas|compromissos\s+futuros|faturas\s+futuras/i;
const RESUME_SECTION =
  /lan[çc]amentos(?!\s+futuros)|despesas|transa[çc][õo]es|compras\s+e\s+saques|movimenta[çc][õo]es|detalhamento/i;
const INTERNATIONAL_SECTION = /internacion|no\s+exterior|em\s+moeda\s+estrangeira/i;
const NATIONAL_SECTION = /nacion|no\s+brasil/i;

const CARD_HEADER = /(?:final\s*[:\-–]?\s*|(?:[*•xX]{2,}[\s.-]?)+)(\d{4})\b/i;
const CARD_INLINE = /(?:[•*xX]\s?){4}\s?(\d{4})\b/;

// ---------------------------------------------------------------- textos

const IGNORE_DESCRIPTION =
  /^(TOTAL|SUBTOTAL|SALDO|LIMITE|VALOR TOTAL|VALOR MINIMO|PAGAMENTO MINIMO|MINIMO|FATURA ANTERIOR|SALDO ANTERIOR|TAXA DE JUROS|TAXAS? MAXIMAS?|CET|CUSTO EFETIVO|VENCIMENTO|FECHAMENTO|MELHOR DIA|PROXIMA FATURA|DATA|PERIODO|RESUMO|CREDITO ROTATIVO LIMITE|ENCARGOS PREVISTOS|PARCELAMENTO DISPONIVEL|OPCOES DE PARCELAMENTO|LIMITE DISPONIVEL|EM ATE)\b/;
const PAYMENT_RE =
  /^(PAGAMENTO|PAGTO|PGTO|PAG FATURA|PAGAMENTO EFETUADO|PAGAMENTO RECEBIDO|DEBITO AUTOMATICO)\b|PAGAMENTO (DE |DA )?FATURA|PAGTO (DE |DA )?FATURA|PAGAMENTO RECEBIDO|PAGAMENTO EFETUADO|\bCREDITO (DE |DO |POR )?PAGAMENTO\b/;
const REFUND_RE =
  /\b(ESTORNO|ESTORNADO|CREDITO|CREDITOS|REEMBOLSO|DEVOLUCAO|CANCELAMENTO|CHARGEBACK|CASHBACK|BONIFICACAO|AJUSTE A CREDITO|CRED)\b/;
const FEE_RE =
  /\b(IOF|JUROS|MULTA|MORA|ANUIDADE|TARIFA|ENCARGOS?|ROTATIVO|AVALIACAO EMERGENCIAL|SEGURO CARTAO|SEGURO FATURA|PARCELAMENTO DE FATURA|SAQUE)\b/;
const CURRENCY_MARKER = /^(R\$|US\$|U\$|USD|EUR|BRL|€|\$|C|D|CR)$/i;
const FOREIGN_HINT = /\b(USD|US\$|EUR|€|D[OÓ]LAR|COTA[CÇ][AÃ]O|CONVERS[AÃ]O|C[AÂ]MBIO)\b/i;
const TEXT_INSTALLMENT = /\bPARC(?:ELA)?\.?\s*(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\b/i;
const TRAILING_INSTALLMENT = /(?:\s|^)(?:PARC(?:ELA)?\.?\s*)?(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i;

function validInstallment(current: number, total: number): Installment | undefined {
  if (total >= 2 && total <= 99 && current >= 1 && current <= total) return { current, total };
  return undefined;
}

// ---------------------------------------------------------- máquina de estados

/**
 * Lê uma linha tokenizada e devolve os lançamentos no padrão
 * DATA [DATA] TEXTO [PARCELA] VALOR [VALOR…]. Funciona com vários
 * lançamentos na mesma linha (colunas lado a lado).
 */
export function extractFromTokens(tokens: Token[]): RawTx[] {
  const out: RawTx[] = [];
  let i = 0;
  while (i < tokens.length) {
    const start = tokens[i];
    if (!start || start.kind !== 'date') {
      i++;
      continue;
    }
    const tx: RawTx = {
      day: start.day,
      month: start.month,
      ...(start.year ? { year: start.year } : {}),
      text: [],
      amounts: [],
    };
    let j = i + 1;
    // "05/10 07/10 LOJA" (data da compra + data de lançamento): fica a primeira.
    if (tokens[j]?.kind === 'date' && tokens[j + 1]?.kind === 'text') j++;

    while (j < tokens.length) {
      const cur = tokens[j];
      if (!cur) break;
      if (cur.kind === 'text') {
        if (tx.amounts.length > 0) {
          if (CURRENCY_MARKER.test(cur.value)) {
            j++;
            continue;
          }
          break;
        }
        tx.text.push(cur.value);
        j++;
        continue;
      }
      if (cur.kind === 'amount') {
        tx.amounts.push(cur);
        j++;
        continue;
      }
      // cur é uma data
      if (tx.amounts.length > 0 || tx.text.length === 0) break;
      const next = tokens[j + 1];
      const inst = cur.numeric && !cur.year ? validInstallment(cur.day, cur.month) : undefined;
      if (inst && next?.kind === 'amount') {
        tx.installment = inst;
        j++;
        continue;
      }
      if (next?.kind === 'text') break; // começa outro lançamento
      tx.text.push(cur.raw);
      j++;
    }
    if (tx.text.length > 0 && tx.amounts.length > 0) out.push(tx);
    i = j > i ? j : i + 1;
  }
  return out;
}

export function classify(normalized: string, cents: number): { kind: TxKind; cents: number } {
  const abs = Math.abs(cents);
  if (PAYMENT_RE.test(normalized)) return { kind: 'pagamento', cents: -abs };
  if (cents < 0 || REFUND_RE.test(normalized)) return { kind: 'estorno', cents: -abs };
  if (FEE_RE.test(normalized)) return { kind: 'encargo', cents: abs };
  return { kind: 'compra', cents: abs };
}

interface Context {
  anchor: string;
  card?: string;
  international: boolean;
  line: string;
}

function buildTransaction(raw: RawTx, ctx: Context): ParsedTransaction | null {
  let text = raw.text.join(' ').replace(/\s+/g, ' ').trim();

  let cardLast4 = ctx.card;
  const inlineCard = CARD_INLINE.exec(text);
  if (inlineCard?.[1]) {
    cardLast4 = inlineCard[1];
    text = text.replace(CARD_INLINE, ' ').trim();
  }

  let installment = raw.installment;
  if (!installment) {
    const m = TEXT_INSTALLMENT.exec(text) ?? TRAILING_INSTALLMENT.exec(text);
    if (m?.[1] && m[2]) {
      installment = validInstallment(Number(m[1]), Number(m[2]));
      if (installment) text = text.replace(m[0], ' ');
    }
  }
  text = text
    .replace(/\bPARC(?:ELA)?\.?\s*$/i, '')
    .replace(/\s*[-–|:]\s*$/, '')
    .replace(/^\s*[-–|:]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 2) return null;

  const normalized = normalizeText(text);
  if (!normalized || IGNORE_DESCRIPTION.test(normalized) || /%/.test(text)) return null;

  const brlAmounts = raw.amounts.filter((a) => a.currency !== 'USD' && a.currency !== 'EUR');
  const main = brlAmounts.at(-1) ?? raw.amounts.at(-1);
  if (!main || main.cents === 0) return null;
  const foreignToken = raw.amounts.find((a) => a.currency === 'USD' || a.currency === 'EUR');

  const { kind, cents } = classify(normalized, main.cents);

  const year = raw.year ?? inferYear(raw.day, raw.month, ctx.anchor, installment?.current);
  let day = raw.day;
  while (day > 28 && !isValidDate(year, raw.month, day)) day--;

  const international = ctx.international || Boolean(foreignToken) || FOREIGN_HINT.test(text);

  return {
    date: toISO(year, raw.month, day),
    description: prettifyDescription(text),
    rawDescription: text,
    amountCents: cents,
    kind,
    ...(installment ? { installment } : {}),
    international,
    ...(foreignToken && foreignToken !== main
      ? {
          foreign: {
            currency: foreignToken.currency ?? 'USD',
            amountCents: Math.abs(foreignToken.cents),
          },
        }
      : {}),
    ...(cardLast4 ? { cardLast4 } : {}),
    sourceLine: ctx.line,
  };
}

// ---------------------------------------------------------------- principal

/**
 * Lê o texto de um PDF: decide se é fatura de cartão ou extrato de conta e
 * usa o leitor correspondente. `forceType` permite corrigir a detecção.
 */
export function parseStatementText(
  lines: string[],
  opts: { today?: Date; forceType?: AccountType } = {},
): ParsedStatement {
  const fullText = lines.filter((l) => l !== BREAK_LINE).join('\n');
  const type = opts.forceType ?? detectDocumentType(fullText);
  if (type === 'conta') return parseAccountText(lines, opts);
  return { ...parseCardText(lines, opts), accountType: 'cartao', format: 'pdf' };
}

/** Leitor de fatura de cartão de crédito. */
export function parseCardText(lines: string[], opts: { today?: Date } = {}): ParsedStatement {
  const fullText = lines.filter((l) => l !== BREAK_LINE).join('\n');
  const issuer = detectIssuer(fullText);
  const dueDate = findDueDate(fullText);
  const closingDate = findClosingDate(fullText);
  const declaredTotalCents = findDeclaredTotal(fullText);
  const anchor = dueDate ?? closingDate ?? findAnyFullDate(fullText) ?? todayISO(opts.today);

  const transactions: ParsedTransaction[] = [];
  const unrecognizedLines: string[] = [];
  let skipFuture = false;
  let international = false;
  let card: string | undefined;
  let skippedFutureCount = 0;
  let lastTxLine = -2;

  lines.forEach((line, index) => {
    if (line === BREAK_LINE) {
      skipFuture = false; // seções de "próximas faturas" não atravessam colunas
      return;
    }
    const tokens = tokenizeLine(line);
    const raws = extractFromTokens(tokens);

    if (raws.length === 0) {
      // Linha de cabeçalho/seção ou continuação do lançamento anterior.
      if (FUTURE_SECTION.test(line)) {
        skipFuture = true;
        return;
      }
      if (skipFuture && RESUME_SECTION.test(line)) skipFuture = false;
      if (INTERNATIONAL_SECTION.test(line) && line.length < 80) international = true;
      else if (NATIONAL_SECTION.test(line) && line.length < 80) international = false;
      const cardMatch = CARD_HEADER.exec(line);
      if (cardMatch?.[1] && line.length < 90) card = cardMatch[1];

      const last = transactions.at(-1);
      let attached = false;
      if (last && index === lastTxLine + 1 && !skipFuture) {
        const inst = TEXT_INSTALLMENT.exec(line);
        if (inst?.[1] && inst[2] && !last.installment) {
          const parsed = validInstallment(Number(inst[1]), Number(inst[2]));
          if (parsed) {
            last.installment = parsed;
            attached = true;
          }
        }
        if (FOREIGN_HINT.test(line)) {
          attached = true;
          last.international = true;
          const foreign = tokens.find(
            (t): t is AmountToken =>
              t.kind === 'amount' && (t.currency === 'USD' || t.currency === 'EUR'),
          );
          if (foreign && !last.foreign) {
            last.foreign = {
              currency: foreign.currency ?? 'USD',
              amountCents: Math.abs(foreign.cents),
            };
          }
        }
      }
      const hasAmount = tokens.some((t) => t.kind === 'amount');
      const firstText = tokens.find((t) => t.kind === 'text');
      if (
        !attached &&
        hasAmount &&
        firstText &&
        !skipFuture &&
        !IGNORE_DESCRIPTION.test(normalizeText(firstText.value)) &&
        !PAYMENT_RE.test(normalizeText(firstText.value)) &&
        !/%/.test(line) &&
        unrecognizedLines.length < 200
      ) {
        unrecognizedLines.push(line);
      }
      return;
    }

    if (skipFuture) {
      skippedFutureCount += raws.length;
      return;
    }
    for (const raw of raws) {
      const tx = buildTransaction(raw, { anchor, ...(card ? { card } : {}), international, line });
      if (tx) transactions.push(tx);
    }
    lastTxLine = index;
  });

  const anchorParts = parseISO(dueDate ?? closingDate ?? anchor);
  let referenceMonth = yearMonth(anchorParts.y, anchorParts.m);
  const referenceEstimated = !dueDate && !closingDate;
  if (referenceEstimated && transactions.length > 0) {
    // Sem vencimento: usa o mês da compra mais recente (que não seja parcela).
    const latest = transactions
      .filter((t) => !t.installment)
      .map((t) => t.date)
      .sort()
      .at(-1);
    if (latest) referenceMonth = latest.slice(0, 7);
  }

  const warnings: string[] = [];
  if (transactions.length === 0) {
    warnings.push(
      'Nenhum lançamento foi reconhecido. O PDF pode ser digitalizado (imagem) ou ter um layout ainda não suportado.',
    );
  }
  if (referenceEstimated) {
    warnings.push(
      'Não encontramos a data de vencimento: o mês da fatura foi estimado. Confira antes de importar.',
    );
  }

  return {
    issuer,
    ...(dueDate ? { dueDate } : {}),
    ...(closingDate ? { closingDate } : {}),
    referenceMonth,
    referenceEstimated,
    ...(declaredTotalCents !== undefined ? { declaredTotalCents } : {}),
    transactions,
    unrecognizedLines,
    skippedFutureCount,
    warnings,
  };
}

/** Soma do que é gasto (compras + encargos − estornos), sem pagamentos. */
export function spendingTotal(txs: Array<Pick<ParsedTransaction, 'kind' | 'amountCents'>>): number {
  return txs.reduce((acc, t) => (t.kind === 'pagamento' ? acc : acc + t.amountCents), 0);
}
