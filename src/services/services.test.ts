import { describe, expect, it } from 'vitest';
import { compileRules } from '../categorization/categorizer';
import { buildCategoryIndex } from '../domain/categories';
import { parseStatementText } from '../parsing/parseStatement';
import { recategorize } from '../store/appStore';
import { buildDemoState } from './demo';
import { transactionsToCSV } from './exportService';
import { buildDraft, findConflicts, reconcile, withReferenceMonth } from './importService';

const lines = [
  'Banco Itaú – Itaucard',
  'Vencimento 10/11/2026 Total desta fatura R$ 100,00',
  '05/10 IFD*PIZZARIA BELLA 60,00',
  '06/10 =HYPERLINK("x") LOJA 40,00',
];
const rules = compileRules([]);

describe('importação', () => {
  const draft = buildDraft(
    parseStatementText(lines),
    { fileName: 'f.pdf', fileHash: 'h1' },
    rules,
    [],
  );

  it('monta fatura e lançamentos categorizados', () => {
    expect(draft.statement).toMatchObject({
      issuerId: 'itau',
      referenceMonth: '2026-11',
      parsedTotalCents: 10000,
    });
    expect(draft.transactions[0]).toMatchObject({ categoryId: 'delivery', merchantName: 'iFood' });
    expect(reconcile(draft.statement).status).toBe('confere');
  });

  it('detecta duplicata e mesma fatura do mês', () => {
    const existing = [{ ...draft.statement, id: 'outro' }];
    expect(findConflicts(draft.statement, existing).duplicateOf?.id).toBe('outro');
    const other = { ...draft.statement, id: 'x', fileHash: 'h2' };
    expect(findConflicts(other, existing).sameMonthAs?.id).toBe('outro');
    expect(findConflicts(other, [{ ...existing[0]!, isDemo: true }])).toEqual({});
  });

  it('permite corrigir o mês de referência', () => {
    const moved = withReferenceMonth(draft, '2026-10');
    expect(moved.transactions.every((t) => t.referenceMonth === '2026-10')).toBe(true);
  });

  it('exporta CSV no padrão brasileiro e neutraliza fórmulas', () => {
    const csv = transactionsToCSV(draft.transactions, buildCategoryIndex([]));
    expect(csv.startsWith('\uFEFFData;')).toBe(true);
    expect(csv).toContain(
      '05/10/2026;IFD*Pizzaria Bella;iFood;;Delivery de comida;Estilo de vida;Compra;60,00',
    );
    expect(csv).toContain(`"'=Hyperlink(""X"") Loja"`);
  });
});

describe('regras do usuário', () => {
  it('recategoriza preservando ajustes manuais', () => {
    const draft = buildDraft(
      parseStatementText(lines),
      { fileName: 'f.pdf', fileHash: 'h' },
      rules,
      [],
    );
    const [a, b] = draft.transactions;
    const txs = [{ ...a!, categoryId: 'lazer', categorySource: 'manual' as const }, b!];
    const out = recategorize(
      txs,
      [{ id: 'r', pattern: 'HYPERLINK', match: 'contem', categoryId: 'casa', createdAt: '' }],
      [],
    );
    expect(out[0]?.categoryId).toBe('lazer');
    expect(out[1]).toMatchObject({ categoryId: 'casa', categorySource: 'regra', ruleId: 'r' });
  });
});

describe('dados de exemplo', () => {
  it('gera 4 faturas e 4 extratos coerentes, marcados como exemplo', () => {
    const demo = buildDemoState(new Date(2026, 10, 5));
    const cards = demo.statements.filter((s) => s.accountType !== 'conta');
    const accounts = demo.statements.filter((s) => s.accountType === 'conta');
    expect(cards.map((s) => s.referenceMonth)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(accounts).toHaveLength(4);
    expect(demo.statements.every((s) => s.isDemo)).toBe(true);
    for (const st of cards) {
      const sum = demo.transactions
        .filter((t) => t.statementId === st.id && t.kind !== 'pagamento')
        .reduce((a, t) => a + t.amountCents, 0);
      expect(sum).toBe(st.declaredTotalCents);
    }
    for (const st of accounts) expect(reconcile(st).status).toBe('confere');
    // O pagamento da fatura na conta é igual ao total da fatura do mês.
    const nov = demo.transactions.find(
      (t) => t.statementId === 'demo-conta-2026-11' && t.kind === 'pagamento',
    );
    expect(nov?.amountCents).toBe(cards.at(-1)?.declaredTotalCents);
  });
});
