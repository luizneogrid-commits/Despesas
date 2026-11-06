import { describe, expect, it } from 'vitest';
import { detectDocumentType } from './metadata';
import { parseAccountText } from './parseAccount';

describe('detecção do tipo de documento', () => {
  it('distingue extrato de fatura', () => {
    expect(detectDocumentType('Extrato de conta corrente\nSaldo anterior 100,00\nAgência 1')).toBe(
      'conta',
    );
    expect(detectDocumentType('Fatura do cartão\nVencimento 10/11/2026\nPagamento mínimo')).toBe(
      'cartao',
    );
  });
});

describe('extrato com marcas D/C e sinais', () => {
  const r = parseAccountText(
    [
      'Extrato conta corrente  Período 01/10/2026 a 31/10/2026',
      '02/10 SALARIO EMPRESA X 5.000,00 C',
      '03/10 PIX ENVIADO ANA 100,00 D',
      '04/10 COMPRA DEBITO MERCADO BOM - 45,90',
      '05/10 PIX RECEBIDO BIA + 30,00',
      '06/10 PAGAMENTO CARTAO DE CREDITO 1.000,00',
      'Total de saídas 1.145,90',
      'Lançamentos futuros',
      '10/11 DEB AUT VIVO 99,90',
    ],
    { today: new Date(2026, 10, 5) },
  );

  it('respeita D/C, -/+ e ignora totais e lançamentos futuros', () => {
    expect(r.transactions.map((t) => [t.rawDescription, t.amountCents, t.kind])).toEqual([
      ['SALARIO EMPRESA X', -500000, 'receita'],
      ['PIX ENVIADO ANA', 10000, 'compra'],
      ['COMPRA DEBITO MERCADO BOM', 4590, 'compra'],
      ['PIX RECEBIDO BIA', -3000, 'receita'],
      ['PAGAMENTO CARTAO DE CREDITO', 100000, 'pagamento'],
    ]);
    expect(r.skippedFutureCount).toBe(1);
    expect(r.periodEnd).toBe('2026-10-31');
  });
});
