import { useMemo } from 'react';
import {
  applyFilters,
  byCategory,
  byGroup,
  byMonth,
  isSpend,
  monthsForPeriod,
  previousMonths,
  summarize,
  topMerchants,
} from '../analytics/aggregate';
import { buildInsights } from '../analytics/insights';
import { cashflowByMonth, summarizeCashflow } from '../analytics/cashflow';
import { installmentOutlook } from '../analytics/installments';
import { detectSubscriptions } from '../analytics/recurring';
import { BUILTIN_CATEGORIES, buildCategoryIndex } from '../domain/categories';
import type { Category } from '../domain/types';
import { useAppStore } from '../store/appStore';
import { useUiStore } from './uiStore';

export function useCategories() {
  const custom = useAppStore((s) => s.customCategories);
  return useMemo(() => {
    const tail = ['outros', 'pagamentos', 'movimentacoes'];
    const income = BUILTIN_CATEGORIES.filter((c) => c.group === 'receita');
    const list: Category[] = [
      ...BUILTIN_CATEGORIES.filter((c) => !tail.includes(c.id) && c.group !== 'receita'),
      ...custom,
      ...BUILTIN_CATEGORIES.filter((c) => c.id === 'outros'),
      ...income,
      ...BUILTIN_CATEGORIES.filter((c) => c.id === 'pagamentos' || c.id === 'movimentacoes'),
    ];
    return { list, index: buildCategoryIndex(custom) };
  }, [custom]);
}

export function useDashboard() {
  const transactions = useAppStore((s) => s.transactions);
  const statements = useAppStore((s) => s.statements);
  const { index: categories } = useCategories();
  const period = useUiStore((s) => s.period);
  const card = useUiStore((s) => s.card);
  const source = useUiStore((s) => s.source);
  const focus = useUiStore((s) => s.focus);

  return useMemo(() => {
    const hasAccount = transactions.some((t) => t.source === 'conta');
    const hasCard = transactions.some((t) => t.source !== 'conta');
    const bySource = source
      ? transactions.filter((t) =>
          source === 'conta' ? t.source === 'conta' : t.source !== 'conta',
        )
      : transactions;
    // Cartão conta no mês da fatura; conta, no mês da movimentação.
    const available = [...new Set(bySource.map((t) => t.referenceMonth))].sort();
    const months = monthsForPeriod(period, available);
    const prevMonths = previousMonths(months, available);
    const cards = [
      ...new Set(transactions.map((t) => t.cardLast4).filter((c): c is string => Boolean(c))),
    ].sort();

    const byCard = card ? bySource.filter((t) => t.cardLast4 === card) : bySource;
    const spendAll = byCard.filter((t) => isSpend(t, categories));
    const spend = applyFilters(spendAll, { months });
    const prevSpend = prevMonths.length
      ? applyFilters(spendAll, { months: prevMonths })
      : undefined;

    const stats = byCategory(spend, prevSpend);
    const groups = byGroup(stats, categories);
    const series = byMonth(spendAll, available, focus ?? undefined);
    const summary = summarize(spend, months.length);
    const previousSummary = prevSpend ? summarize(prevSpend, prevMonths.length) : undefined;
    const merchants = topMerchants(spend, 8);
    const subscriptions = detectSubscriptions(spendAll);
    const outlook = installmentOutlook(byCard, statements);
    const cashflow = cashflowByMonth(bySource, months);
    const cashflowTotals = summarizeCashflow(cashflow);
    const insights = buildInsights({
      stats,
      summary,
      categories,
      spend,
      subscriptions,
      outlook,
      ...(cashflow.length ? { cashflow: cashflowTotals } : {}),
    });

    return {
      available,
      months,
      prevMonths,
      cards,
      spend,
      stats,
      groups,
      series,
      summary,
      previousSummary,
      merchants,
      subscriptions,
      outlook,
      insights,
      categories,
      focus,
      cashflow,
      cashflowTotals,
      hasAccount,
      hasCard,
      source,
    };
  }, [transactions, statements, categories, period, card, source, focus]);
}

export type DashboardData = ReturnType<typeof useDashboard>;

/** Opções dos filtros globais (período, origem, cartão), sem calcular análises. */
export function useFilterOptions() {
  const transactions = useAppStore((s) => s.transactions);
  const source = useUiStore((s) => s.source);
  return useMemo(() => {
    const hasAccount = transactions.some((t) => t.source === 'conta');
    const hasCard = transactions.some((t) => t.source !== 'conta');
    const bySource = source
      ? transactions.filter((t) =>
          source === 'conta' ? t.source === 'conta' : t.source !== 'conta',
        )
      : transactions;
    const months = [...new Set(bySource.map((t) => t.referenceMonth))].sort();
    const cards = [
      ...new Set(bySource.map((t) => t.cardLast4).filter((c): c is string => Boolean(c))),
    ].sort();
    return { months, cards, hasAccount, hasCard };
  }, [transactions, source]);
}
