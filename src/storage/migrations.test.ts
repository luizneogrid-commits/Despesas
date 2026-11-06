import { describe, expect, it } from 'vitest';
import { compileRules } from '../categorization/categorizer';
import type { Statement, Transaction, UserRule } from '../domain/types';
import { toTransaction } from '../services/importService';
import { carryOverManual } from '../services/recategorize';
import { migrate, SCHEMA_VERSION } from './persist';

const statement: Statement = {
  id: 's1',
  fileName: 'fatura.pdf',
  fileHash: 'h',
  issuerId: 'generico',
  issuerName: 'Banco',
  referenceMonth: '2026-10',
  parsedTotalCents: 0,
  transactionCount: 0,
  importedAt: '2026-10-20T10:00:00.000Z',
  warnings: [],
};

const tx = (i: number, raw: string, amountCents = 1000): Transaction =>
  toTransaction(
    { date: '2026-10-05', rawDescription: raw, amountCents, kind: 'compra', international: false },
    { id: `t${i}`, statementId: 's1', referenceMonth: '2026-10' },
    compileRules([]),
  );

describe('migração para a versão 2 (cidade fora do nome)', () => {
  const transactions = [
    tx(1, 'PADARIA REAL SAO PAULO'),
    tx(2, 'MERCADO DO JOAO CURITIBA PR'),
    tx(3, 'DROGARIA SAO PAULO'),
    tx(4, 'UBER *TRIP HELP.UBER.COSAO PAULO BR'),
  ];
  const rule: UserRule = {
    id: 'r1',
    pattern: 'PADARIA REAL SAO PAULO',
    match: 'contem',
    categoryId: 'mercado',
    createdAt: '2026-10-20T10:00:00.000Z',
  };
  const withRule = transactions.map((t) =>
    t.id === 't1'
      ? { ...t, categoryId: 'mercado', categorySource: 'regra' as const, ruleId: 'r1' }
      : t,
  );
  const migrated = migrate({
    schemaVersion: 1,
    statements: [statement],
    transactions: withRule,
    rules: [rule],
    customCategories: [],
  });

  it('separa a cidade dos lançamentos salvos e mantém nomes com cidade', () => {
    expect(migrated?.schemaVersion).toBe(SCHEMA_VERSION);
    const byId = new Map(migrated?.transactions.map((t) => [t.id, t]));
    expect(byId.get('t1')).toMatchObject({
      rawDescription: 'PADARIA REAL',
      location: 'São Paulo',
      merchantKey: 'PADARIA REAL',
    });
    expect(byId.get('t2')).toMatchObject({
      rawDescription: 'MERCADO DO JOAO',
      location: 'Curitiba - PR',
    });
    expect(byId.get('t3')?.rawDescription).toBe('DROGARIA SAO PAULO');
    expect(byId.get('t3')?.location).toBeUndefined();
    expect(byId.get('t4')).toMatchObject({
      rawDescription: 'UBER *TRIP HELP.UBER.CO',
      location: 'São Paulo',
    });
  });

  it('ajusta o de/para criado com a cidade e ele continua valendo', () => {
    expect(migrated?.rules[0]?.pattern).toBe('PADARIA REAL');
    const padaria = migrated?.transactions.find((t) => t.id === 't1');
    expect(padaria).toMatchObject({ categoryId: 'mercado', categorySource: 'regra', ruleId: 'r1' });
  });

  it('não mexe em dados já na versão atual', () => {
    const state = {
      schemaVersion: SCHEMA_VERSION,
      statements: [statement],
      transactions,
      rules: [],
      customCategories: [],
    };
    expect(migrate(state)?.transactions[0]?.rawDescription).toBe('PADARIA REAL SAO PAULO');
  });
});

describe('substituir pela leitura nova', () => {
  it('mantém categoria ajustada à mão e "fora da análise" (pareando por data e valor)', () => {
    const old = [
      { ...tx(1, 'SAO PAULO', 2350), categoryId: 'casa', categorySource: 'manual' as const },
      { ...tx(2, 'CAMPINAS', 990), excluded: true },
    ];
    const fresh = [tx(10, 'PADARIA REAL', 2350), tx(11, 'LOJA X', 990), tx(12, 'OUTRA', 500)];
    const out = carryOverManual(fresh, old);
    expect(out[0]).toMatchObject({ categoryId: 'casa', categorySource: 'manual' });
    expect(out[1]?.excluded).toBe(true);
    expect(out[2]).toBe(fresh[2]);
  });
});
