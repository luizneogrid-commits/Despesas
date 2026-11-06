import { describe, expect, it } from 'vitest';
import { tokenizeLine } from './tokenize';

const kinds = (line: string) => tokenizeLine(line).map((t) => t.kind);

describe('tokenizeLine', () => {
  it('reconhece data dd/mm, texto e valor', () => {
    const tokens = tokenizeLine('05/10 IFD*PIZZARIA BELLA 45,90');
    expect(kinds('05/10 IFD*PIZZARIA BELLA 45,90')).toEqual(['date', 'text', 'amount']);
    expect(tokens[0]).toMatchObject({ day: 5, month: 10, numeric: true });
    expect(tokens[2]).toMatchObject({ cents: 4590 });
  });

  it('reconhece datas por extenso e valores com R$ e sinal', () => {
    const tokens = tokenizeLine('10 OUT Pagamento recebido -R$ 1.950,00');
    expect(tokens.map((t) => t.kind)).toEqual(['date', 'text', 'amount']);
    expect(tokens[0]).toMatchObject({ day: 10, month: 10, numeric: false });
    expect(tokens[2]).toMatchObject({ cents: -195000, currency: 'BRL' });
  });

  it('entende crédito com sufixo "-" e "C"', () => {
    expect(tokenizeLine('19/10 ESTORNO NETFLIX 55,90-')[2]).toMatchObject({ cents: -5590 });
    expect(tokenizeLine('19/10 ESTORNO NETFLIX 55,90 C')[2]).toMatchObject({ cents: -5590 });
  });

  it('não confunde nomes com meses ("3 MARIAS")', () => {
    expect(kinds('12/10 LOJA 3 MARIAS 20,00')).toEqual(['date', 'text', 'amount']);
  });

  it('ignora percentuais como valores', () => {
    expect(tokenizeLine('Juros do rotativo 14,90% a.m.').some((t) => t.kind === 'amount')).toBe(
      false,
    );
  });

  it('lida com duas colunas na mesma linha', () => {
    expect(kinds('05/10 UBER *TRIP 18,40 13/10 DROGARAIA 0123 67,45')).toEqual([
      'date',
      'text',
      'amount',
      'date',
      'text',
      'amount',
    ]);
  });

  it('marca moeda estrangeira', () => {
    const tokens = tokenizeLine('USD 10,00 Cotação do dólar: R$ 5,43');
    expect(tokens.filter((t) => t.kind === 'amount')).toMatchObject([
      { currency: 'USD', cents: 1000 },
      { currency: 'BRL', cents: 543 },
    ]);
  });

  it('lê datas completas dd/mm/aaaa', () => {
    expect(tokenizeLine('30/09/2026 SAO PAULO MERCADO LTDA 245,10')[0]).toMatchObject({
      day: 30,
      month: 9,
      year: 2026,
    });
  });
});
