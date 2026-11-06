/**
 * Teste ponta a ponta do pipeline de leitura: PDF real (fictício) → pdf.js →
 * linhas → parser → categorizador. Usa o build "legacy" do pdf.js, que roda no Node.
 * Os PDFs são gerados por `npm run fixtures`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { categorize, compileRules } from '../src/categorization/categorizer';
import { extractLinesFromDocument } from '../src/parsing/extract';
import type { Line } from '../src/parsing/lines';
import {
  parseStatementText,
  spendingTotal,
  type ParsedStatement,
} from '../src/parsing/parseStatement';

const fixtures = resolve(__dirname, 'fixtures');
const manifest = JSON.parse(readFileSync(resolve(fixtures, 'manifest.json'), 'utf8')) as Record<
  string,
  { declaredTotalCents: number }
>;

async function parseFixture(name: string): Promise<{ lines: Line[]; parsed: ParsedStatement }> {
  const data = new Uint8Array(readFileSync(resolve(fixtures, name)));
  const task = getDocument({ data, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const lines = await extractLinesFromDocument(doc);
  await task.destroy();
  return { lines, parsed: parseStatementText(lines) };
}

const rules = compileRules([]);

describe('fatura de coluna única (datas "09 OUT")', () => {
  let parsed: ParsedStatement;
  beforeAll(async () => {
    ({ parsed } = await parseFixture('fatura-coluna-unica.pdf'));
  });

  it('lê vencimento, total e todos os lançamentos das duas páginas', () => {
    expect(parsed.dueDate).toBe('2026-11-15');
    expect(parsed.referenceMonth).toBe('2026-11');
    expect(parsed.transactions).toHaveLength(19);
    expect(parsed.declaredTotalCents).toBe(manifest['fatura-coluna-unica.pdf']?.declaredTotalCents);
  });

  it('a soma dos lançamentos bate com o total declarado', () => {
    expect(spendingTotal(parsed.transactions)).toBe(parsed.declaredTotalCents);
  });

  it('captura cartão, parcelas e compra internacional', () => {
    const uber = parsed.transactions[0];
    expect(uber).toMatchObject({ date: '2026-10-09', cardLast4: '4821', amountCents: 2345 });
    const magalu = parsed.transactions.find((t) => t.rawDescription.startsWith('Magazine Luiza'));
    expect(magalu?.installment).toEqual({ current: 2, total: 6 });
    const aws = parsed.transactions.find((t) => t.rawDescription.startsWith('Amazon Web'));
    expect(aws).toMatchObject({
      international: true,
      foreign: { currency: 'USD', amountCents: 1000 },
    });
    const presentes = parsed.transactions.find((t) => t.rawDescription.startsWith('Loja Fict'));
    expect(presentes?.installment).toEqual({ current: 3, total: 10 });
  });

  it('categoriza os estabelecimentos', () => {
    const byDesc = (s: string) => {
      const tx = parsed.transactions.find((t) => t.rawDescription.includes(s));
      return tx ? categorize(tx.rawDescription, tx.kind, rules).categoryId : undefined;
    };
    expect(byDesc('Uber *Trip')).toBe('mobilidade');
    expect(byDesc('Ifood')).toBe('delivery');
    expect(byDesc('Pão de Açúcar')).toBe('supermercado');
    expect(byDesc('Netflix')).toBe('streaming');
    expect(byDesc('Drogasil')).toBe('saude');
    expect(byDesc('Posto Shell')).toBe('transporte');
    expect(byDesc('Coco Bambu')).toBe('restaurantes');
    expect(byDesc('Uber *Eats')).toBe('delivery');
    expect(byDesc('Smart Fit')).toBe('academia');
    expect(byDesc('Petz')).toBe('pets');
  });
});

describe('fatura em duas colunas (datas "dd/mm")', () => {
  let parsed: ParsedStatement;
  let lines: Line[];
  beforeAll(async () => {
    ({ parsed, lines } = await parseFixture('fatura-duas-colunas.pdf'));
  });

  it('separa as colunas e ignora "próximas faturas"', () => {
    expect(lines).toContain('\f');
    expect(parsed.skippedFutureCount).toBe(2);
    expect(parsed.transactions).toHaveLength(20);
  });

  it('confere com o total declarado', () => {
    expect(parsed.declaredTotalCents).toBe(manifest['fatura-duas-colunas.pdf']?.declaredTotalCents);
    expect(spendingTotal(parsed.transactions)).toBe(parsed.declaredTotalCents);
  });

  it('identifica cartão adicional, estorno com sufixo e internacionais', () => {
    const zara = parsed.transactions.find((t) => t.rawDescription === 'ZARA BRASIL');
    expect(zara?.cardLast4).toBe('5678');
    const ifood = parsed.transactions.find((t) => t.rawDescription.startsWith('IFD'));
    expect(ifood?.cardLast4).toBe('1234');
    const estorno = parsed.transactions.find((t) => t.rawDescription === 'ESTORNO NETFLIX');
    expect(estorno).toMatchObject({ kind: 'estorno', amountCents: -5590 });
    const airbnb = parsed.transactions.find((t) => t.rawDescription.startsWith('AIRBNB'));
    expect(airbnb?.international).toBe(true);
    const moveis = parsed.transactions.find((t) => t.rawDescription === 'LOJA DE MOVEIS');
    expect(moveis).toMatchObject({ date: '2025-12-15', installment: { current: 11, total: 12 } });
  });
});

describe('fatura em tabela (datas "dd/mm/aaaa")', () => {
  let parsed: ParsedStatement;
  beforeAll(async () => {
    ({ parsed } = await parseFixture('fatura-tabela.pdf'));
  });

  it('lê fechamento/vencimento e ignora saldo anterior e total', () => {
    expect(parsed.dueDate).toBe('2026-11-05');
    expect(parsed.closingDate).toBe('2026-10-28');
    expect(parsed.transactions.some((t) => /SALDO|TOTAL/.test(t.rawDescription))).toBe(false);
  });

  it('classifica pagamento, devolução e encargos e bate o total', () => {
    const kinds = Object.fromEntries(parsed.transactions.map((t) => [t.rawDescription, t.kind]));
    expect(kinds['CREDITO DE PAGAMENTO']).toBe('pagamento');
    expect(kinds['DEVOLUCAO COMPRA LOJA X']).toBe('estorno');
    expect(kinds['JUROS DE MORA']).toBe('encargo');
    expect(kinds['ANUIDADE DIFERENCIADA']).toBe('encargo');
    expect(spendingTotal(parsed.transactions)).toBe(parsed.declaredTotalCents);
  });
});

// Estabelecimento × cidade: o nome é o que identifica a compra; a cidade vai
// para um campo à parte e não entra na descrição nem no de/para.
const pick = (parsed: ParsedStatement) =>
  parsed.transactions.map((t) => [t.rawDescription, t.location ?? null] as const);

describe('fatura com coluna de cidade (Data | Estabelecimento | Cidade | Valor)', () => {
  let parsed: ParsedStatement;
  beforeAll(async () => {
    ({ parsed } = await parseFixture('fatura-cidades.pdf'));
  });

  it('usa a coluna do estabelecimento e separa a cidade', () => {
    expect(pick(parsed)).toEqual([
      ['PADARIA REAL', 'São Paulo'],
      ['RESTAURANTE SABOR MINEIRO', 'Belo Horizonte'], // cortada em 13 caracteres no PDF
      ['UBER *TRIP HELP.UBER.CO', 'São Paulo'], // cidade grudada no nome
      ['MERCADO DO JOAO', 'Curitiba - PR'], // cidade + UF no fim do nome
      ['AMAZON WEB SERVICES', 'Seattle, EUA'],
      ['DROGARIA SAO PAULO', 'Campinas'], // "São Paulo" aqui é parte do nome
      ['POSTO IPIRANGA', 'Rio de Janeiro'],
      ['PAGAMENTO EFETUADO', null],
      ['NETFLIX.COM', 'São Paulo'],
      ['LOJA DE MOVEIS', 'São José dos'], // corte ambíguo (Campos ou Pinhais): fica como veio
      ['IFD*PIZZARIA BELLA', 'São Paulo'],
      ['CAFETERIA NATAL', 'Natal'],
    ]);
  });

  it('mantém parcela, internacional e o total da fatura', () => {
    const moveis = parsed.transactions.find((t) => t.rawDescription === 'LOJA DE MOVEIS');
    expect(moveis?.installment).toEqual({ current: 3, total: 10 });
    const aws = parsed.transactions.find((t) => t.rawDescription === 'AMAZON WEB SERVICES');
    expect(aws?.international).toBe(true);
    expect(spendingTotal(parsed.transactions)).toBe(parsed.declaredTotalCents);
    expect(parsed.declaredTotalCents).toBe(manifest['fatura-cidades.pdf']?.declaredTotalCents);
  });

  it('categoriza pelo nome, não pela cidade', () => {
    const cat = (d: string) => categorize(d, 'compra', rules).categoryId;
    expect(cat('PADARIA REAL')).toBe('restaurantes');
    expect(cat('UBER *TRIP HELP.UBER.CO')).toBe('mobilidade');
    expect(cat('DROGARIA SAO PAULO')).toBe('saude');
  });
});

describe('fatura com o estabelecimento à esquerda da data', () => {
  let parsed: ParsedStatement;
  beforeAll(async () => {
    ({ parsed } = await parseFixture('fatura-estab-esquerda.pdf'));
  });

  it('pega o nome da coluna mais à esquerda, inclusive sem cidade e na 2ª página', () => {
    expect(pick(parsed)).toEqual([
      ['PADARIA REAL', 'São Paulo'],
      ['RESTAURANTE SABOR MINEIRO', 'Belo Horizonte'],
      ['UBER *TRIP', 'São Paulo'],
      ['NETFLIX.COM', null],
      ['DROGARIA SAO PAULO', 'Campinas'],
      ['SUPERMERCADO BOM PRECO', 'Recife'],
      ['PAGAMENTO RECEBIDO', null],
      ['SPOTIFY', 'Stockholm'],
      ['LOJA DE MOVEIS', 'São José dos'],
      ['AMAZON MARKETPLACE', null],
      ['ESTORNO NETFLIX', null],
      ['POSTO IPIRANGA', 'Sorocaba'],
    ]);
  });

  it('classifica e bate o total', () => {
    const kinds = Object.fromEntries(parsed.transactions.map((t) => [t.rawDescription, t.kind]));
    expect(kinds['PAGAMENTO RECEBIDO']).toBe('pagamento');
    expect(kinds['ESTORNO NETFLIX']).toBe('estorno');
    const moveis = parsed.transactions.find((t) => t.rawDescription === 'LOJA DE MOVEIS');
    expect(moveis?.installment).toEqual({ current: 3, total: 10 });
    expect(spendingTotal(parsed.transactions)).toBe(parsed.declaredTotalCents);
  });
});

describe('fatura sem cabeçalho, com cidades fora da lista conhecida', () => {
  let parsed: ParsedStatement;
  beforeAll(async () => {
    ({ parsed } = await parseFixture('fatura-sem-cabecalho.pdf'));
  });

  it('reconhece a coluna de cidade pela geometria e ignora o "Pagamento mínimo"', () => {
    expect(pick(parsed)).toEqual([
      ['PADARIA REAL', 'São Paulo'],
      ['ACOUGUE DO ZE', 'Itapetininga'],
      ['FARMACIA POPULAR', 'Campinas'],
      ['RESTAURANTE DA PRACA', 'São Paulo'],
      ['MERCADINHO ESTRELA', 'Itapetininga'],
      ['POSTO TREVO', 'Sorocaba'],
      ['LIVRARIA CULTURA', 'São Paulo'],
    ]);
    expect(spendingTotal(parsed.transactions)).toBe(parsed.declaredTotalCents);
  });
});
