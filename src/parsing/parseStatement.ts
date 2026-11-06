import { normalizeText, prettifyDescription } from '../categorization/normalize';
import { inferYear, isValidDate, parseISO, toISO, todayISO, yearMonth } from '../domain/dates';
import type { AccountType, Installment, TxKind } from '../domain/types';
import { BREAK_LINE, lineText, type Line } from './lines';
import {
  buildDocStats,
  chooseMerchant,
  detectHeader,
  hasLeadLayout,
  headerFits,
  headerMerchantFirst,
  isMerchantLikeLead,
  type DocStats,
  type HeaderModel,
  type Part,
} from './merchantText';
import { isForeignLocation, isLocationText, prettyLocation } from './places';
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
import { tokenizePdfLine, type AmountToken, type TextToken, type Token } from './tokenize';

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
  /** Cidade/país impressos junto do estabelecimento (não fazem parte do nome). */
  location?: string;
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
  /** Textos depois da data. */
  text: string[];
  /** Todos os textos da linha que pertencem ao lançamento, com posição (inclui os antes da data). */
  parts: Part[];
  /** Só há texto antes da data ("PADARIA REAL  05/10  23,50"). */
  leadOnly?: boolean;
  dateX?: number;
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

/** Datas próximas (até 10 dias): data da compra seguida da data de lançamento. */
function isPostingDate(
  first: { day: number; month: number },
  second: { day: number; month: number },
): boolean {
  const a = first.month * 31 + first.day;
  let b = second.month * 31 + second.day;
  if (b < a) b += 12 * 31;
  return b - a <= 10;
}

const textPart = (t: TextToken, lead?: boolean): Part => ({
  text: t.value,
  x: t.x ?? t.start,
  ...(lead ? { lead: true } : {}),
});

/**
 * Lê uma linha tokenizada e devolve os lançamentos no padrão
 * [TEXTO] DATA [DATA] TEXTO [PARCELA] VALOR [VALOR…]. Funciona com vários
 * lançamentos na mesma linha (colunas lado a lado). O texto antes da data é
 * guardado à parte: em alguns layouts é ali que está o estabelecimento.
 * `allowLeadOnly` aceita lançamentos sem texto depois da data.
 */
export function extractFromTokens(
  tokens: Token[],
  opts: { allowLeadOnly?: boolean } = {},
): RawTx[] {
  const out: RawTx[] = [];
  let leads: TextToken[] = [];
  let i = 0;
  while (i < tokens.length) {
    const start = tokens[i];
    if (!start || start.kind !== 'date') {
      if (start?.kind === 'text') leads.push(start);
      else leads = [];
      i++;
      continue;
    }
    const tx: RawTx = {
      day: start.day,
      month: start.month,
      ...(start.year ? { year: start.year } : {}),
      ...(start.x !== undefined ? { dateX: start.x } : {}),
      text: [],
      parts: leads.map((t) => textPart(t, true)),
      amounts: [],
    };
    const hasLead = leads.length > 0;
    leads = [];
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
        tx.parts.push(textPart(cur));
        j++;
        continue;
      }
      if (cur.kind === 'amount') {
        tx.amounts.push(cur);
        j++;
        continue;
      }
      // cur é uma data
      if (tx.amounts.length > 0 || (tx.text.length === 0 && !hasLead)) break;
      const next = tokens[j + 1];
      if (tx.text.length === 0 && next?.kind === 'amount' && isPostingDate(start, cur)) {
        j++; // "PADARIA 05/10 07/10 23,50": data de lançamento
        continue;
      }
      const inst = cur.numeric && !cur.year ? validInstallment(cur.day, cur.month) : undefined;
      // "LOJA 03/10 SAO PAULO 320,00": parcela seguida da coluna de cidade.
      const cityThenAmount =
        next?.kind === 'text' &&
        tokens[j + 2]?.kind === 'amount' &&
        isLocationText(next.value, { strong: true });
      if (inst && (next?.kind === 'amount' || cityThenAmount)) {
        tx.installment = inst;
        j++;
        continue;
      }
      if (next?.kind === 'text' || tx.text.length === 0) break; // começa outro lançamento
      tx.text.push(cur.raw);
      tx.parts.push({ text: cur.raw, x: cur.x ?? cur.start });
      j++;
    }
    const leadOnly = tx.text.length === 0 && hasLead;
    if (tx.amounts.length > 0 && (tx.text.length > 0 || (leadOnly && opts.allowLeadOnly))) {
      out.push(leadOnly ? { ...tx, leadOnly: true } : tx);
    }
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
  header?: HeaderModel | null;
  stats?: DocStats;
  /** Linhas só de texto logo acima/abaixo (quando o nome ficou numa linha à parte). */
  neighbor?: Part[];
}

/** Tira do texto de uma parte o que não é nome: cartão, parcela, separadores. */
function cleanPart(text: string): { text: string; card?: string; installment?: Installment } {
  let t = text;
  let card: string | undefined;
  const inlineCard = CARD_INLINE.exec(t);
  if (inlineCard?.[1]) {
    card = inlineCard[1];
    t = t.replace(CARD_INLINE, ' ');
  }
  let installment: Installment | undefined;
  const m = TEXT_INSTALLMENT.exec(t) ?? TRAILING_INSTALLMENT.exec(t);
  if (m?.[1] && m[2]) {
    installment = validInstallment(Number(m[1]), Number(m[2]));
    if (installment) t = t.replace(m[0], ' ');
  }
  t = t
    .replace(/\bPARC(?:ELA)?\.?\s*$/i, '')
    .replace(/\s*[-–|:]\s*$/, '')
    .replace(/^\s*[-–|:]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { text: t, ...(card ? { card } : {}), ...(installment ? { installment } : {}) };
}

function buildTransaction(raw: RawTx, ctx: Context): ParsedTransaction | null {
  let cardLast4 = ctx.card;
  let installment = raw.installment;
  const parts: Part[] = [];
  for (const p of raw.parts) {
    const c = cleanPart(p.text);
    if (c.card) cardLast4 = c.card;
    if (c.installment && !installment) installment = c.installment;
    if (c.text) parts.push({ ...p, text: c.text });
  }
  const allText = raw.parts.map((p) => p.text).join(' ');
  const header = ctx.header && headerFits(ctx.header, raw.dateX, parts) ? ctx.header : null;

  let choice = chooseMerchant(parts, { header, stats: ctx.stats });
  if (choice.fromLocation && ctx.neighbor?.length) {
    // Só havia cidade na linha: o nome está na linha vizinha (célula de duas linhas).
    choice = chooseMerchant([...ctx.neighbor.map((p) => ({ ...p, lead: true })), ...parts], {
      header: null,
      stats: ctx.stats,
    });
  }
  const text = cleanPart(choice.merchant).text;
  if (text.length < 2) return null;

  const normalized = normalizeText(text);
  const normalizedAll = normalizeText(allText);
  if (
    !normalized ||
    IGNORE_DESCRIPTION.test(normalized) ||
    IGNORE_DESCRIPTION.test(normalizedAll)
  ) {
    return null;
  }
  if (/%/.test(allText)) return null;

  const brlAmounts = raw.amounts.filter((a) => a.currency !== 'USD' && a.currency !== 'EUR');
  const main = brlAmounts.at(-1) ?? raw.amounts.at(-1);
  if (!main || main.cents === 0) return null;
  const foreignToken = raw.amounts.find((a) => a.currency === 'USD' || a.currency === 'EUR');

  const { kind, cents } = classify(normalized, main.cents);

  const year = raw.year ?? inferYear(raw.day, raw.month, ctx.anchor, installment?.current);
  let day = raw.day;
  while (day > 28 && !isValidDate(year, raw.month, day)) day--;

  const international =
    ctx.international ||
    Boolean(foreignToken) ||
    FOREIGN_HINT.test(allText) ||
    Boolean(choice.foreign && !choice.fromLocation);

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
    ...(choice.location && !choice.fromLocation ? { location: choice.location } : {}),
    sourceLine: ctx.line,
  };
}

/** Partes de texto de uma linha sem lançamento (cabeçalho ou nome em linha à parte). */
function textParts(tokens: Token[]): Part[] {
  return tokens
    .filter((t): t is TextToken => t.kind === 'text')
    .map((t) => ({ text: t.value, x: t.x ?? t.start }));
}

// ---------------------------------------------------------------- principal

/**
 * Lê o texto de um PDF: decide se é fatura de cartão ou extrato de conta e
 * usa o leitor correspondente. `forceType` permite corrigir a detecção.
 */
export function parseStatementText(
  lines: Line[],
  opts: { today?: Date; forceType?: AccountType } = {},
): ParsedStatement {
  const fullText = lines
    .map(lineText)
    .filter((l) => l !== BREAK_LINE)
    .join('\n');
  const type = opts.forceType ?? detectDocumentType(fullText);
  if (type === 'conta') return parseAccountText(lines, opts);
  return { ...parseCardText(lines, opts), accountType: 'cartao', format: 'pdf' };
}

interface PendingTx {
  raw: RawTx;
  index: number;
  line: string;
  tokens: Token[];
  card?: string;
  international: boolean;
  header: HeaderModel | null;
  skipFuture: boolean;
  /** Ajustes vindos da linha de baixo (parcela, moeda estrangeira, cidade). */
  installment?: Installment;
  foreign?: { currency: string; amountCents: number };
  foreignHint?: boolean;
  location?: string;
  above?: Part[];
  below?: Part[];
}

/** Linha só de texto que pode ser o nome do estabelecimento numa linha à parte. */
function orphanParts(line: string, tokens: Token[]): Part[] | null {
  if (tokens.some((t) => t.kind !== 'text') || line.length > 70) return null;
  const parts = textParts(tokens);
  const joined = parts.map((p) => p.text).join(' ');
  const n = normalizeText(joined);
  if (!n || IGNORE_DESCRIPTION.test(n) || PAYMENT_RE.test(n) || !isMerchantLikeLead(joined))
    return null;
  if (isLocationText(joined)) return null;
  if (FUTURE_SECTION.test(line) || RESUME_SECTION.test(line) || INTERNATIONAL_SECTION.test(line))
    return null;
  if (NATIONAL_SECTION.test(line) || CARD_HEADER.test(line) || FOREIGN_HINT.test(line)) return null;
  return parts;
}

function isUnrecognized(line: string, tokens: Token[]): boolean {
  const hasAmount = tokens.some((t) => t.kind === 'amount');
  const firstText = tokens.find((t): t is TextToken => t.kind === 'text');
  return (
    hasAmount &&
    Boolean(firstText) &&
    !IGNORE_DESCRIPTION.test(normalizeText(firstText?.value ?? '')) &&
    !PAYMENT_RE.test(normalizeText(firstText?.value ?? '')) &&
    !/%/.test(line)
  );
}

/** Leitor de fatura de cartão de crédito. */
export function parseCardText(lines: Line[], opts: { today?: Date } = {}): ParsedStatement {
  const fullText = lines
    .map(lineText)
    .filter((l) => l !== BREAK_LINE)
    .join('\n');
  const issuer = detectIssuer(fullText);
  const dueDate = findDueDate(fullText);
  const closingDate = findClosingDate(fullText);
  const declaredTotalCents = findDeclaredTotal(fullText);
  const anchor = dueDate ?? closingDate ?? findAnyFullDate(fullText) ?? todayISO(opts.today);

  // 1ª passada: lançamentos candidatos e o contexto de cada um.
  const pending: PendingTx[] = [];
  const unrecognized: Array<{ index: number; line: string }> = [];
  let skipFuture = false;
  let international = false;
  let card: string | undefined;
  let header: HeaderModel | null = null;
  let lastTxLine = -2;
  let orphan: { index: number; parts: Part[] } | undefined;

  lines.forEach((entry, index) => {
    const line = lineText(entry);
    if (line === BREAK_LINE) {
      skipFuture = false; // seções de "próximas faturas" não atravessam colunas
      orphan = undefined;
      return;
    }
    const tokens = tokenizePdfLine(entry);
    const raws = extractFromTokens(tokens, { allowLeadOnly: true });
    // Linha só com texto antes da data: pode ser lançamento (decidido na 2ª passada) ou resumo.
    if (raws.length > 0 && raws.every((r) => r.leadOnly) && FUTURE_SECTION.test(line)) {
      skipFuture = true;
      return;
    }

    if (raws.length === 0) {
      // Cabeçalho, seção, continuação do lançamento anterior ou nome em linha à parte.
      if (FUTURE_SECTION.test(line)) {
        skipFuture = true;
        return;
      }
      if (skipFuture && RESUME_SECTION.test(line)) skipFuture = false;
      if (INTERNATIONAL_SECTION.test(line) && line.length < 80) international = true;
      else if (NATIONAL_SECTION.test(line) && line.length < 80) international = false;
      const cardMatch = CARD_HEADER.exec(line);
      if (cardMatch?.[1] && line.length < 90) card = cardMatch[1];
      if (!tokens.some((t) => t.kind === 'amount')) {
        const h = detectHeader(textParts(tokens));
        if (h) {
          header = h;
          orphan = undefined;
          return;
        }
      }

      const previous = pending.filter((p) => p.index === lastTxLine);
      const last = previous.at(-1);
      let attached = false;
      if (last && index === lastTxLine + 1 && !skipFuture) {
        const inst = TEXT_INSTALLMENT.exec(line);
        if (inst?.[1] && inst[2] && !last.raw.installment && !last.installment) {
          const parsed = validInstallment(Number(inst[1]), Number(inst[2]));
          if (parsed) {
            last.installment = parsed;
            attached = true;
          }
        }
        if (FOREIGN_HINT.test(line)) {
          attached = true;
          last.foreignHint = true;
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
        const onlyText = tokens.every((t) => t.kind === 'text');
        if (!attached && onlyText && isLocationText(line)) {
          // "SAO PAULO BR" na linha de baixo: lugar, não descrição.
          last.location = prettyLocation(normalizeText(line));
          if (isForeignLocation(line)) last.foreignHint = true;
          attached = true;
        }
      }
      const parts = attached ? null : orphanParts(line, tokens);
      if (parts) {
        for (const p of previous) if (index === lastTxLine + 1 && !p.below) p.below = parts;
        orphan = { index, parts };
      } else if (!attached) orphan = undefined;
      if (!attached && !skipFuture && isUnrecognized(line, tokens))
        unrecognized.push({ index, line });
      return;
    }

    for (const raw of raws) {
      pending.push({
        raw,
        index,
        line,
        tokens,
        ...(card ? { card } : {}),
        international,
        header,
        skipFuture,
        ...(orphan && orphan.index === index - 1 ? { above: orphan.parts } : {}),
      });
    }
    orphan = undefined;
    lastTxLine = index;
  });

  // 2ª passada: com o documento inteiro, decide o que é nome e o que é lugar.
  const stats = buildDocStats(pending.map((p) => p.raw.parts));
  const leadEvidence = pending.filter((p) => hasLeadLayout(p.raw.parts, stats)).length;
  const leadLayout =
    pending.some((p) => p.header && headerMerchantFirst(p.header)) ||
    leadEvidence >= Math.max(3, Math.ceil(pending.length * 0.3));
  // Nome em linha à parte: acima ou abaixo da linha com data e valor (o que for mais comum).
  const needNeighbor = pending.filter((p) =>
    p.raw.parts.every((part) => part.lead || isLocationText(part.text, { strong: true })),
  );
  const useBelow =
    needNeighbor.filter((p) => p.below).length > needNeighbor.filter((p) => p.above).length;

  const transactions: ParsedTransaction[] = [];
  const unrecognizedLines: string[] = [];
  let skippedFutureCount = 0;
  const droppedLines = new Set<number>();
  for (const p of pending) {
    if (p.raw.leadOnly && !leadLayout) {
      if (!p.skipFuture && isUnrecognized(p.line, p.tokens)) droppedLines.add(p.index);
      continue;
    }
    if (p.skipFuture) {
      skippedFutureCount += 1;
      continue;
    }
    const neighbor = useBelow ? (p.below ?? p.above) : (p.above ?? p.below);
    const tx = buildTransaction(p.raw, {
      anchor,
      ...(p.card ? { card: p.card } : {}),
      international: p.international,
      line: p.line,
      header: p.header,
      stats,
      ...(neighbor ? { neighbor } : {}),
    });
    if (!tx) continue;
    if (p.installment && !tx.installment) tx.installment = p.installment;
    if (p.foreignHint) tx.international = true;
    if (p.foreign && !tx.foreign) tx.foreign = p.foreign;
    if (p.location && !tx.location) tx.location = p.location;
    transactions.push(tx);
  }
  const allUnrecognized = [
    ...unrecognized,
    ...[...droppedLines].map((index) => ({ index, line: lineText(lines[index] ?? '') })),
  ].sort((a, b) => a.index - b.index);
  for (const u of allUnrecognized.slice(0, 200)) unrecognizedLines.push(u.line);

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
