import { categorize, type CompiledRule } from '../categorization/categorizer';
import { displayMerchant, merchantKey, prettifyDescription } from '../categorization/normalize';
import type { Statement, Transaction } from '../domain/types';
import { parseStatementText, spendingTotal, type ParsedStatement } from '../parsing/parseStatement';
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
}

/** Cria um lançamento de domínio a partir do texto extraído, já categorizado. */
export function toTransaction(
  p: Pick<
    Transaction,
    | 'date'
    | 'rawDescription'
    | 'amountCents'
    | 'kind'
    | 'international'
    | 'installment'
    | 'foreign'
    | 'cardLast4'
  > & { description?: string },
  ids: { id: string; statementId: string; referenceMonth: string },
  rules: CompiledRule[],
): Transaction {
  const result = categorize(p.rawDescription, p.kind, rules);
  const key = merchantKey(p.rawDescription);
  return {
    id: ids.id,
    statementId: ids.statementId,
    referenceMonth: ids.referenceMonth,
    date: p.date,
    description: p.description ?? prettifyDescription(p.rawDescription),
    rawDescription: p.rawDescription,
    merchantKey: key,
    merchantName: result.brand ?? displayMerchant(p.rawDescription),
    amountCents: p.amountCents,
    kind: p.kind,
    ...(p.installment ? { installment: p.installment } : {}),
    international: p.international,
    ...(p.foreign ? { foreign: p.foreign } : {}),
    ...(p.cardLast4 ? { cardLast4: p.cardLast4 } : {}),
    categoryId: result.categoryId,
    categorySource: result.source,
    ...(result.ruleId ? { ruleId: result.ruleId } : {}),
  };
}

export function buildDraft(
  parsed: ParsedStatement,
  meta: FileMeta,
  rules: CompiledRule[],
  existing: Statement[],
): ImportDraft {
  const statementId = uid('fat');
  const transactions = parsed.transactions.map((t, i) =>
    toTransaction(
      t,
      { id: `${statementId}-${i}`, statementId, referenceMonth: parsed.referenceMonth },
      rules,
    ),
  );
  const statement: Statement = {
    id: statementId,
    fileName: meta.fileName,
    fileHash: meta.fileHash,
    issuerId: parsed.issuer.id,
    issuerName: parsed.issuer.name,
    referenceMonth: parsed.referenceMonth,
    ...(parsed.dueDate ? { dueDate: parsed.dueDate } : {}),
    ...(parsed.closingDate ? { closingDate: parsed.closingDate } : {}),
    ...(parsed.declaredTotalCents !== undefined
      ? { declaredTotalCents: parsed.declaredTotalCents }
      : {}),
    parsedTotalCents: spendingTotal(parsed.transactions),
    transactionCount: transactions.length,
    importedAt: new Date().toISOString(),
    warnings: parsed.warnings,
  };
  const { duplicateOf, sameMonthAs } = findConflicts(statement, existing);
  return {
    id: statementId,
    statement,
    transactions,
    unrecognizedLines: parsed.unrecognizedLines,
    skippedFutureCount: parsed.skippedFutureCount,
    referenceEstimated: parsed.referenceEstimated,
    ...(duplicateOf ? { duplicateOf } : {}),
    ...(sameMonthAs ? { sameMonthAs } : {}),
  };
}

/**
 * Conflitos com faturas já importadas: o mesmo arquivo (duplicata certa) ou o
 * mesmo emissor conhecido no mesmo mês (provável reemissão da fatura).
 */
export function findConflicts(
  statement: Statement,
  existing: Statement[],
): { duplicateOf?: Statement; sameMonthAs?: Statement } {
  const real = existing.filter((s) => !s.isDemo && s.id !== statement.id);
  const duplicateOf = real.find((s) => s.fileHash === statement.fileHash);
  if (duplicateOf) return { duplicateOf };
  const sameMonthAs =
    statement.issuerId !== 'generico'
      ? real.find(
          (s) => s.issuerId === statement.issuerId && s.referenceMonth === statement.referenceMonth,
        )
      : undefined;
  return sameMonthAs ? { sameMonthAs } : {};
}

/** Muda o mês de referência de um rascunho (quando o vencimento foi estimado). */
export function withReferenceMonth(draft: ImportDraft, month: string): ImportDraft {
  return {
    ...draft,
    statement: { ...draft.statement, referenceMonth: month },
    transactions: draft.transactions.map((t) => ({ ...t, referenceMonth: month })),
  };
}

export type ReconciliationStatus = 'confere' | 'diferente' | 'sem-total';

/** Compara a soma lida com o total impresso na fatura. */
export function reconcile(statement: Statement): {
  status: ReconciliationStatus;
  diffCents: number;
} {
  if (statement.declaredTotalCents === undefined) return { status: 'sem-total', diffCents: 0 };
  const diff = statement.parsedTotalCents - statement.declaredTotalCents;
  const tolerance = Math.max(100, Math.abs(statement.declaredTotalCents) * 0.005);
  return { status: Math.abs(diff) <= tolerance ? 'confere' : 'diferente', diffCents: diff };
}

/** Lê o arquivo, extrai o texto do PDF e monta o rascunho para revisão. */
export async function processPdfFile(
  file: File,
  opts: { password?: string; rules: CompiledRule[]; existing: Statement[] },
): Promise<ImportDraft> {
  const buffer = await file.arrayBuffer();
  const fileHash = await sha256Hex(buffer);
  // Import dinâmico: o pdf.js (~400 kB) só é carregado quando o usuário importa.
  const { readPdfLines } = await import('../parsing/pdf');
  const { lines } = await readPdfLines(buffer, opts.password);
  const parsed = parseStatementText(lines);
  return buildDraft(parsed, { fileName: file.name, fileHash }, opts.rules, opts.existing);
}
