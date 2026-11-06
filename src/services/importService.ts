import { categorize, type CompiledRule } from '../categorization/categorizer';
import {
  displayMerchant,
  merchantKey,
  normalizeText,
  prettifyDescription,
} from '../categorization/normalize';
import type { AccountType, Statement, Transaction } from '../domain/types';
import { parseCSVStatement } from '../parsing/csvStatement';
import { UnsupportedFileError } from '../parsing/errors';
import { isOFX, parseOFX } from '../parsing/ofx';
import { parseStatementText, spendingTotal, type ParsedStatement } from '../parsing/parseStatement';
import { decodeText } from '../utils/decodeText';
import { sha256Hex } from '../utils/hash';
import { uid } from '../utils/id';

export interface ImportDraft {
  id: string;
  statement: Statement;
  transactions: Transaction[];
  unrecognizedLines: string[];
  skippedFutureCount: number;
  referenceEstimated: boolean;
  /** Mesma fatura (mesmo arquivo) já importada. */
  duplicateOf?: Statement;
  /** Outra fatura do mesmo emissor e mês já importada (pode ser reemissão). */
  sameMonthAs?: Statement;
}

export interface FileMeta {
  fileName: string;
  fileHash: string;
  origin?: Statement['origin'];
}

export type FileFormat = 'pdf' | 'ofx' | 'csv';

/**
 * Versão do leitor. 2: nome do estabelecimento separado da cidade/país.
 * Um arquivo já importado por uma versão anterior pode ser lido de novo.
 */
export const READER_VERSION = 2;

/** A importação foi feita por um leitor anterior e ganharia com uma nova leitura? */
export function isOutdatedRead(statement: Statement): boolean {
  return !statement.isDemo && (statement.readerVersion ?? 1) < READER_VERSION;
}

/** Formatos aceitos, pela extensão (ou tipo MIME). */
export function fileFormat(file: Pick<File, 'name' | 'type'>): FileFormat | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.ofx') || name.endsWith('.qfx')) return 'ofx';
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') return 'csv';
  return null;
}

type ParsedTx = ParsedStatement['transactions'][number];

/** Cria um lançamento de domínio a partir do que foi lido, já categorizado. */
export function toTransaction(
  p: Pick<ParsedTx, 'date' | 'rawDescription' | 'amountCents' | 'kind' | 'international'> &
    Partial<
      Pick<
        ParsedTx,
        'installment' | 'foreign' | 'cardLast4' | 'balanceCents' | 'externalId' | 'location'
      >
    > & {
      description?: string;
    },
  ids: { id: string; statementId: string; referenceMonth: string; source?: AccountType },
  rules: CompiledRule[],
): Transaction {
  const result = categorize(p.rawDescription, p.kind, rules, p.amountCents);
  return {
    id: ids.id,
    statementId: ids.statementId,
    referenceMonth: ids.referenceMonth,
    date: p.date,
    description: p.description ?? prettifyDescription(p.rawDescription),
    rawDescription: p.rawDescription,
    merchantKey: merchantKey(p.rawDescription),
    merchantName: result.brand ?? displayMerchant(p.rawDescription),
    amountCents: p.amountCents,
    kind: result.kind ?? p.kind,
    parsedKind: p.kind,
    ...(p.installment ? { installment: p.installment } : {}),
    international: p.international,
    ...(p.foreign ? { foreign: p.foreign } : {}),
    ...(p.cardLast4 ? { cardLast4: p.cardLast4 } : {}),
    ...(p.location ? { location: p.location } : {}),
    ...(p.balanceCents !== undefined ? { balanceCents: p.balanceCents } : {}),
    ...(p.externalId ? { externalId: p.externalId } : {}),
    ...(ids.source === 'conta' ? { source: 'conta' as const } : {}),
    categoryId: result.categoryId,
    categorySource: result.source,
    ...(result.ruleId ? { ruleId: result.ruleId } : {}),
  };
}

function dedupeKey(
  t: Pick<Transaction, 'externalId' | 'date' | 'amountCents' | 'rawDescription'>,
): string {
  return t.externalId
    ? `id:${t.externalId}`
    : `${t.date}|${t.amountCents}|${normalizeText(t.rawDescription)}`;
}

/**
 * Extratos de conta se sobrepõem (ex.: um PDF por semana com o mês até hoje).
 * Remove as movimentações que já existem de outro extrato da mesma conta,
 * respeitando repetições legítimas (dois Pix iguais no mesmo dia).
 */
export function dedupeAccountTransactions(
  incoming: Transaction[],
  existing: Transaction[],
): { kept: Transaction[]; skipped: number } {
  const counts = new Map<string, number>();
  for (const t of existing) {
    if (t.source !== 'conta') continue;
    const k = dedupeKey(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const kept: Transaction[] = [];
  let skipped = 0;
  for (const t of incoming) {
    const k = dedupeKey(t);
    const n = counts.get(k) ?? 0;
    if (n > 0) {
      counts.set(k, n - 1);
      skipped += 1;
    } else kept.push(t);
  }
  return { kept, skipped };
}

export function buildDraft(
  parsed: ParsedStatement,
  meta: FileMeta,
  rules: CompiledRule[],
  existing: Statement[],
  existingTransactions: Transaction[] = [],
): ImportDraft {
  const statementId = uid('doc');
  const accountType: AccountType = parsed.accountType ?? 'cartao';
  const isAccount = accountType === 'conta';
  const all = parsed.transactions.map((t, i) =>
    toTransaction(
      t,
      {
        id: `${statementId}-${i}`,
        statementId,
        // Conta: cada movimentação conta no mês em que aconteceu. Cartão: no mês da fatura.
        referenceMonth: isAccount ? t.date.slice(0, 7) : parsed.referenceMonth,
        source: accountType,
      },
      rules,
    ),
  );
  const sameAccount = existing.filter(
    (s) => s.accountType === 'conta' && s.issuerId === parsed.issuer.id && !s.isDemo,
  );
  const ownIds = new Set(sameAccount.map((s) => s.id));
  const { kept, skipped } = isAccount
    ? dedupeAccountTransactions(
        all,
        existingTransactions.filter((t) => ownIds.has(t.statementId)),
      )
    : { kept: all, skipped: 0 };
  const netMovementCents = parsed.transactions.reduce((a, t) => a - t.amountCents, 0);

  const statement: Statement = {
    id: statementId,
    fileName: meta.fileName,
    fileHash: meta.fileHash,
    issuerId: parsed.issuer.id,
    issuerName: parsed.issuer.name,
    referenceMonth: parsed.referenceMonth,
    accountType,
    ...(parsed.format ? { format: parsed.format } : {}),
    ...(meta.origin ? { origin: meta.origin } : {}),
    ...(parsed.dueDate ? { dueDate: parsed.dueDate } : {}),
    ...(parsed.closingDate ? { closingDate: parsed.closingDate } : {}),
    ...(parsed.declaredTotalCents !== undefined
      ? { declaredTotalCents: parsed.declaredTotalCents }
      : {}),
    ...(parsed.periodStart ? { periodStart: parsed.periodStart } : {}),
    ...(parsed.periodEnd ? { periodEnd: parsed.periodEnd } : {}),
    ...(parsed.openingBalanceCents !== undefined
      ? { openingBalanceCents: parsed.openingBalanceCents }
      : {}),
    ...(parsed.closingBalanceCents !== undefined
      ? { closingBalanceCents: parsed.closingBalanceCents }
      : {}),
    ...(parsed.accountLabel ? { accountLabel: parsed.accountLabel } : {}),
    ...(isAccount ? { netMovementCents } : {}),
    ...(skipped > 0 ? { skippedDuplicates: skipped } : {}),
    readerVersion: READER_VERSION,
    parsedTotalCents: spendingTotal(kept),
    transactionCount: kept.length,
    importedAt: new Date().toISOString(),
    warnings: parsed.warnings,
  };
  const { duplicateOf, sameMonthAs } = findConflicts(statement, existing);
  return {
    id: statementId,
    statement,
    transactions: kept,
    unrecognizedLines: parsed.unrecognizedLines,
    skippedFutureCount: parsed.skippedFutureCount,
    referenceEstimated: parsed.referenceEstimated,
    ...(duplicateOf ? { duplicateOf } : {}),
    ...(sameMonthAs ? { sameMonthAs } : {}),
  };
}

/**
 * Conflitos com documentos já importados: o mesmo arquivo (duplicata certa)
 * ou, para faturas, o mesmo emissor conhecido no mesmo mês (provável
 * reemissão). Extratos de conta se sobrepõem por natureza e são tratados
 * lançamento a lançamento.
 */
export function findConflicts(
  statement: Statement,
  existing: Statement[],
): { duplicateOf?: Statement; sameMonthAs?: Statement } {
  const real = existing.filter((s) => !s.isDemo && s.id !== statement.id);
  const duplicateOf = real.find((s) => s.fileHash === statement.fileHash);
  if (duplicateOf) return { duplicateOf };
  if (statement.accountType === 'conta') return {};
  const sameMonthAs =
    statement.issuerId !== 'generico'
      ? real.find(
          (s) =>
            s.accountType !== 'conta' &&
            s.issuerId === statement.issuerId &&
            s.referenceMonth === statement.referenceMonth,
        )
      : undefined;
  return sameMonthAs ? { sameMonthAs } : {};
}

/** Muda o mês de referência de uma fatura (quando o vencimento foi estimado). */
export function withReferenceMonth(draft: ImportDraft, month: string): ImportDraft {
  const isAccount = draft.statement.accountType === 'conta';
  return {
    ...draft,
    statement: { ...draft.statement, referenceMonth: month },
    transactions: isAccount
      ? draft.transactions
      : draft.transactions.map((t) => ({ ...t, referenceMonth: month })),
  };
}

export type ReconciliationStatus = 'confere' | 'diferente' | 'sem-total';

/**
 * Fatura: soma lida × total impresso. Extrato: saldo anterior + movimentações
 * = saldo final.
 */
export function reconcile(statement: Statement): {
  status: ReconciliationStatus;
  diffCents: number;
} {
  if (statement.accountType === 'conta') {
    const { openingBalanceCents: o, closingBalanceCents: c, netMovementCents: n } = statement;
    if (o === undefined || c === undefined || n === undefined)
      return { status: 'sem-total', diffCents: 0 };
    const diff = o + n - c;
    return { status: Math.abs(diff) <= 1 ? 'confere' : 'diferente', diffCents: diff };
  }
  if (statement.declaredTotalCents === undefined) return { status: 'sem-total', diffCents: 0 };
  const diff = statement.parsedTotalCents - statement.declaredTotalCents;
  const tolerance = Math.max(100, Math.abs(statement.declaredTotalCents) * 0.005);
  return { status: Math.abs(diff) <= tolerance ? 'confere' : 'diferente', diffCents: diff };
}

export interface ProcessOptions {
  password?: string;
  rules: CompiledRule[];
  existing: Statement[];
  existingTransactions?: Transaction[];
  /** Corrige a detecção automática (fatura × extrato). */
  forceType?: AccountType;
  origin?: Statement['origin'];
}

/** Lê o arquivo (PDF, OFX ou CSV) e monta o rascunho para revisão. */
export async function processFile(file: File, opts: ProcessOptions): Promise<ImportDraft> {
  const format = fileFormat(file);
  if (!format) throw new UnsupportedFileError();
  const buffer = await file.arrayBuffer();
  const fileHash = await sha256Hex(buffer);
  let parsed: ParsedStatement;
  if (format === 'pdf') {
    // Import dinâmico: o pdf.js (~400 kB) só é carregado quando o usuário importa.
    const { readPdfLines } = await import('../parsing/pdf');
    const { lines } = await readPdfLines(buffer, opts.password);
    parsed = parseStatementText(lines, opts.forceType ? { forceType: opts.forceType } : {});
  } else {
    const text = decodeText(buffer);
    if (format === 'ofx' || isOFX(text)) parsed = parseOFX(text);
    else
      parsed = parseCSVStatement(text, {
        fileName: file.name,
        ...(opts.forceType ? { forceType: opts.forceType } : {}),
      });
  }
  return buildDraft(
    parsed,
    { fileName: file.name, fileHash, ...(opts.origin ? { origin: opts.origin } : {}) },
    opts.rules,
    opts.existing,
    opts.existingTransactions ?? [],
  );
}
