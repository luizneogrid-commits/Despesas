import { addMonths, monthDiff } from '../domain/dates';
import type { Transaction } from '../domain/types';

export interface CashflowMonth {
  month: string;
  /** Entradas (salário, Pix recebido, rendimentos). */
  inCents: number;
  /** Saídas de consumo na conta (compras no débito, Pix, boletos, saques, tarifas), já com estornos. */
  spendCents: number;
  /** Pagamento da fatura do cartão. */
  cardPaymentCents: number;
  /** Aplicações menos resgates (positivo = guardou dinheiro). */
  savedCents: number;
  /** Variação do saldo no mês (entradas − todas as saídas). */
  netCents: number;
}

/**
 * Fluxo da conta corrente por mês. O pagamento da fatura aparece separado:
 * as compras do cartão já estão no perfil de gasto, então somá-lo como gasto
 * contaria tudo duas vezes.
 */
export function cashflowByMonth(txs: Transaction[], months?: string[]): CashflowMonth[] {
  const account = txs.filter((t) => t.source === 'conta' && !t.excluded);
  if (account.length === 0) return [];
  const all = [...new Set(account.map((t) => t.referenceMonth))].sort();
  const first = months?.length ? ([...months].sort()[0] ?? all[0]) : all[0];
  const last = months?.length ? ([...months].sort().at(-1) ?? all.at(-1)) : all.at(-1);
  if (!first || !last) return [];
  const out: CashflowMonth[] = [];
  for (let i = 0; i <= monthDiff(first, last); i++) {
    out.push({
      month: addMonths(first, i),
      inCents: 0,
      spendCents: 0,
      cardPaymentCents: 0,
      savedCents: 0,
      netCents: 0,
    });
  }
  const idx = new Map(out.map((m, i) => [m.month, i]));
  for (const t of account) {
    const i = idx.get(t.referenceMonth);
    const row = i === undefined ? undefined : out[i];
    if (!row) continue;
    row.netCents -= t.amountCents;
    if (t.kind === 'receita') row.inCents += -t.amountCents;
    else if (t.kind === 'pagamento') row.cardPaymentCents += t.amountCents;
    else if (t.kind === 'transferencia') row.savedCents += t.amountCents;
    else row.spendCents += t.amountCents;
  }
  return out;
}

export interface CashflowSummary {
  inCents: number;
  spendCents: number;
  cardPaymentCents: number;
  savedCents: number;
  netCents: number;
  months: number;
}

export function summarizeCashflow(rows: CashflowMonth[]): CashflowSummary {
  return rows.reduce<CashflowSummary>(
    (a, r) => ({
      inCents: a.inCents + r.inCents,
      spendCents: a.spendCents + r.spendCents,
      cardPaymentCents: a.cardPaymentCents + r.cardPaymentCents,
      savedCents: a.savedCents + r.savedCents,
      netCents: a.netCents + r.netCents,
      months: a.months + 1,
    }),
    { inCents: 0, spendCents: 0, cardPaymentCents: 0, savedCents: 0, netCents: 0, months: 0 },
  );
}
