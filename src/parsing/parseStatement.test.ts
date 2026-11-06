import { describe, expect, it } from 'vitest';
import { extractFromTokens, parseStatementText, spendingTotal } from './parseStatement';
import { tokenizeLine } from './tokenize';

describe('extractFromTokens', () => {
  it('trata "02/10" antes do valor como parcela', () => {
    const [tx] = extractFromTokens(tokenizeLine('12/10 MAGAZINE LUIZA 03/10 150,00'));
    expect(tx).toMatchObject({ day: 12, month: 10, installment: { current: 3, total: 10 } });
  });

  it('extrai dois lançamentos de uma linha com duas colunas', () => {
    const txs = extractFromTokens(
      tokenizeLine('05/10 UBER *TRIP 18,40 13/10 DROGARAIA 0123 67,45'),
    );
    expect(txs).toHaveLength(2);
    expect(txs[1]?.text.join(' ')).toBe('DROGARAIA 0123');
  });

  it('ignora data sem descrição (cabeçalhos)', () => {
    expect(extractFromTokens(tokenizeLine('Vencimento 10/11/2026 2.345,67'))).toHaveLength(0);
  });
});

describe('parseStatementText', () => {
  const lines = [
    'Banco Exemplo S.A.',
    'Vencimento 10/01/2027   Total desta fatura R$ 660,00',
    'Lançamentos: compras e saques',
    'MARIA (final 1234)',
    '28/12 IFD*RESTAURANTE 60,00',
    '02/01 UBER *TRIP 20,00',
    '15/12 LOJA DE MOVEIS 11/12 300,00',
    '03/01 PAGAMENTO EFETUADO -1.000,00',
    '04/01 ESTORNO LOJA 20,00-',
    '05/01 IOF COMPRA INTERNACIONAL 3,00',
    '05/01 AMAZON WEB SERVICES 37,00',
    'USD 10,00 Cotação R$ 3,70',
    '06/01 LOJA PRESENTES PARC 2/5 300,00',
    'Compras parceladas - próximas faturas',
    '15/12 LOJA DE MOVEIS 12/12 300,00',
  ];
  const result = parseStatementText(lines);

  it('lê metadados da fatura', () => {
    expect(result.dueDate).toBe('2027-01-10');
    expect(result.referenceMonth).toBe('2027-01');
    expect(result.declaredTotalCents).toBe(66000);
  });

  it('infere o ano na virada (dezembro em fatura de janeiro)', () => {
    expect(result.transactions[0]?.date).toBe('2026-12-28');
  });

  it('infere o ano de parcelas antigas (11/12 comprada em dez do ano anterior)', () => {
    const moveis = result.transactions.find((t) => t.rawDescription.startsWith('LOJA DE MOVEIS'));
    expect(moveis?.date).toBe('2025-12-15');
    expect(moveis?.installment).toEqual({ current: 11, total: 12 });
  });

  it('classifica pagamentos, estornos e encargos', () => {
    const byDesc = (s: string) => result.transactions.find((t) => t.rawDescription.includes(s));
    expect(byDesc('PAGAMENTO')).toMatchObject({ kind: 'pagamento', amountCents: -100000 });
    expect(byDesc('ESTORNO')).toMatchObject({ kind: 'estorno', amountCents: -2000 });
    expect(byDesc('IOF')).toMatchObject({ kind: 'encargo', amountCents: 300 });
  });

  it('anexa informações da linha seguinte (moeda estrangeira)', () => {
    const aws = result.transactions.find((t) => t.rawDescription.includes('AMAZON'));
    expect(aws).toMatchObject({
      international: true,
      foreign: { currency: 'USD', amountCents: 1000 },
    });
  });

  it('reconhece parcela escrita por extenso e cartão do titular', () => {
    const tx = result.transactions.find((t) => t.rawDescription.startsWith('LOJA PRESENTES'));
    expect(tx).toMatchObject({ installment: { current: 2, total: 5 }, cardLast4: '1234' });
    expect(tx?.description).toBe('Loja Presentes');
  });

  it('ignora o bloco de próximas faturas', () => {
    expect(result.skippedFutureCount).toBe(1);
    expect(result.transactions).toHaveLength(8);
    expect(result.unrecognizedLines).toHaveLength(0);
  });

  it('soma o gasto sem pagamentos', () => {
    expect(spendingTotal(result.transactions)).toBe(
      6000 + 2000 + 30000 - 2000 + 300 + 3700 + 30000,
    );
  });

  it('avisa quando não há vencimento', () => {
    const r = parseStatementText(['12/10 PADARIA 10,00'], { today: new Date(2026, 10, 5) });
    expect(r.referenceEstimated).toBe(true);
    expect(r.referenceMonth).toBe('2026-10');
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
