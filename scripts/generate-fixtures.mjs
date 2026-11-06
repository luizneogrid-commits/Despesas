// Gera PDFs de exemplo (dados 100% fictícios) usados nos testes de integração
// e no botão "Testar com uma fatura de exemplo". Layouts inspirados nos formatos
// mais comuns de fatura no Brasil: coluna única com datas "09 OUT", duas colunas
// com datas "dd/mm" e tabela com datas "dd/mm/aaaa".
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = resolve(root, 'tests', 'fixtures');
mkdirSync(fixturesDir, { recursive: true });

const brl = (cents) => {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${int},${String(abs % 100).padStart(2, '0')}`;
};

async function makeDoc() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, font, bold };
}

function writer(page, font) {
  return {
    text(str, x, y, size = 9, f = font, color = rgb(0.1, 0.1, 0.15)) {
      page.drawText(str, { x, y, size, font: f, color });
    },
    right(str, xRight, y, size = 9, f = font) {
      const w = f.widthOfTextAtSize(str, size);
      page.drawText(str, { x: xRight - w, y, size, font: f, color: rgb(0.1, 0.1, 0.15) });
    },
  };
}

const sum = (rows) => rows.reduce((a, r) => a + (r.payment ? 0 : r.cents), 0);

// ------------------------------------------------------------ 1. coluna única
async function singleColumn() {
  const { doc, font, bold } = await makeDoc();
  const page1Rows = [
    ['09 OUT', '•••• 4821   Uber *Trip', 2345],
    ['10 OUT', '•••• 4821   Ifood *Ifood', 6780],
    ['10 OUT', 'Pagamento recebido', -195000, true],
    ['11 OUT', 'Supermercado Pão de Açúcar', 41237],
    ['12 OUT', 'Netflix.com', 5590],
    ['12 OUT', 'Spotify', 2190],
    ['13 OUT', 'Drogasil 1234', 8990],
    ['14 OUT', 'Magazine Luiza - Parcela 2/6', 25000],
    ['15 OUT', 'Amazon Web Services', 5432, false, 'USD 10,00   Cotação do dólar: R$ 5,43'],
    ['15 OUT', 'IOF de compra internacional', 190],
    ['18 OUT', 'Posto Shell Av Paulista', 21000],
    ['20 OUT', '99app *99app', 1870],
    ['22 OUT', 'Restaurante Coco Bambu', 28640],
    ['25 OUT', 'Estorno de "Amazon"', -5990],
  ];
  const page2Rows = [
    ['28 OUT', 'Smart Fit', 12990],
    ['02 NOV', 'Petz Pinheiros', 14560],
    ['05 NOV', 'Uber *Eats Pending', 4890],
    ['06 NOV', 'Kindle Unlimited', 2490],
    ['07 NOV', 'Loja Fictícia de Presentes 3/10', 9900],
  ];
  const all = [...page1Rows, ...page2Rows].map(([, , cents, payment]) => ({ cents, payment }));
  const total = sum(all);

  let page = doc.addPage([595, 842]);
  let w = writer(page, font);
  w.text('Banco Exemplo Digital S.A.  ·  FATURA DE EXEMPLO (DADOS FICTÍCIOS)', 40, 800, 10, bold);
  w.text(
    `Olá, Maria Exemplo. Esta é a sua fatura de novembro, no valor de R$ ${brl(total)}`,
    40,
    776,
    10,
  );
  w.text('Data do vencimento: 15 NOV 2026', 40, 760);
  w.text('Fechamento: 08 NOV 2026', 240, 760);
  w.text('Limite total R$ 8.000,00', 420, 760);
  w.text('TRANSAÇÕES DE 09 OUT A 08 NOV', 40, 728, 10, bold);
  let y = 706;
  const drawRows = (rows) => {
    for (const [date, desc, cents, , extra] of rows) {
      w.text(date, 40, y);
      w.text(desc, 100, y);
      w.right(`${cents < 0 ? '-' : ''}R$ ${brl(Math.abs(cents))}`, 555, y);
      y -= 14;
      if (extra) {
        w.text(extra, 100, y, 8);
        y -= 14;
      }
      y -= 4;
    }
  };
  drawRows(page1Rows);
  page = doc.addPage([595, 842]);
  w = writer(page, font);
  y = 800;
  w.text('TRANSAÇÕES (continuação)', 40, y + 14, 10, bold);
  drawRows(page2Rows);
  w.text('Pagamento mínimo R$ 211,85', 40, y - 20);
  return { bytes: await doc.save(), total, count: page1Rows.length + page2Rows.length };
}

// ------------------------------------------------------------ 2. duas colunas
async function twoColumns() {
  const { doc, font, bold } = await makeDoc();
  const page = doc.addPage([595, 842]);
  const w = writer(page, font);

  const left = [
    { h: 'JOAO EXEMPLO (final 1234)' },
    ['05/10', 'IFD*PIZZARIA BELLA', 4590],
    ['06/10', 'UBER *TRIP', 1840],
    ['07/10', 'CARREFOUR HIPER 123', 53218],
    ['08/10', 'PAG*PADARIAREALE', 2350],
    ['09/10', 'NETFLIX.COM', 5590],
    ['10/10', 'PAGAMENTO EFETUADO', -150000, true],
    ['12/10', 'MAGAZINE LUIZA 03/10', 15000],
    ['15/12', 'LOJA DE MOVEIS 11/12', 32000],
    { h: 'JOAO EXEMPLO ADICIONAL (final 5678)' },
    ['22/10', 'UBER *TRIP', 3210],
    ['23/10', 'ZARA BRASIL', 29900],
    ['24/10', 'SEM PARAR', 4560],
  ];
  const right = [
    ['13/10', 'DROGARAIA 0123', 6745],
    ['14/10', 'SMARTFIT', 11990],
    ['15/10', 'POSTO IPIRANGA', 18000],
    ['16/10', 'RAPPI*RESTAURANTE', 6230],
    ['18/10', 'CINEMARK', 6400],
    ['19/10', 'ESTORNO NETFLIX', -5590, false, true],
    ['20/10', 'APPLE.COM/BILL', 1490],
    { h: 'Lançamentos internacionais' },
    ['21/10', 'AIRBNB * HMXYZ', 82000],
    ['21/10', 'REPASSE DE IOF', 2870],
    { h: 'Compras parceladas - próximas faturas' },
    ['12/10', 'MAGAZINE LUIZA 04/10', 15000],
    ['15/12', 'LOJA DE MOVEIS 12/12', 32000],
  ];
  const current = [...left, ...right.slice(0, 10)].filter((r) => Array.isArray(r));
  const total = sum(current.map(([, , cents, payment]) => ({ cents, payment })));

  w.text('Banco Fictício S.A.  –  Cartão Platinum  (DADOS FICTÍCIOS)', 40, 800, 11, bold);
  w.text('Titular: JOAO EXEMPLO        Cartão 5502 XXXX XXXX 1234', 40, 782);
  w.text('Vencimento 10/11/2026', 40, 764, 10, bold);
  w.text(`Total desta fatura R$ ${brl(total)}`, 330, 764, 10, bold);
  w.text('Lançamentos: compras e saques', 40, 736, 10, bold);
  w.text('DATA   ESTABELECIMENTO', 40, 718, 8);
  w.right('VALOR EM R$', 285, 718, 8);
  w.text('DATA   ESTABELECIMENTO', 310, 718, 8);
  w.right('VALOR EM R$', 555, 718, 8);

  const draw = (rows, x0, xr) => {
    let y = 700;
    for (const r of rows) {
      if (!Array.isArray(r)) {
        w.text(r.h, x0, y, 9, bold);
        y -= 16;
        continue;
      }
      const [date, desc, cents, , suffixCredit] = r;
      w.text(date, x0, y);
      w.text(desc, x0 + 34, y);
      const value = suffixCredit ? `${brl(Math.abs(cents))}-` : brl(cents);
      w.right(value, xr, y);
      y -= 16;
    }
  };
  draw(left, 40, 285);
  draw(right, 310, 555);
  w.text('Encargos: juros do rotativo 14,90% a.m.   CET 398,12% a.a.', 40, 420, 8);
  return { bytes: await doc.save(), total, count: current.length };
}

// ------------------------------------------------------------ 3. tabela
async function table() {
  const { doc, font, bold } = await makeDoc();
  const page = doc.addPage([595, 842]);
  const w = writer(page, font);
  const rows = [
    ['29/09/2026', 'SALDO ANTERIOR', 123400, 'ignore'],
    ['30/09/2026', 'SAO PAULO MERCADO LTDA', 24510],
    ['02/10/2026', 'DROGARIA SAO PAULO', 4789],
    ['03/10/2026', 'CREDITO DE PAGAMENTO', -123400, 'payment'],
    ['05/10/2026', 'ANUIDADE DIFERENCIADA PARC 02/12', 3990],
    ['08/10/2026', 'CLARO S.A. FATURA', 12999],
    ['12/10/2026', 'CABIFY BR', 2735],
    ['15/10/2026', 'DEVOLUCAO COMPRA LOJA X', -10000, 'credit'],
    ['20/10/2026', 'GLOBOPLAY', 2290],
    ['21/10/2026', 'BETANO*APOSTAS', 5000],
    ['22/10/2026', 'JUROS DE MORA', 512],
    ['25/10/2026', 'IOF DIARIO', 87],
  ];
  const counted = rows.filter((r) => r[3] !== 'ignore' && r[3] !== 'payment');
  const total = counted.reduce((a, r) => a + r[2], 0);
  w.text('Cartão Exemplo Gold — Banco Modelo (DADOS FICTÍCIOS)', 40, 800, 11, bold);
  w.text('Resumo da fatura', 40, 780, 10, bold);
  w.text('Data de fechamento: 28/10/2026', 40, 764);
  w.text('Data de vencimento: 05/11/2026', 240, 764);
  w.text(`Valor total da fatura: R$ ${brl(total)}`, 40, 748, 10, bold);
  w.text('Data', 40, 720, 9, bold);
  w.text('Histórico', 120, 720, 9, bold);
  w.right('Valor (R$)', 555, 720, 9, bold);
  let y = 702;
  for (const [date, desc, cents, flag] of rows) {
    w.text(date, 40, y);
    w.text(desc, 120, y);
    const value = cents < 0 && flag !== 'payment' ? `${brl(Math.abs(cents))}-` : brl(cents);
    w.right(value, 555, y);
    y -= 15;
  }
  w.text('TOTAL', 120, y - 6, 9, bold);
  w.right(brl(total), 555, y - 6, 9, bold);
  return { bytes: await doc.save(), total, count: counted.length + 1 };
}

const outputs = {
  'fatura-coluna-unica.pdf': await singleColumn(),
  'fatura-duas-colunas.pdf': await twoColumns(),
  'fatura-tabela.pdf': await table(),
};

const manifest = {};
for (const [name, { bytes, total, count }] of Object.entries(outputs)) {
  writeFileSync(resolve(fixturesDir, name), bytes);
  manifest[name] = { declaredTotalCents: total, parsedTransactions: count };
  console.log(`[fixtures] ${name}: total ${brl(total)} · ${count} lançamentos`);
}
writeFileSync(resolve(fixturesDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
// Exemplo servido no app (botão "Testar com uma fatura de exemplo").
writeFileSync(
  resolve(root, 'public', 'exemplo-fatura.pdf'),
  outputs['fatura-duas-colunas.pdf'].bytes,
);
