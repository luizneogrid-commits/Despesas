import { describe, expect, it } from 'vitest';
import { buildDocStats, chooseMerchant, detectHeader } from './merchantText';
import { isLocationText, splitGluedLocation, splitTrailingLocation } from './places';

describe('lugares no fim da descrição', () => {
  it.each([
    ['PADARIA REAL LTDA SAO PAULO', 'PADARIA REAL LTDA', 'SAO PAULO'],
    ['MERCADO DO JOAO CURITIBA PR', 'MERCADO DO JOAO', 'CURITIBA PR'],
    ['DROGASIL 1234 BELO HORIZONT', 'DROGASIL 1234', 'BELO HORIZONT'],
    ['POSTO SAO JOSE DOS CAMPOS BR', 'POSTO SAO JOSE DOS CAMPOS', 'BR'],
    ['AMAZON WEB SERVICES SEATTLE US', 'AMAZON WEB SERVICES', 'SEATTLE US'],
    ['NETFLIX.COM BR', 'NETFLIX.COM', 'BR'],
  ])('%s', (text, rest, location) => {
    expect(splitTrailingLocation(text)).toEqual({ rest, location });
  });

  it('não corta nomes que só parecem cidade', () => {
    expect(splitTrailingLocation('LOJA DE NATAL').location).toBeUndefined();
    expect(splitTrailingLocation('POSTO SHELL AV BRASIL').location).toBeUndefined();
    expect(splitTrailingLocation('ZARA BRASIL').location).toBeUndefined();
    expect(splitTrailingLocation('PARIS 6 BISTRO').location).toBeUndefined();
    expect(splitTrailingLocation('SAO PAULO').location).toBeUndefined(); // não sobra nome
    // Ambíguo só sai com reforço (coluna de cidade, UF/país ou repetição).
    expect(splitTrailingLocation('BAR DO ZE NATAL', { strong: true }).location).toBe('NATAL');
    expect(splitTrailingLocation('BAR DO ZE NATAL RN').location).toBe('NATAL RN');
  });

  it('separa a cidade grudada pelo limite de colunas do cartão', () => {
    expect(splitGluedLocation('UBER *TRIP HELP.UBER.COSAO PAULO BR')).toEqual({
      rest: 'UBER *TRIP HELP.UBER.CO',
      location: 'SAO PAULO BR',
    });
  });

  it('reconhece células de coluna de cidade', () => {
    expect(isLocationText('SAO PAULO')).toBe(true);
    expect(isLocationText('RIO DE JANEIRO RJ')).toBe(true);
    expect(isLocationText('Belo Horizont')).toBe(true);
    expect(isLocationText('SEATTLE')).toBe(false);
    expect(isLocationText('SEATTLE', { strong: true })).toBe(true);
    expect(isLocationText('UBER TRIP')).toBe(false);
  });
});

describe('escolha do estabelecimento', () => {
  it('usa o cabeçalho para saber qual coluna é a cidade', () => {
    const header = detectHeader([
      { text: 'Data', x: 40 },
      { text: 'Estabelecimento', x: 90 },
      { text: 'Cidade', x: 330 },
      { text: 'Valor (R$)', x: 520 },
    ]);
    expect(header?.columns.map((c) => c.role)).toEqual(['date', 'merchant', 'location', 'amount']);
    expect(
      chooseMerchant(
        [
          { text: 'MOGI MIRIM PIZZAS', x: 90 },
          { text: 'MOGI MIRIM', x: 330 },
        ],
        { header },
      ),
    ).toEqual({
      merchant: 'MOGI MIRIM PIZZAS',
      location: 'Mogi Mirim',
    });
  });

  it('estabelecimento antes da data, cidade depois', () => {
    const header = detectHeader([
      { text: 'Estabelecimento', x: 40 },
      { text: 'Data', x: 250 },
      { text: 'Local', x: 310 },
      { text: 'Valor', x: 520 },
    ]);
    expect(
      chooseMerchant(
        [
          { text: 'PADARIA REAL', x: 40, lead: true },
          { text: 'SAO PAULO', x: 310 },
        ],
        { header },
      ),
    ).toEqual({
      merchant: 'PADARIA REAL',
      location: 'São Paulo',
    });
    // Mesmo sem cabeçalho: depois da data só há cidade.
    expect(
      chooseMerchant([
        { text: 'PADARIA REAL', x: 40, lead: true },
        { text: 'SAO PAULO', x: 310 },
      ]),
    ).toEqual({
      merchant: 'PADARIA REAL',
      location: 'São Paulo',
    });
  });

  it('ignora rótulos e titular antes da data, e máscara de cartão', () => {
    expect(
      chooseMerchant([
        { text: 'Pagamento em', x: 40, lead: true },
        { text: 'Uber *Trip', x: 120 },
      ]).merchant,
    ).toBe('Uber *Trip');
    expect(
      chooseMerchant([
        { text: '•••• 4821', x: 100 },
        { text: 'Uber *Trip', x: 160 },
      ]).merchant,
    ).toBe('Uber *Trip');
  });

  it('sem cabeçalho: coluna alinhada de cidades e finais repetidos viram lugar', () => {
    const rows = [
      ['PADARIA REAL', 'MOGI MIRIM'],
      ['FARMACIA BOA', 'MOGI MIRIM'],
      ['POSTO CENTRAL', 'SAO PAULO'],
      ['LOJA XYZ', 'CAMPINAS'],
      ['MERCADO BOM', 'MOGI MIRIM'],
    ].map(([m, c]) => [
      { text: m ?? '', x: 90 },
      { text: c ?? '', x: 330 },
    ]);
    const stats = buildDocStats(rows);
    expect(stats.locationXs).toEqual([330]);
    expect(chooseMerchant(rows[0] ?? [], { stats })).toEqual({
      merchant: 'PADARIA REAL',
      location: 'Mogi Mirim',
    });
  });
});
