/**
 * Extratos de conta corrente: PDF (sem sinais, com saldo por linha), OFX e CSV.
 * Os arquivos são fictícios e gerados por `npm run fixtures`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { cashflowByMonth, summarizeCashflow } from '../src/analytics/cashflow';
import { isSpend } from '../src/analytics/aggregate';
import { compileRules } from '../src/categorization/categorizer';
import { buildCategoryIndex } from '../src/domain/categories';
import { parseCSVStatement } from '../src/parsing/csvStatement';
import { extractLinesFromDocument } from '../src/parsing/extract';
import { parseOFX } from '../src/parsing/ofx';
import { parseStatementText, type ParsedStatement } from '../src/parsing/parseStatement';
import { buildDraft, reconcile, type ImportDraft } from '../src/services/importService';
import { decodeText } from '../src/utils/decodeText';

const fixtures = resolve(__dirname, 'fixtures');
const rules = compileRules([]);
const cats = buildCategoryIndex([]);

async function pdfLines(name: string): Promise<string[]> {
  const data = new Uint8Array(readFileSync(resolve(fixtures, name)));
  const task = getDocument({ data, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const lines = await extractLinesFromDocument(doc);
  await task.destroy();
  return lines;
}

const draftOf = (parsed: ParsedStatement, hash: string, existing: ImportDraft[] = []) =>
  buildDraft(
    parsed,
    { fileName: hash, fileHash: hash },
    rules,
    existing.map((d) => d.statement),
    existing.flatMap((d) => d.transactions),
  );

describe('extrato de conta em PDF', () => {
  let parsed: ParsedStatement;
  let draft: ImportDraft;
  beforeAll(async () => {
    parsed = parseStatementText(await pdfLines('extrato-conta.pdf'));
    draft = draftOf(parsed, 'pdf');
  });

  it('detecta extrato de conta, período, agência/conta e saldos', () => {
    expect(parsed).toMatchObject({
      accountType: 'conta',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      accountLabel: 'Ag. 1234 · CC 56789-0',
      openingBalanceCents: 200000,
      closingBalanceCents: 393801,
    });
    expect(parsed.transactions).toHaveLength(11);
  });

  it('deduz entrada/saída pela variação do saldo e herda a data do dia', () => {
    const t = (s: string) => parsed.transactions.find((x) => x.rawDescription.startsWith(s));
    expect(t('PIX RECEBIDO')).toMatchObject({
      amountCents: -850000,
      kind: 'receita',
      date: '2026-10-01',
    });
    expect(t('PAGAMENTO DE BOLETO ENEL')).toMatchObject({
      amountCents: 18990,
      kind: 'compra',
      date: '2026-10-03',
    });
    expect(t('ESTORNO')).toMatchObject({ amountCents: -4590, kind: 'estorno' });
    expect(t('PAGAMENTO FATURA')).toMatchObject({ kind: 'pagamento' });
    expect(t('APLICACAO CDB')).toMatchObject({ kind: 'transferencia' });
    expect(t('TAR PACOTE')).toMatchObject({ kind: 'encargo' });
    expect(t('RENDIMENTO')).toMatchObject({ kind: 'receita', amountCents: -1234 });
  });

  it('junta a linha de baixo (destinatário do Pix) e limpa o CPF mascarado', () => {
    const pix = parsed.transactions.filter((x) => x.rawDescription.startsWith('PIX ENVIADO'));
    expect(pix.map((p) => p.rawDescription)).toEqual([
      'PIX ENVIADO MARIA DA SILVA',
      'PIX ENVIADO JOAO PEDREIRO',
    ]);
  });

  it('confere saldo anterior + movimentações = saldo final', () => {
    expect(reconcile(draft.statement)).toEqual({ status: 'confere', diffCents: 0 });
  });

  it('categoriza: entradas fora do gasto, Pix, saque, conta de luz, tarifas', () => {
    const byDesc = (s: string) => draft.transactions.find((x) => x.rawDescription.startsWith(s));
    expect(byDesc('PIX RECEBIDO')?.categoryId).toBe('recebimentos');
    expect(byDesc('RENDIMENTO')?.categoryId).toBe('rendimentos');
    expect(byDesc('PIX ENVIADO MARIA')?.categoryId).toBe('pix-enviado');
    expect(byDesc('PIX ENVIADO MARIA')?.merchantKey).toBe('MARIA SILVA');
    expect(byDesc('SAQUE')?.categoryId).toBe('saque');
    expect(byDesc('PAGAMENTO DE BOLETO ENEL')?.categoryId).toBe('casa');
    expect(byDesc('COMPRA CARTAO DEBITO PADARIA')?.categoryId).toBe('restaurantes');
    expect(byDesc('TAR PACOTE')?.categoryId).toBe('tarifas');
    expect(byDesc('PAGAMENTO FATURA')?.categoryId).toBe('pagamentos');
    expect(byDesc('APLICACAO')?.categoryId).toBe('movimentacoes');
    expect(
      draft.transactions.every((t) => t.source === 'conta' && t.referenceMonth === '2026-10'),
    ).toBe(true);
  });

  it('não conta como gasto o pagamento da fatura, a aplicação nem as entradas', () => {
    const spend = draft.transactions.filter((t) => isSpend(t, cats));
    const total = spend.reduce((a, t) => a + t.amountCents, 0);
    // Pix 2.200 + padaria 23,50 + Enel 189,90 + saque 200 + tarifa 32,90 + Pix 150 − estorno 45,90
    expect(total).toBe(220000 + 2350 + 18990 + 20000 + 3290 + 15000 - 4590);
    const flow = summarizeCashflow(cashflowByMonth(draft.transactions));
    expect(flow).toMatchObject({
      inCents: 851234,
      cardPaymentCents: 282393,
      savedCents: 100000,
      netCents: 393801 - 200000,
    });
  });

  it('extratos sobrepostos não duplicam movimentações', () => {
    const again = draftOf(parsed, 'pdf-semana-2', [draft]);
    expect(again.transactions).toHaveLength(0);
    expect(again.statement.skippedDuplicates).toBe(11);
  });
});

describe('OFX', () => {
  const text = decodeText(
    readFileSync(resolve(fixtures, 'extrato-conta.ofx')).buffer as ArrayBuffer,
  );
  const parsed = parseOFX(text);

  it('lê banco, conta, período e lançamentos (com acentos em Latin-1)', () => {
    expect(parsed).toMatchObject({
      accountType: 'conta',
      format: 'ofx',
      issuer: { id: 'itau' },
      periodEnd: '2026-10-31',
      accountLabel: 'Ag. 1234 · CC 56789-0',
      closingBalanceCents: 463010,
    });
    expect(parsed.transactions).toHaveLength(6);
    expect(parsed.transactions[3]?.rawDescription).toBe('PIX ENVIADO JOSÉ ALUGUEL');
  });

  it('classifica salário, pagamento de fatura e aplicação; usa o FITID contra duplicatas', () => {
    const draft = draftOf(parsed, 'ofx');
    const kinds = draft.transactions.map((t) => [t.categoryId, t.kind]);
    expect(kinds).toEqual([
      ['salario', 'receita'],
      ['saude', 'compra'],
      ['pagamentos', 'pagamento'],
      ['pix-enviado', 'compra'],
      ['movimentacoes', 'transferencia'],
      ['recebimentos', 'receita'],
    ]);
    expect(draft.transactions[0]?.externalId).toBe('341:56789-0:A1');
    expect(reconcile(draft.statement).status).toBe('confere');
    expect(draftOf(parsed, 'ofx-2', [draft]).transactions).toHaveLength(0);
  });
});

describe('CSV', () => {
  it('reconhece colunas do Nubank conta e valores brasileiros', () => {
    const parsed = parseCSVStatement(readFileSync(resolve(fixtures, 'extrato-conta.csv'), 'utf8'), {
      fileName: 'NU_extrato.csv',
    });
    expect(parsed.accountType).toBe('conta');
    expect(parsed.transactions.map((t) => [t.amountCents, t.kind])).toEqual([
      [-850000, 'receita'],
      [2350, 'compra'],
      [188104, 'pagamento'],
      [15000, 'compra'],
      [30000, 'transferencia'],
    ]);
  });

  it('reconhece fatura de cartão do Nubank (date,title,amount)', () => {
    const parsed = parseCSVStatement(
      'date,title,amount\n2026-10-05,Uber *Trip,23.45\n2026-10-06,Pagamento recebido,-500.00\n',
    );
    expect(parsed.accountType).toBe('cartao');
    expect(parsed.transactions.map((t) => [t.amountCents, t.kind])).toEqual([
      [2345, 'compra'],
      [-50000, 'pagamento'],
    ]);
  });

  it('entende colunas separadas de crédito e débito', () => {
    const parsed = parseCSVStatement(
      'Data;Histórico;Crédito;Débito;Saldo\n02/10/2026;SALARIO;5.000,00;;5.000,00\n03/10/2026;PIX ENVIADO ANA;;100,00;4.900,00\n',
    );
    expect(parsed.transactions.map((t) => [t.amountCents, t.kind])).toEqual([
      [-500000, 'receita'],
      [10000, 'compra'],
    ]);
    expect(parsed).toMatchObject({ openingBalanceCents: 0, closingBalanceCents: 490000 });
  });
});
