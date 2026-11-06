/**
 * Leitor de extrato de conta corrente em PDF.
 *
 * Diferenças para a fatura de cartão:
 *  - a data costuma aparecer só no primeiro lançamento do dia;
 *  - a descrição pode continuar na linha de baixo (ex.: nome de quem recebeu o Pix);
 *  - pode haver coluna de saldo após cada lançamento;
 *  - o sinal varia ("-150,00", "150,00 D", "+ 5.000,00", "150,00 C" ou nenhum).
 *    Quando há saldo, o sinal é deduzido da variação do saldo, que é a fonte
 *    mais confiável; sem saldo, de marcas e palavras-chave.
 *
 * Convenção interna (igual à da fatura): amountCents > 0 é saída, < 0 é entrada.
 */
import { normalizeText, prettifyDescription } from '../categorization/normalize';
import { inferYear, isValidDate, parseISO, toISO, todayISO, yearMonth } from '../domain/dates';
import type { TxKind } from '../domain/types';
import { BREAK_LINE } from './lines';
import {
  detectIssuer,
  findAccountLabel,
  findAnyFullDate,
  findBalances,
  findPeriod,
} from './metadata';
import type { ParsedStatement, ParsedTransaction } from './parseStatement';
import { tokenizeLine, type AmountToken, type DateToken, type Token } from './tokenize';

/** Pagamento da fatura do cartão: neutro (as compras já estão na fatura). */
export const CARD_PAYMENT_RE =
  /\b(PAGAMENTO|PAGTO|PGTO|PAG|DEB(ITO)? AUT(OMATICO)?|DEBITO)\s*(DE |DA |DO )?(FATURA|FAT|CARTAO|CART)\b|\bFATURA (DO |DE )?CART|\bCARTAO DE CREDITO\b|\bITAUCARD\b|\bBRADESCARD\b|\bNU PAGAMENTOS SA FATURA\b/;
/** Aplicações, resgates e transferências entre contas próprias: neutros. */
export const NEUTRAL_RE =
  /\b(APLICACAO|APLIC|RESGATE|RESG|CDB|RDB|LCI|LCA|TESOURO|POUPANCA|INVESTIMENTO|RENDE FACIL|CAIXINHA|PORQUINHO|COFRINHO|DINHEIRO GUARDADO|MESMA TITULARIDADE|ENTRE CONTAS)\b/;
export const ACCOUNT_REFUND_RE =
  /\b(ESTORNO|ESTORNADO|DEVOLUCAO|DEVOLVIDO|REEMBOLSO|CANCELAMENTO|CHARGEBACK)\b/;
export const ACCOUNT_FEE_RE =
  /\b(TARIFA|TARIFAS|TAR|CESTA|PACOTE DE SERVICOS|MENSALIDADE PACOTE|JUROS|IOF|MULTA|MORA|ENCARGOS?|CHEQUE ESPECIAL|ANUIDADE|MANUTENCAO DE CONTA)\b/;
/** Palavras que indicam entrada quando o extrato não marca o sinal. */
const CREDIT_HINT =
  /\b(RECEBID[OA]|RECEBIMENTO|RECEB|CRED|CREDITO|SALARIO|PROVENTOS|RENDIMENTOS?|RESGATE|DEPOSITO|ESTORNO|DEVOLUCAO|REEMBOLSO|ENTRADA|CASHBACK|DIVIDENDOS?)\b/;

/** Linhas de resumo/cabeçalho que não são lançamentos. */
const IGNORE_LINE =
  /^(SALDO|S A L D O|TOTAL|SUBTOTAL|LIMITE|RESUMO|ENTRADAS|SAIDAS|TOTAL DE ENTRADAS|TOTAL DE SAIDAS|VALOR DISPONIVEL|DISPONIVEL|DATA|HISTORICO|DESCRICAO|LANCAMENTOS?|MOVIMENTACOES|PERIODO|EXTRATO|AGENCIA|CPF|CNPJ|CLIENTE|TITULAR|EMITIDO|PAGINA|OUVIDORIA|SAC|ATENDIMENTO|RENDIMENTO DO PERIODO|DOCUMENTO|DOCTO|VALOR)\b/;
const FUTURE_RE = /lan[çc]amentos futuros|agendamentos|agendad[oa]s|pr[óo]ximos lan[çc]amentos/i;
const RESUME_RE = /lan[çc]amentos(?!\s+futuros)|movimenta[çc][õo]es|extrato/i;

/** Classifica uma movimentação de conta pelo texto e pela direção. */
/** Rendimento é renda mesmo quando vem da poupança/CDB. */
const YIELD_RE = /\b(RENDIMENTOS?|REND|JUROS|DIVIDENDOS?|JCP|CASHBACK)\b/;

export function classifyAccount(normalized: string, credit: boolean): TxKind {
  if (!credit && CARD_PAYMENT_RE.test(normalized)) return 'pagamento';
  if (credit && YIELD_RE.test(normalized)) return 'receita';
  if (NEUTRAL_RE.test(normalized)) return 'transferencia';
  if (credit) return ACCOUNT_REFUND_RE.test(normalized) ? 'estorno' : 'receita';
  return ACCOUNT_FEE_RE.test(normalized) ? 'encargo' : 'compra';
}

/** Limpa CPF/CNPJ mascarados e dados bancários do destinatário. */
export function cleanAccountDescription(text: string): string {
  return text
    .replace(/[•*xX]{2,}[\d.•*xX-]*/g, ' ')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, ' ')
    .replace(/\s+-\s+(BCO|BANCO|AG[EÊ]NCIA|AG\.?)\b.*$/i, '')
    .replace(/\s*-\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface DraftTx {
  day: number;
  month: number;
  year?: number;
  text: string;
  movement: AmountToken;
  balance?: AmountToken;
  credit?: boolean;
  line: string;
  continuationCount: number;
}

function signFromMarks(t: AmountToken): boolean | undefined {
  if (t.minus || t.debitMark) return false;
  if (t.plus || t.creditMark) return true;
  return undefined;
}

function signedBalance(t: AmountToken): number {
  return t.minus || t.debitMark ? -t.abs : t.abs;
}

export function parseAccountText(lines: string[], opts: { today?: Date } = {}): ParsedStatement {
  const fullText = lines.filter((l) => l !== BREAK_LINE).join('\n');
  const issuer = detectIssuer(fullText);
  const period = findPeriod(fullText);
  const balances = findBalances(fullText);
  const accountLabel = findAccountLabel(fullText);
  const anchor = period.end ?? findAnyFullDate(fullText) ?? todayISO(opts.today);

  const drafts: DraftTx[] = [];
  const unrecognizedLines: string[] = [];
  let current: DateToken | undefined;
  let skipFuture = false;
  let skippedFutureCount = 0;
  let lastWasTx = false;

  for (const line of lines) {
    if (line === BREAK_LINE) {
      lastWasTx = false;
      continue;
    }
    const tokens: Token[] = tokenizeLine(line);
    const first = tokens[0];
    if (first?.kind === 'date') current = first;
    const amounts = tokens.filter(
      (t): t is AmountToken => t.kind === 'amount' && t.currency !== 'USD' && t.currency !== 'EUR',
    );
    const texts = tokens
      .filter((t) => t.kind === 'text')
      .map((t) => (t.kind === 'text' ? t.value : ''));
    const text = texts.join(' ').replace(/\s+/g, ' ').trim();
    const normalized = normalizeText(text);

    if (amounts.length === 0) {
      if (FUTURE_RE.test(line)) {
        skipFuture = true;
      } else if (skipFuture && RESUME_RE.test(line)) {
        skipFuture = false;
      } else if (
        lastWasTx &&
        text.length >= 3 &&
        text.length <= 90 &&
        !IGNORE_LINE.test(normalized) &&
        first?.kind !== 'date'
      ) {
        // Continuação da descrição (ex.: "MARIA DA SILVA - •••.456.789-••").
        const last = drafts.at(-1);
        if (last && last.continuationCount < 2) {
          last.text = `${last.text} ${text}`;
          last.continuationCount += 1;
          continue;
        }
      }
      lastWasTx = false;
      continue;
    }

    if (!current || !text || IGNORE_LINE.test(normalized) || /%/.test(line)) {
      lastWasTx = false;
      continue;
    }
    if (skipFuture) {
      skippedFutureCount += 1;
      lastWasTx = false;
      continue;
    }
    const movement = amounts[0];
    if (!movement || movement.abs === 0) {
      lastWasTx = false;
      continue;
    }
    const balance = amounts.length >= 2 ? amounts.at(-1) : undefined;
    const credit = signFromMarks(movement);
    drafts.push({
      day: current.day,
      month: current.month,
      ...(current.year ? { year: current.year } : {}),
      text,
      movement,
      ...(balance ? { balance } : {}),
      ...(credit !== undefined ? { credit } : {}),
      line,
      continuationCount: 0,
    });
    lastWasTx = true;
  }

  // Sinal pela variação do saldo (quando o extrato traz saldo por linha).
  let running = balances.opening;
  for (const d of drafts) {
    if (d.balance) {
      const bal = signedBalance(d.balance);
      if (running !== undefined && d.credit === undefined) {
        if (Math.abs(running + d.movement.abs - bal) <= 1) d.credit = true;
        else if (Math.abs(running - d.movement.abs - bal) <= 1) d.credit = false;
      }
      running = bal;
    } else if (running !== undefined && d.credit !== undefined) {
      running += d.credit ? d.movement.abs : -d.movement.abs;
    } else {
      running = undefined;
    }
  }

  const transactions: ParsedTransaction[] = [];
  for (const d of drafts) {
    const description = cleanAccountDescription(d.text);
    const normalized = normalizeText(description);
    if (!normalized) continue;
    const credit =
      d.credit ?? (CARD_PAYMENT_RE.test(normalized) ? false : CREDIT_HINT.test(normalized));
    const kind = classifyAccount(normalized, credit);
    const year = d.year ?? inferYear(d.day, d.month, anchor);
    let day = d.day;
    while (day > 28 && !isValidDate(year, d.month, day)) day--;
    transactions.push({
      date: toISO(year, d.month, day),
      description: prettifyDescription(description),
      rawDescription: description,
      amountCents: credit ? -d.movement.abs : d.movement.abs,
      kind,
      international: false,
      sourceLine: d.line,
      ...(d.balance ? { balanceCents: signedBalance(d.balance) } : {}),
    });
  }

  const latest = transactions
    .map((t) => t.date)
    .sort()
    .at(-1);
  const end = period.end ?? latest;
  const ref = end ? parseISO(end) : parseISO(anchor);
  const warnings: string[] = [];
  if (transactions.length === 0) {
    warnings.push(
      'Nenhuma movimentação foi reconhecida. O PDF pode ser digitalizado (imagem) ou ter um layout ainda não suportado.',
    );
  }
  const unsure = drafts.filter((d) => d.credit === undefined).length;
  if (unsure > 0 && transactions.length > 0) {
    warnings.push(
      `${unsure} ${unsure === 1 ? 'movimentação teve' : 'movimentações tiveram'} o sinal (entrada/saída) deduzido pela descrição. Confira na lista.`,
    );
  }

  return {
    issuer,
    accountType: 'conta',
    format: 'pdf',
    referenceMonth: yearMonth(ref.y, ref.m),
    referenceEstimated: !period.end,
    transactions,
    unrecognizedLines,
    skippedFutureCount,
    warnings,
    ...(period.start ? { periodStart: period.start } : {}),
    ...(period.end ? { periodEnd: period.end } : {}),
    ...(balances.opening !== undefined ? { openingBalanceCents: balances.opening } : {}),
    ...(balances.closing !== undefined ? { closingBalanceCents: balances.closing } : {}),
    ...(accountLabel ? { accountLabel } : {}),
  };
}
