import { describe, expect, it } from 'vitest';
import type { UserRule } from '../domain/types';
import { categorize, compileRules } from './categorizer';
import { displayMerchant, merchantKey, prettifyDescription } from './normalize';

const rules = compileRules([]);
const cat = (desc: string, kind: 'compra' | 'encargo' | 'estorno' | 'pagamento' = 'compra') =>
  categorize(desc, kind, rules);

describe('categorize (base embutida)', () => {
  it.each([
    ['IFD*PIZZARIA BELLA', 'delivery', 'iFood'],
    ['UBER *TRIP HELP.UBER.COM', 'mobilidade', 'Uber'],
    ['UBER *EATS PENDING', 'delivery', 'Uber Eats'],
    ['99app *99app', 'mobilidade', '99'],
    ['NETFLIX.COM', 'streaming', 'Netflix'],
    ['PAYPAL *SPOTIFY', 'streaming', 'Spotify'],
    ['CARREFOUR HIPER 123', 'supermercado', 'Carrefour'],
    ['Supermercado Pão de Açúcar', 'supermercado', 'Pão de Açúcar'],
    ['DROGARAIA 0123', 'saude', undefined],
    ['POSTO IPIRANGA', 'transporte', 'Ipiranga'],
    ['SMARTFIT', 'academia', 'Smart Fit'],
    ['MERCADOLIVRE*VENDEDOR', 'compras', 'Mercado Livre'],
    ['APPLE.COM/BILL', 'assinaturas', 'Apple (App Store/iCloud)'],
    ['AIRBNB * HMXYZ', 'viagem', 'Airbnb'],
    ['PAG*PADARIAREALE', 'outros', undefined],
    ['PAG*PADARIA REALE', 'restaurantes', undefined],
    ['BETANO*APOSTAS', 'apostas', 'Betano'],
    ['ZARA BRASIL', 'vestuario', 'Zara'],
    ['RAPPI*RESTAURANTE', 'delivery', 'Rappi'],
    ['SEM PARAR', 'transporte', 'Sem Parar'],
  ])('%s → %s', (desc, expected, brand) => {
    const r = cat(desc);
    expect(r.categoryId).toBe(expected);
    if (brand) expect(r.brand).toBe(brand);
  });

  it('pagamento e encargo têm categorias fixas', () => {
    expect(cat('PAGAMENTO EFETUADO', 'pagamento').categoryId).toBe('pagamentos');
    expect(cat('REPASSE DE IOF', 'encargo').categoryId).toBe('tarifas');
  });

  it('sem regra cai em "outros" com origem padrão', () => {
    expect(cat('XYZ COMERCIO 123')).toEqual({ categoryId: 'outros', source: 'padrao' });
  });
});

describe('regras do usuário', () => {
  const userRules: UserRule[] = [
    {
      id: 'r1',
      pattern: 'PADARIAREALE',
      match: 'contem',
      categoryId: 'restaurantes',
      createdAt: '',
    },
    { id: 'r2', pattern: 'UBER', match: 'comeca', categoryId: 'viagem', createdAt: '' },
    { id: 'r3', pattern: '(', match: 'regex', categoryId: 'viagem', createdAt: '' },
  ];
  const compiled = compileRules(userRules);

  it('vencem a base embutida', () => {
    expect(categorize('PAG*PADARIAREALE', 'compra', compiled)).toMatchObject({
      categoryId: 'restaurantes',
      source: 'regra',
      ruleId: 'r1',
    });
    expect(categorize('UBER *TRIP', 'compra', compiled).categoryId).toBe('viagem');
  });

  it('regex inválida é descartada sem quebrar', () => {
    expect(compiled.some((r) => r.id === 'r3')).toBe(false);
  });
});

describe('normalização', () => {
  it('gera chave estável do estabelecimento', () => {
    expect(merchantKey('PAG*PADARIA REALE 0042')).toBe('PADARIA REALE');
    expect(merchantKey('UBER *TRIP HELP.UBER.COM')).toBe('UBER UBER');
  });

  it('deixa descrições em caixa alta legíveis', () => {
    expect(prettifyDescription('UBER *TRIP HELP.UBER.COM')).toBe('Uber *Trip Help.Uber.com');
    expect(prettifyDescription('IOF COMPRA INTERNACIONAL')).toBe('IOF Compra Internacional');
    expect(prettifyDescription('Netflix.com')).toBe('Netflix.com');
    expect(prettifyDescription('BAR DO JULINHO')).toBe('Bar do Julinho');
    expect(prettifyDescription('IFD*PIZZARIA BELLA')).toBe('IFD*Pizzaria Bella');
  });

  it('gera nome de exibição sem números de loja nem intermediador', () => {
    expect(displayMerchant('PAG*PADARIA REALE 0042')).toBe('Padaria Reale');
    expect(displayMerchant('DROGASIL 2231')).toBe('Drogasil');
    expect(displayMerchant('LOJA DE MOVEIS')).toBe('Loja de Moveis');
  });
});
