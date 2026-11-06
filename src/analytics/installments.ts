import { addMonths, monthDiff } from '../domain/dates';
import type { CategoryId, Statement, Transaction } from '../domain/types';
import type { Subscription } from './recurring';

export interface InstallmentPlan {
  id: string;
  name: string;
  categoryId: CategoryId;
  purchaseDate: string;
  installmentCents: number;
  current: number;
  total: number;
  remaining: number;
  /** Ainda a pagar nas próximas faturas. */
  remainingCents: number;
  /** Já cobrado (parcelas até a fatura atual, inclusive). */
  paidCents: number;
  /** Valor total da compra parcelada. */
  purchaseCents: number;
  /** Fatura de onde a parcela foi lida. */
  baseMonth: string;
  /** Mês (yyyy-mm) da última parcela. */
  endsMonth: string;
  cardLast4?: string;
  issuerName?: string;
}

export interface ScheduleMonth {
  month: string;
  totalCents: number;
  /** Quantas parcelas caem neste mês. */
  count: number;
  /** Compras cuja última parcela cai neste mês. */
  ending: string[];
}

export interface InstallmentOutlook {
  /** Fatura mais recente considerada. */
  baseMonth?: string;
  plans: InstallmentPlan[];
  schedule: ScheduleMonth[];
  totalRemainingCents: number;
  purchaseTotalCents: number;
  paidCents: number;
  /** Mês da última parcela de todas. */
  endsMonth?: string;
}

/**
 * Projeção das parcelas futuras. Para cada emissor/cartão usa a fatura mais
 * recente importada: uma compra "3/10" ainda tem 7 parcelas a cair, uma por
 * fatura, a partir do mês seguinte. Assim, faturas de bancos diferentes com
 * meses diferentes não se atrapalham.
 */
export function installmentOutlook(
  txs: Transaction[],
  statements: Statement[] = [],
): InstallmentOutlook {
  const issuerOf = new Map(statements.map((s) => [s.id, s]));
  const groupOf = (t: Transaction) => issuerOf.get(t.statementId)?.issuerId ?? 'todos';

  const latestByGroup = new Map<string, string>();
  for (const t of txs) {
    const g = groupOf(t);
    const cur = latestByGroup.get(g);
    if (!cur || t.referenceMonth > cur) latestByGroup.set(g, t.referenceMonth);
  }
  const baseMonth = [...latestByGroup.values()].sort().at(-1);
  if (!baseMonth) {
    return { plans: [], schedule: [], totalRemainingCents: 0, purchaseTotalCents: 0, paidCents: 0 };
  }

  const plans: InstallmentPlan[] = [];
  for (const t of txs) {
    if (!t.installment || t.kind !== 'compra' || t.excluded) continue;
    if (t.referenceMonth !== latestByGroup.get(groupOf(t))) continue;
    const { current, total } = t.installment;
    const remaining = total - current;
    if (remaining <= 0) continue;
    const st = issuerOf.get(t.statementId);
    plans.push({
      id: t.id,
      name: t.merchantName,
      categoryId: t.categoryId,
      purchaseDate: t.date,
      installmentCents: t.amountCents,
      current,
      total,
      remaining,
      remainingCents: remaining * t.amountCents,
      paidCents: current * t.amountCents,
      purchaseCents: total * t.amountCents,
      baseMonth: t.referenceMonth,
      endsMonth: addMonths(t.referenceMonth, remaining),
      ...(t.cardLast4 ? { cardLast4: t.cardLast4 } : {}),
      ...(st && !st.isDemo ? { issuerName: st.issuerName } : {}),
    });
  }
  plans.sort((a, b) => b.remainingCents - a.remainingCents);

  const byMonth = new Map<string, ScheduleMonth>();
  for (const p of plans) {
    for (let i = 1; i <= p.remaining; i++) {
      const month = addMonths(p.baseMonth, i);
      const row = byMonth.get(month) ?? { month, totalCents: 0, count: 0, ending: [] };
      row.totalCents += p.installmentCents;
      row.count += 1;
      if (i === p.remaining) row.ending.push(p.name);
      byMonth.set(month, row);
    }
  }
  const schedule = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  const endsMonth = plans
    .map((p) => p.endsMonth)
    .sort()
    .at(-1);

  return {
    baseMonth,
    plans,
    schedule,
    totalRemainingCents: plans.reduce((a, p) => a + p.remainingCents, 0),
    purchaseTotalCents: plans.reduce((a, p) => a + p.purchaseCents, 0),
    paidCents: plans.reduce((a, p) => a + p.paidCents, 0),
    ...(endsMonth ? { endsMonth } : {}),
  };
}

export interface CommitmentMonth {
  month: string;
  installmentsCents: number;
  subscriptionsCents: number;
  totalCents: number;
}

/**
 * Quanto de cada fatura futura já está comprometido: parcelas (certas) e,
 * opcionalmente, assinaturas ativas (recorrentes, valor da última cobrança).
 */
export function projectCommitments(
  outlook: InstallmentOutlook,
  subscriptions: Subscription[],
  opts: { includeSubscriptions?: boolean; minMonths?: number; maxMonths?: number } = {},
): CommitmentMonth[] {
  const base = outlook.baseMonth;
  if (!base) return [];
  const minMonths = opts.minMonths ?? 6;
  const maxMonths = opts.maxMonths ?? 24;
  // Começa no mês seguinte à fatura mais recente, ou antes, se um cartão com
  // fatura mais antiga ainda tiver parcela a vencer nesse intervalo.
  const firstScheduled = outlook.schedule[0]?.month;
  const start =
    firstScheduled && firstScheduled < addMonths(base, 1) ? firstScheduled : addMonths(base, 1);
  const untilEnd = outlook.endsMonth ? monthDiff(start, outlook.endsMonth) + 1 : 0;
  const horizon = Math.min(maxMonths, Math.max(minMonths, untilEnd));
  const active = opts.includeSubscriptions
    ? subscriptions.filter((s) => s.lastMonth >= addMonths(base, -1))
    : [];
  const subsMonthly = active.reduce((a, s) => a + s.monthlyCents, 0);
  const sched = new Map(outlook.schedule.map((m) => [m.month, m.totalCents]));
  const out: CommitmentMonth[] = [];
  for (let i = 0; i < horizon; i++) {
    const month = addMonths(start, i);
    const inst = sched.get(month) ?? 0;
    out.push({
      month,
      installmentsCents: inst,
      subscriptionsCents: subsMonthly,
      totalCents: inst + subsMonthly,
    });
  }
  return out;
}
