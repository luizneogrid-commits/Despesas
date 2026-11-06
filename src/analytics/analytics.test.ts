import { describe, expect, it } from 'vitest';
import { buildCategoryIndex } from '../domain/categories';
import type { Transaction } from '../domain/types';
import {
  byCategory,
  byGroup,
  byMonth,
  isSpend,
  monthsForPeriod,
  previousMonths,
  summarize,
  topMerchants,
} from './aggregate';
import { installmentOutlook, projectCommitments } from './installments';
import { detectSubscriptions } from './recurring';

let n = 0;
function tx(p: Partial<Transaction>): Transaction {
  n += 1;
  return {
    id: `t${n}`,
    statementId: 's',
    date: '2026-10-05',
    referenceMonth: '2026-10',
    description: 'X',
    rawDescription: 'X',
    merchantKey: 'X',
    merchantName: 'X',
    amountCents: 1000,
    kind: 'compra',
    international: false,
    categoryId: 'outros',
    categorySource: 'padrao',
    ...p,
  };
}

const cats = buildCategoryIndex([]);

describe('agregações', () => {
  const txs = [
    tx({ categoryId: 'supermercado', amountCents: 30000, merchantName: 'Carrefour' }),
    tx({
      categoryId: 'supermercado',
      amountCents: 10000,
      merchantName: 'Carrefour',
      referenceMonth: '2026-09',
    }),
    tx({ categoryId: 'delivery', amountCents: 5000, merchantName: 'iFood' }),
    tx({ categoryId: 'delivery', amountCents: -1000, kind: 'estorno', merchantName: 'iFood' }),
    tx({ categoryId: 'pagamentos', amountCents: -50000, kind: 'pagamento' }),
    tx({ categoryId: 'tarifas', amountCents: 300, kind: 'encargo' }),
    tx({ categoryId: 'lazer', amountCents: 9000, excluded: true }),
  ];
  const spend = txs.filter((t) => isSpend(t, cats));

  it('exclui pagamentos e lançamentos marcados como fora da análise', () => {
    expect(spend).toHaveLength(5);
  });

  it('agrupa por categoria com estornos abatendo', () => {
    const stats = byCategory(spend);
    expect(stats[0]).toMatchObject({ categoryId: 'supermercado', totalCents: 40000, count: 2 });
    expect(stats.find((s) => s.categoryId === 'delivery')).toMatchObject({
      totalCents: 4000,
      count: 1,
    });
  });

  it('agrupa em essenciais × estilo de vida × custo do crédito', () => {
    const groups = byGroup(byCategory(spend), cats);
    expect(groups.find((g) => g.group === 'essencial')?.totalCents).toBe(40000);
    expect(groups.find((g) => g.group === 'financeiro')?.totalCents).toBe(300);
  });

  it('série mensal preenche meses vazios', () => {
    const series = byMonth(spend, ['2026-07', '2026-10'], 'supermercado');
    expect(series.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(series[3]).toMatchObject({ totalCents: 34300, focusCents: 30000 });
  });

  it('resume o período', () => {
    const s = summarize(spend, 2);
    expect(s).toMatchObject({
      totalCents: 44300,
      purchaseCount: 3,
      feesCents: 300,
      refundsCents: 1000,
      monthlyAvgCents: 22150,
    });
  });

  it('ranqueia estabelecimentos', () => {
    expect(topMerchants(spend)[0]).toMatchObject({
      name: 'Carrefour',
      totalCents: 40000,
      count: 2,
    });
  });
});

describe('períodos', () => {
  const available = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
  it('seleciona meses', () => {
    expect(monthsForPeriod('last3', available)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(monthsForPeriod('m:2026-07', available)).toEqual(['2026-07']);
    expect(monthsForPeriod('all', available)).toHaveLength(5);
  });
  it('acha o período anterior equivalente', () => {
    expect(previousMonths(['2026-10'], available)).toEqual(['2026-09']);
    expect(previousMonths(['2026-09', '2026-10'], available)).toEqual(['2026-07', '2026-08']);
    expect(previousMonths(available, available)).toEqual([]);
  });
});

describe('assinaturas', () => {
  it('detecta recorrência estável e ignora compras frequentes', () => {
    const txs = [
      tx({
        merchantName: 'Netflix',
        categoryId: 'streaming',
        amountCents: 5590,
        referenceMonth: '2026-09',
      }),
      tx({
        merchantName: 'Netflix',
        categoryId: 'streaming',
        amountCents: 5590,
        referenceMonth: '2026-10',
      }),
      tx({
        merchantName: 'Escola de Inglês',
        categoryId: 'educacao',
        amountCents: 39000,
        referenceMonth: '2026-09',
      }),
      tx({
        merchantName: 'Escola de Inglês',
        categoryId: 'educacao',
        amountCents: 39000,
        referenceMonth: '2026-10',
      }),
      tx({
        merchantName: 'Spotify',
        categoryId: 'streaming',
        amountCents: 2190,
        referenceMonth: '2026-10',
      }),
      ...[1, 2, 3].map(() =>
        tx({ merchantName: 'Uber', categoryId: 'mobilidade', amountCents: 2000 }),
      ),
    ];
    const subs = detectSubscriptions(txs);
    expect(subs.map((s) => [s.name, s.confidence])).toEqual([
      ['Escola de Inglês', 'confirmada'],
      ['Netflix', 'confirmada'],
      ['Spotify', 'provavel'],
    ]);
  });
});

describe('parcelas futuras', () => {
  it('projeta o que falta pagar a partir da fatura mais recente', () => {
    const txs = [
      tx({
        merchantName: 'Magalu',
        amountCents: 25000,
        installment: { current: 2, total: 6 },
        referenceMonth: '2026-09',
      }),
      tx({
        merchantName: 'Magalu',
        amountCents: 25000,
        installment: { current: 3, total: 6 },
        referenceMonth: '2026-10',
      }),
      tx({
        merchantName: 'Móveis',
        amountCents: 10000,
        installment: { current: 11, total: 12 },
        referenceMonth: '2026-10',
      }),
    ];
    const o = installmentOutlook(txs);
    expect(o.baseMonth).toBe('2026-10');
    expect(o.totalRemainingCents).toBe(3 * 25000 + 10000);
    expect(o.schedule).toEqual([
      { month: '2026-11', totalCents: 35000, count: 2, ending: ['Móveis'] },
      { month: '2026-12', totalCents: 25000, count: 1, ending: [] },
      { month: '2027-01', totalCents: 25000, count: 1, ending: ['Magalu'] },
    ]);
    expect(o.plans[0]).toMatchObject({ name: 'Magalu', remaining: 3, endsMonth: '2027-01' });
  });
});

describe('insights', () => {
  it('gera leituras a partir dos dados de exemplo', async () => {
    const { buildDemoState } = await import('../services/demo');
    const { buildInsights } = await import('./insights');
    const demo = buildDemoState(new Date(2026, 10, 5));
    const spend = demo.transactions.filter((t) => isSpend(t, cats));
    const last = spend.filter((t) => t.referenceMonth === '2026-11');
    const prev = spend.filter((t) => t.referenceMonth === '2026-10');
    const stats = byCategory(last, prev);
    const insights = buildInsights({
      stats,
      summary: summarize(last, 1),
      categories: cats,
      spend: last,
      subscriptions: detectSubscriptions(spend),
      outlook: installmentOutlook(demo.transactions),
    });
    const ids = insights.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining(['top', 'fees', 'eat-out', 'rides', 'subs', 'installments', 'intl']),
    );
    expect(insights.find((i) => i.id === 'subs')?.title).toMatch(/assinaturas somam R\$/);
    expect(insights.every((i) => i.title.length > 0 && i.detail.length > 0)).toBe(true);
  });

  it('não gera nada sem gasto', async () => {
    const { buildInsights } = await import('./insights');
    const empty = buildInsights({
      stats: [],
      summary: summarize([], 0),
      categories: cats,
      spend: [],
      subscriptions: [],
      outlook: {
        plans: [],
        schedule: [],
        totalRemainingCents: 0,
        purchaseTotalCents: 0,
        paidCents: 0,
      },
    });
    expect(empty).toEqual([]);
  });
});

describe('projeção de parcelas por emissor', () => {
  const statements = [
    { id: 'a1', issuerId: 'nubank', issuerName: 'Nubank', referenceMonth: '2026-10' },
    { id: 'a2', issuerId: 'nubank', issuerName: 'Nubank', referenceMonth: '2026-11' },
    { id: 'b1', issuerId: 'itau', issuerName: 'Itaú', referenceMonth: '2026-10' },
  ].map((s) => ({
    ...s,
    fileName: '',
    fileHash: s.id,
    parsedTotalCents: 0,
    transactionCount: 0,
    importedAt: '',
    warnings: [],
  }));
  const txs = [
    // Nubank: a fatura de outubro tem 2/6; a de novembro, 3/6 (só ela conta).
    tx({
      statementId: 'a1',
      referenceMonth: '2026-10',
      merchantName: 'Magalu',
      amountCents: 25000,
      installment: { current: 2, total: 6 },
    }),
    tx({
      statementId: 'a2',
      referenceMonth: '2026-11',
      merchantName: 'Magalu',
      amountCents: 25000,
      installment: { current: 3, total: 6 },
    }),
    // Itaú: última fatura importada é outubro, com 9/10.
    tx({
      statementId: 'b1',
      referenceMonth: '2026-10',
      merchantName: 'Notebook',
      amountCents: 40000,
      installment: { current: 9, total: 10 },
    }),
    // Última parcela (10/10) não projeta nada.
    tx({
      statementId: 'a2',
      referenceMonth: '2026-11',
      merchantName: 'Celular',
      amountCents: 30000,
      installment: { current: 10, total: 10 },
    }),
  ];
  const o = installmentOutlook(txs, statements);

  it('usa a fatura mais recente de cada emissor', () => {
    expect(o.plans.map((p) => [p.name, p.remaining, p.endsMonth])).toEqual([
      ['Magalu', 3, '2027-02'],
      ['Notebook', 1, '2026-11'],
    ]);
    expect(o.totalRemainingCents).toBe(3 * 25000 + 40000);
  });

  it('informa total da compra, já pago e quando termina', () => {
    const magalu = o.plans[0];
    expect(magalu).toMatchObject({ purchaseCents: 150000, paidCents: 75000, issuerName: 'Nubank' });
    expect(o.endsMonth).toBe('2027-02');
    // Novembro do Itaú ainda não foi importado: a parcela 10/10 do notebook continua a vencer.
    expect(o.schedule.find((m) => m.month === '2026-11')).toMatchObject({
      totalCents: 40000,
      count: 1,
      ending: ['Notebook'],
    });
  });

  it('projeta o comprometido por mês, com ou sem assinaturas', () => {
    const subs = [
      {
        name: 'Netflix',
        categoryId: 'streaming',
        monthlyCents: 5590,
        monthsSeen: 3,
        lastDate: '2026-11-02',
        lastMonth: '2026-11',
        confidence: 'confirmada' as const,
      },
      {
        name: 'Antiga',
        categoryId: 'streaming',
        monthlyCents: 9990,
        monthsSeen: 2,
        lastDate: '2026-05-02',
        lastMonth: '2026-05',
        confidence: 'confirmada' as const,
      },
    ];
    const only = projectCommitments(o, subs);
    expect(only.map((m) => m.month)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
    ]);
    expect(only[0]).toEqual({
      month: '2026-11',
      installmentsCents: 40000,
      subscriptionsCents: 0,
      totalCents: 40000,
    });
    expect(only[1]).toEqual({
      month: '2026-12',
      installmentsCents: 25000,
      subscriptionsCents: 0,
      totalCents: 25000,
    });
    const withSubs = projectCommitments(o, subs, { includeSubscriptions: true });
    // assinatura parada desde maio não entra
    expect(withSubs[1]).toMatchObject({ subscriptionsCents: 5590, totalCents: 30590 });
    expect(withSubs.at(-1)).toMatchObject({
      month: '2027-04',
      installmentsCents: 0,
      totalCents: 5590,
    });
  });
});
