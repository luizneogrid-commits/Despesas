import type { CategoryId, Transaction } from '../domain/types';

export interface Subscription {
  name: string;
  categoryId: CategoryId;
  monthlyCents: number;
  monthsSeen: number;
  lastDate: string;
  /** Fatura (yyyy-mm) da última cobrança. */
  lastMonth: string;
  /** confirmada = vista em 2+ faturas com valor estável; provável = 1 fatura, categoria típica. */
  confidence: 'confirmada' | 'provavel';
}

const SUBSCRIPTION_CATEGORIES = new Set(['streaming', 'assinaturas', 'academia']);
const NEVER_RECURRING = new Set([
  'supermercado',
  'restaurantes',
  'delivery',
  'mobilidade',
  'outros',
  'tarifas',
]);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/**
 * Detecta gastos recorrentes (assinaturas): o mesmo estabelecimento, no
 * máximo duas vezes por fatura, com valor estável em 2+ faturas.
 */
export function detectSubscriptions(spend: Transaction[]): Subscription[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of spend) {
    if (t.kind !== 'compra' || t.installment) continue;
    const key = t.merchantName.toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const out: Subscription[] = [];
  for (const list of groups.values()) {
    const first = list[0];
    if (!first) continue;
    const categoryId = first.categoryId;
    const perMonth = new Map<string, Transaction[]>();
    for (const t of list) {
      const arr = perMonth.get(t.referenceMonth) ?? [];
      arr.push(t);
      perMonth.set(t.referenceMonth, arr);
    }
    const maxPerMonth = Math.max(...[...perMonth.values()].map((a) => a.length));
    if (maxPerMonth > 2) continue;

    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted.at(-1) ?? first;
    const monthsSeen = perMonth.size;
    const amounts = [...perMonth.values()].map((a) => Math.max(...a.map((t) => t.amountCents)));
    const med = median(amounts);
    // Assinaturas típicas toleram reajuste (±25%); outras categorias exigem valor quase fixo.
    const tolerance = SUBSCRIPTION_CATEGORIES.has(categoryId) ? 0.25 : 0.1;
    const stable = med > 0 && amounts.every((a) => Math.abs(a - med) / med <= tolerance);

    if (monthsSeen >= 2 && stable && !NEVER_RECURRING.has(categoryId)) {
      out.push({
        name: latest.merchantName,
        categoryId,
        monthlyCents: latest.amountCents,
        monthsSeen,
        lastDate: latest.date,
        lastMonth: latest.referenceMonth,
        confidence: 'confirmada',
      });
    } else if (SUBSCRIPTION_CATEGORIES.has(categoryId) && maxPerMonth === 1) {
      out.push({
        name: latest.merchantName,
        categoryId,
        monthlyCents: latest.amountCents,
        monthsSeen,
        lastDate: latest.date,
        lastMonth: latest.referenceMonth,
        confidence: 'provavel',
      });
    }
  }
  return out.sort((a, b) => b.monthlyCents - a.monthlyCents);
}
