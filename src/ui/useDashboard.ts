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
import { installmentOutlook } from '../analytics/installments';
import { detectSubscriptions } from '../analytics/recurring';
import { BUILTIN_CATEGORIES, buildCategoryIndex } from '../domain/categories';
import type { Category } from '../domain/types';
import { useAppStore } from '../store/appStore';
import { useUiStore } from './uiStore';

export function useCategories() {
  const custom = useAppStore((s) => s.customCategories);
  return useMemo(() => {
    const list: Category[] = [
      ...BUILTIN_CATEGORIES.filter((c) => c.id !== 'outros' && c.id !== 'pagamentos'),
      ...custom,
      ...BUILTIN_CATEGORIES.filter((c) => c.id === 'outros' || c.id === 'pagamentos'),
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
  const focus = useUiStore((s) => s.focus);

  return useMemo(() => {
    const available = [...new Set(statements.map((s) => s.referenceMonth))].sort();
    const months = monthsForPeriod(period, available);
    const prevMonths = previousMonths(months, available);
    const cards = [
      ...new Set(transactions.map((t) => t.cardLast4).filter((c): c is string => Boolean(c))),
    ].sort();

    const byCard = card ? transactions.filter((t) => t.cardLast4 === card) : transactions;
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
    const insights = buildInsights({ stats, summary, categories, spend, subscriptions, outlook });

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
    };
  }, [transactions, statements, categories, period, card, focus]);
}

export type DashboardData = ReturnType<typeof useDashboard>;
