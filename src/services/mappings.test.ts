import { describe, expect, it } from 'vitest';
import { categorize, compileRules } from '../categorization/categorizer';
import { buildCategoryIndex } from '../domain/categories';
import { parseStatementText } from '../parsing/parseStatement';
import { mergeMappings, recategorize } from '../store/appStore';
import { buildDraft } from './importService';
import { mappingsToCSV, parseMappingsCSV, pendingMerchants } from './mappings';

const cats = buildCategoryIndex([]);
const lines = [
  'Vencimento 10/11/2026',
  '05/10 XPTO COMERCIO 0042 50,00',
  '12/10 XPTO COMERCIO 0042 30,00',
  '14/10 LOJA DE MOVEIS 12 200,00',
  '15/10 NETFLIX.COM 55,90',
  '16/10 PAGAMENTO EFETUADO -100,00',
];
const draft = buildDraft(
  parseStatementText(lines),
  { fileName: 'f', fileHash: 'h' },
  compileRules([]),
  [],
);

describe('pendentes de mapeamento', () => {
  it('agrupa os não reconhecidos por estabelecimento', () => {
    const pending = pendingMerchants(draft.transactions);
    expect(pending.map((p) => [p.key, p.count, p.totalCents])).toEqual([
      ['XPTO COMERCIO', 2, 8000],
    ]);
    expect(pending[0]?.suggestedName).toBe('Xpto Comercio');
  });
});

describe('de/para', () => {
  it('mapeia, renomeia e vale para as próximas faturas', () => {
    const { rules } = mergeMappings(
      [],
      [
        {
          pattern: 'XPTO COMERCIO',
          match: 'contem',
          categoryId: 'casa',
          displayName: 'Material de limpeza',
        },
        { pattern: 'LOJA MOVEIS', match: 'contem', categoryId: 'casa' },
      ],
    );
    const updated = recategorize(draft.transactions, rules, []);
    const xpto = updated.filter((t) => t.rawDescription.startsWith('XPTO'));
    expect(xpto.every((t) => t.categoryId === 'casa' && t.categorySource === 'regra')).toBe(true);
    expect(xpto[0]?.merchantName).toBe('Material de limpeza');
    // A chave sem "DE" e sem números também casa ("LOJA MOVEIS" × "LOJA DE MOVEIS 12").
    expect(updated.find((t) => t.rawDescription.startsWith('LOJA'))?.categoryId).toBe('casa');
    expect(pendingMerchants(updated)).toHaveLength(0);

    // Próxima fatura: o de/para é aplicado direto na importação.
    const next = buildDraft(
      parseStatementText(['Vencimento 10/12/2026', '03/11 XPTO COMERCIO 0099 70,00']),
      { fileName: 'g', fileHash: 'g' },
      compileRules(rules),
      [],
    );
    expect(next.transactions[0]).toMatchObject({
      categoryId: 'casa',
      merchantName: 'Material de limpeza',
      categorySource: 'regra',
    });
  });

  it('atualiza em vez de duplicar o mesmo "de"', () => {
    const first = mergeMappings([], [{ pattern: 'XPTO', match: 'contem', categoryId: 'casa' }]);
    const second = mergeMappings(first.rules, [
      { pattern: 'xpto', match: 'contem', categoryId: 'lazer' },
    ]);
    expect(second.rules).toHaveLength(1);
    expect(second.rules[0]).toMatchObject({ categoryId: 'lazer' });
    expect(second.ids).toEqual(first.ids);
  });

  it('regra do usuário vence a base embutida', () => {
    const { rules } = mergeMappings(
      [],
      [
        {
          pattern: 'NETFLIX',
          match: 'contem',
          categoryId: 'lazer',
          displayName: 'Netflix (família)',
        },
      ],
    );
    expect(categorize('NETFLIX.COM', 'compra', compileRules(rules))).toMatchObject({
      categoryId: 'lazer',
      brand: 'Netflix (família)',
    });
  });

  it('exporta e reimporta o de/para em CSV', () => {
    const { rules } = mergeMappings(
      [],
      [
        {
          pattern: 'XPTO COMERCIO',
          match: 'contem',
          categoryId: 'casa',
          displayName: 'Limpeza; casa',
        },
        { pattern: '^PADARIA', match: 'regex', categoryId: 'restaurantes' },
      ],
    );
    const csv = mappingsToCSV(rules, cats);
    expect(csv).toContain('XPTO COMERCIO;contém;Casa e contas;"Limpeza; casa"');
    const parsed = parseMappingsCSV(csv, cats);
    expect(parsed.errors).toEqual([]);
    expect(parsed.entries).toEqual([
      {
        pattern: 'XPTO COMERCIO',
        match: 'contem',
        categoryId: 'casa',
        displayName: 'Limpeza; casa',
      },
      { pattern: '^PADARIA', match: 'regex', categoryId: 'restaurantes' },
    ]);
  });

  it('aceita planilha simples e aponta categorias inexistentes', () => {
    const parsed = parseMappingsCSV(
      'de,para\nPADARIA REALE,"Restaurantes, bares e cafés"\nFOO,Categoria X',
      cats,
    );
    expect(parsed.entries).toEqual([
      { pattern: 'PADARIA REALE', match: 'contem', categoryId: 'restaurantes' },
    ]);
    expect(parsed.errors).toEqual(['Linha 3: categoria "Categoria X" não existe.']);
  });
});
