import { addMonths, monthDiff } from '../domain/dates';
import { scopeOf } from '../domain/categories';
import type { Category, CategoryId, SpendGroup, Transaction } from '../domain/types';

/** Lançamentos que contam como gasto: compras, encargos e estornos (negativos). */
/**
 * O que conta como gasto: compras, encargos e estornos (negativos) em
 * categorias de gasto. Ficam de fora o pagamento da fatura, as entradas e as
 * movimentações neutras (aplicações, resgates, entre contas próprias).
 */
export function isSpend(t: Transaction, categories: Map<CategoryId, Category>): boolean {
  if (t.excluded) return false;
  if (t.kind !== 'compra' && t.kind !== 'encargo' && t.kind !== 'estorno') return false;
  const cat = categories.get(t.categoryId);
  return !cat?.hidden && scopeOf(cat) === 'gasto';
}

export type PeriodKey = 'all' | 'last3' | 'last6' | 'last12' | `m:${string}`;

/** Meses (yyyy-mm) cobertos por um período, dados os meses disponíveis. */
export function monthsForPeriod(period: PeriodKey, available: string[]): string[] {
  const sorted = [...available].sort();
  if (period === 'all') return sorted;
  if (period.startsWith('m:')) return sorted.filter((m) => m === period.slice(2));
  const n = period === 'last3' ? 3 : period === 'last6' ? 6 : 12;
  const latest = sorted.at(-1);
  if (!latest) return [];
  const from = addMonths(latest, -(n - 1));
  return sorted.filter((m) => m >= from);
}

export interface Filters {
  months: string[];
  card?: string;
}

export function applyFilters(txs: Transaction[], f: Filters): Transaction[] {
  const months = new Set(f.months);
  return txs.filter((t) => months.has(t.referenceMonth) && (!f.card || t.cardLast4 === f.card));
}

export interface CategoryStat {
  categoryId: CategoryId;
  totalCents: number;
  count: number;
  share: number;
  avgTicketCents: number;
  /** Total no período de comparação (quando houver). */
  previousCents?: number;
}

export function byCategory(spend: Transaction[], previous?: Transaction[]): CategoryStat[] {
  const map = new Map<CategoryId, { total: number; count: number }>();
  for (const t of spend) {
    const cur = map.get(t.categoryId) ?? { total: 0, count: 0 };
    cur.total += t.amountCents;
    if (t.kind !== 'estorno') cur.count += 1;
    map.set(t.categoryId, cur);
  }
  const prevMap = new Map<CategoryId, number>();
  for (const t of previous ?? [])
    prevMap.set(t.categoryId, (prevMap.get(t.categoryId) ?? 0) + t.amountCents);

  const positiveTotal = [...map.values()].reduce((a, v) => a + Math.max(0, v.total), 0);
  return [...map.entries()]
    .map(([categoryId, v]) => ({
      categoryId,
      totalCents: v.total,
      count: v.count,
      share: positiveTotal > 0 ? Math.max(0, v.total) / positiveTotal : 0,
      avgTicketCents: v.count > 0 ? Math.round(v.total / v.count) : 0,
      ...(previous ? { previousCents: prevMap.get(categoryId) ?? 0 } : {}),
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

export interface GroupStat {
  group: SpendGroup;
  totalCents: number;
  share: number;
}

export function byGroup(stats: CategoryStat[], categories: Map<CategoryId, Category>): GroupStat[] {
  const totals = new Map<SpendGroup, number>();
  for (const s of stats) {
    const group = categories.get(s.categoryId)?.group ?? 'outros';
    totals.set(group, (totals.get(group) ?? 0) + Math.max(0, s.totalCents));
  }
  const all = [...totals.values()].reduce((a, b) => a + b, 0);
  return (['essencial', 'estilo', 'financeiro', 'outros'] as SpendGroup[]).map((group) => ({
    group,
    totalCents: totals.get(group) ?? 0,
    share: all > 0 ? (totals.get(group) ?? 0) / all : 0,
  }));
}

export interface MonthStat {
  month: string;
  totalCents: number;
  /** Parte do total que pertence à categoria em foco (quando houver). */
  focusCents: number;
}

/** Totais por mês, preenchendo meses sem fatura com zero. */
export function byMonth(spend: Transaction[], months: string[], focus?: CategoryId): MonthStat[] {
  if (months.length === 0) return [];
  const sorted = [...months].sort();
  const first = sorted[0] ?? '';
  const last = sorted.at(-1) ?? first;
  const span = monthDiff(first, last);
  const out: MonthStat[] = [];
  for (let i = 0; i <= span; i++)
    out.push({ month: addMonths(first, i), totalCents: 0, focusCents: 0 });
  const index = new Map(out.map((m, i) => [m.month, i]));
  for (const t of spend) {
    const i = index.get(t.referenceMonth);
    if (i === undefined) continue;
    const row = out[i];
    if (!row) continue;
    row.totalCents += t.amountCents;
    if (focus && t.categoryId === focus) row.focusCents += t.amountCents;
  }
  return out;
}

export interface MerchantStat {
  name: string;
  categoryId: CategoryId;
  totalCents: number;
  count: number;
}

export function topMerchants(spend: Transaction[], limit = 10): MerchantStat[] {
  const map = new Map<string, MerchantStat>();
  for (const t of spend) {
    const key = t.merchantName.toLowerCase();
    const cur = map.get(key) ?? {
      name: t.merchantName,
      categoryId: t.categoryId,
      totalCents: 0,
      count: 0,
    };
    cur.totalCents += t.amountCents;
    if (t.kind !== 'estorno') cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()]
    .filter((m) => m.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, limit);
}

export interface Summary {
  totalCents: number;
  purchaseCount: number;
  avgTicketCents: number;
  monthCount: number;
  monthlyAvgCents: number;
  internationalCents: number;
  feesCents: number;
  refundsCents: number;
}

export function summarize(spend: Transaction[], monthCount: number): Summary {
  let total = 0;
  let purchases = 0;
  let purchaseSum = 0;
  let international = 0;
  let fees = 0;
  let refunds = 0;
  for (const t of spend) {
    total += t.amountCents;
    if (t.kind === 'compra') {
      purchases += 1;
      purchaseSum += t.amountCents;
    }
    if (t.international && t.kind !== 'estorno') international += t.amountCents;
    if (t.kind === 'encargo') fees += t.amountCents;
    if (t.kind === 'estorno') refunds += -t.amountCents;
  }
  return {
    totalCents: total,
    purchaseCount: purchases,
    avgTicketCents: purchases ? Math.round(purchaseSum / purchases) : 0,
    monthCount,
    monthlyAvgCents: monthCount ? Math.round(total / monthCount) : 0,
    internationalCents: international,
    feesCents: fees,
    refundsCents: refunds,
  };
}

/** Período imediatamente anterior, de mesmo tamanho, se houver dados. */
export function previousMonths(months: string[], available: string[]): string[] {
  if (months.length === 0) return [];
  const sorted = [...months].sort();
  const first = sorted[0] ?? '';
  const n = sorted.length;
  const set = new Set(available);
  const prev: string[] = [];
  for (let i = 1; i <= n; i++) {
    const m = addMonths(first, -i);
    if (set.has(m)) prev.push(m);
  }
  return prev.length === n ? prev.sort() : [];
}
