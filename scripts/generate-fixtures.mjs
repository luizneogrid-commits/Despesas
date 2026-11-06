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

// ------------------------------------------------------------ 4. extrato de conta (PDF)
// Data só no primeiro lançamento do dia, descrição em duas linhas, valores SEM
// sinal e coluna de saldo: o leitor deduz entrada/saída pela variação do saldo.
async function accountStatement() {
  const { doc, font, bold } = await makeDoc();
  const page = doc.addPage([595, 842]);
  const w = writer(page, font);
  const opening = 200000;
  const rows = [
    ['01/10', 'PIX RECEBIDO EMPRESA EXEMPLO LTDA', 850000, null],
    [null, 'PIX ENVIADO', -220000, 'MARIA DA SILVA - •••.456.789-•• - BCO EXEMPLO'],
    ['03/10', 'COMPRA CARTAO DEBITO PADARIA REAL', -2350, 'SAO PAULO BR'],
    [null, 'PAGAMENTO DE BOLETO ENEL SP', -18990, null],
    ['10/10', 'PAGAMENTO FATURA CARTAO', -282393, null],
    ['12/10', 'APLICACAO CDB', -100000, null],
    ['15/10', 'SAQUE BANCO24HORAS', -20000, null],
    ['20/10', 'TAR PACOTE SERVICOS', -3290, null],
    ['25/10', 'ESTORNO COMPRA LOJA X', 4590, null],
    ['31/10', 'RENDIMENTO POUPANCA', 1234, null],
    [null, 'PIX ENVIADO', -15000, 'JOAO PEDREIRO'],
  ];
  let bal = opening;
  w.text('Banco Exemplo S.A. · Extrato de conta corrente (DADOS FICTÍCIOS)', 40, 800, 11, bold);
  w.text('Cliente: ANA EXEMPLO     Agência 1234   Conta 56789-0', 40, 782);
  w.text('Período: 01/10/2026 a 31/10/2026', 40, 766);
  w.text('Data', 40, 740, 9, bold);
  w.text('Histórico', 100, 740, 9, bold);
  w.right('Valor (R$)', 470, 740, 9, bold);
  w.right('Saldo (R$)', 555, 740, 9, bold);
  let y = 722;
  w.text('SALDO ANTERIOR', 100, y);
  w.right(brl(opening), 555, y);
  y -= 16;
  for (const [date, desc, cents, cont] of rows) {
    bal += cents;
    if (date) w.text(date, 40, y);
    w.text(desc, 100, y);
    w.right(brl(Math.abs(cents)), 470, y);
    w.right(brl(bal), 555, y);
    y -= 14;
    if (cont) {
      w.text(cont, 100, y, 8);
      y -= 14;
    }
    y -= 2;
  }
  w.text(`Saldo final em 31/10/2026 ${brl(bal)}`, 40, y - 10, 10, bold);
  const net = bal - opening;
  return { bytes: await doc.save(), total: net, count: rows.length, closing: bal };
}

// ------------------------------------------------------------ 7. faturas com cidade
// O nome do estabelecimento vem acompanhado da cidade (campo "nome/cidade/país"
// das transações de cartão): numa coluna própria, cortada em 13 caracteres,
// grudada no nome ou com o estabelecimento à esquerda da data.
function cityRows(w, rows, cols, y0, bold) {
  let y = y0;
  for (const r of rows) {
    for (const [key, x] of Object.entries(cols)) {
      if (key === 'value') continue;
      const v = r[key];
      if (v) w.text(v, x, y);
    }
    const value = r.cents < 0 && !r.payment ? `${brl(Math.abs(r.cents))}-` : brl(r.cents);
    w.right(value, cols.value, y);
    y -= 15;
  }
  return y;
}

const countable = (rows) => rows.filter((r) => !r.payment);
const totalOf = (rows) => countable(rows).reduce((a, r) => a + r.cents, 0);

// 7a. Data | Estabelecimento | Cidade | Valor
async function cityColumn() {
  const { doc, font, bold } = await makeDoc();
  const page = doc.addPage([595, 842]);
  const w = writer(page, font);
  const rows = [
    { date: '03/10', name: 'PADARIA REAL', city: 'SAO PAULO', cents: 2350 },
    { date: '04/10', name: 'RESTAURANTE SABOR MINEIRO', city: 'BELO HORIZONT', cents: 8790 },
    { date: '05/10', name: 'UBER *TRIP HELP.UBER.COSAO PAULO BR', cents: 1840 },
    { date: '06/10', name: 'MERCADO DO JOAO CURITIBA PR', cents: 15420 },
    { date: '07/10', name: 'AMAZON WEB SERVICES', city: 'SEATTLE US', cents: 5432 },
    { date: '08/10', name: 'DROGARIA SAO PAULO', city: 'CAMPINAS', cents: 6745 },
    { date: '09/10', name: 'POSTO IPIRANGA', city: 'RIO DE JANEIRO', cents: 18000 },
    { date: '10/10', name: 'PAGAMENTO EFETUADO', cents: -150000, payment: true },
    { date: '11/10', name: 'NETFLIX.COM', city: 'SAO PAULO', cents: 5590 },
    { date: '12/10', name: 'LOJA DE MOVEIS 03/10', city: 'SAO JOSE DOS', cents: 32000 },
    { date: '13/10', name: 'IFD*PIZZARIA BELLA', city: 'SAO PAULO', cents: 4590 },
    { date: '14/10', name: 'CAFETERIA NATAL', city: 'NATAL', cents: 1500 },
  ];
  const total = totalOf(rows);
  w.text('Cartão Exemplo Platinum — Banco Modelo (DADOS FICTÍCIOS)', 40, 800, 11, bold);
  w.text('Vencimento: 05/11/2026', 40, 780);
  w.text(`Total desta fatura R$ ${brl(total)}`, 240, 780, 10, bold);
  const cols = { date: 40, name: 95, city: 330, value: 555 };
  w.text('Data', cols.date, 750, 9, bold);
  w.text('Estabelecimento', cols.name, 750, 9, bold);
  w.text('Cidade', cols.city, 750, 9, bold);
  w.right('Valor (R$)', cols.value, 750, 9, bold);
  cityRows(w, rows, cols, 732, bold);
  return { bytes: await doc.save(), total, count: rows.length };
}

// 7b. Estabelecimento | Data | Local | Valor (nome na coluna mais à esquerda), em duas páginas
async function merchantFirst() {
  const { doc, font, bold } = await makeDoc();
  const page1 = [
    { name: 'PADARIA REAL', date: '03/10', city: 'SAO PAULO', cents: 2350 },
    { name: 'RESTAURANTE SABOR MINEIRO', date: '04/10', city: 'BELO HORIZONT', cents: 8790 },
    { name: 'UBER *TRIP', date: '05/10', city: 'SAO PAULO', cents: 1840 },
    { name: 'NETFLIX.COM', date: '06/10', cents: 5590 },
    { name: 'DROGARIA SAO PAULO', date: '08/10', city: 'CAMPINAS', cents: 6745 },
    { name: 'SUPERMERCADO BOM PRECO', date: '09/10', city: 'RECIFE', cents: 24510 },
    { name: 'PAGAMENTO RECEBIDO', date: '10/10', cents: -150000, payment: true },
    { name: 'SPOTIFY', date: '11/10', city: 'STOCKHOLM', cents: 2190 },
  ];
  const page2 = [
    { name: 'LOJA DE MOVEIS PARCELA 3 DE 10', date: '12/10', city: 'SAO JOSE DOS', cents: 32000 },
    { name: 'AMAZON MARKETPLACE', date: '13/10', cents: 12990 },
    { name: 'ESTORNO NETFLIX', date: '14/10', cents: -5590 },
    { name: 'POSTO IPIRANGA', date: '15/10', city: 'SOROCABA', cents: 18000 },
  ];
  const all = [...page1, ...page2];
  const total = totalOf(all);
  const cols = { name: 40, date: 260, city: 320, value: 555 };
  let page = doc.addPage([595, 842]);
  let w = writer(page, font);
  w.text('Cartão Exemplo Black — Banco Modelo (DADOS FICTÍCIOS)', 40, 800, 11, bold);
  w.text('Data de vencimento 05/11/2026', 40, 780);
  w.text(`Total desta fatura R$ ${brl(total)}`, 300, 780, 10, bold);
  w.text('Estabelecimento', cols.name, 750, 9, bold);
  w.text('Data', cols.date, 750, 9, bold);
  w.text('Local', cols.city, 750, 9, bold);
  w.right('Valor (R$)', cols.value, 750, 9, bold);
  cityRows(w, page1, cols, 732, bold);
  // 2ª página sem repetir o cabeçalho
  page = doc.addPage([595, 842]);
  w = writer(page, font);
  cityRows(w, page2, cols, 800, bold);
  return { bytes: await doc.save(), total, count: all.length };
}

// 7c. Sem cabeçalho: nome à esquerda, data, cidade (inclui cidades fora da lista) e valor
async function noHeader() {
  const { doc, font, bold } = await makeDoc();
  const page = doc.addPage([595, 842]);
  const w = writer(page, font);
  const rows = [
    { name: 'PADARIA REAL', date: '03/10', city: 'SAO PAULO', cents: 2350 },
    { name: 'ACOUGUE DO ZE', date: '04/10', city: 'ITAPETININGA', cents: 8790 },
    { name: 'FARMACIA POPULAR', date: '05/10', city: 'CAMPINAS', cents: 1840 },
    { name: 'RESTAURANTE DA PRACA', date: '06/10', city: 'SAO PAULO', cents: 5590 },
    { name: 'MERCADINHO ESTRELA', date: '07/10', city: 'ITAPETININGA', cents: 4590 },
    { name: 'POSTO TREVO', date: '08/10', city: 'SOROCABA', cents: 18000 },
    { name: 'LIVRARIA CULTURA', date: '09/10', city: 'SAO PAULO', cents: 6745 },
  ];
  const total = totalOf(rows);
  w.text('Fatura Cartão Exemplo (DADOS FICTÍCIOS)', 40, 800, 11, bold);
  w.text('Vencimento: 15/11/2026', 40, 780);
  w.text(`Total desta fatura R$ ${brl(total)}`, 240, 780, 10, bold);
  const cols = { name: 40, date: 250, city: 310, value: 555 };
  const y = cityRows(w, rows, cols, 750, bold);
  w.text('Pagamento mínimo', cols.name, y - 10);
  w.text('15/11', cols.date, y - 10);
  w.right(brl(Math.round(total * 0.15)), cols.value, y - 10);
  return { bytes: await doc.save(), total, count: rows.length };
}

const account = await accountStatement();
writeFileSync(resolve(fixturesDir, 'extrato-conta.pdf'), account.bytes);
console.log(
  `[fixtures] extrato-conta.pdf: ${account.count} movimentações · saldo final ${brl(account.closing)}`,
);

// ------------------------------------------------------------ 5. OFX e 6. CSV
const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20261101120000[-3:BRT]<LANGUAGE>POR</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0341<BRANCHID>1234<ACCTID>56789-0<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001000000[-3:BRT]<DTEND>20261031000000[-3:BRT]
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005000000[-3:BRT]<TRNAMT>7500.00<FITID>A1<MEMO>SALARIO EMPRESA EXEMPLO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006000000[-3:BRT]<TRNAMT>-89.90<FITID>A2<MEMO>COMPRA CARTAO DEB DROGASIL</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261008000000[-3:BRT]<TRNAMT>-1500.00<FITID>A3<MEMO>PAGTO FATURA CARTAO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010000000[-3:BRT]<TRNAMT>-2000.00<FITID>A4<MEMO>PIX ENVIADO JOS\xc9 ALUGUEL</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261015000000[-3:BRT]<TRNAMT>-500.00<FITID>A5<MEMO>APLICACAO RENDE FACIL</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261020000000[-3:BRT]<TRNAMT>120.00<FITID>A6<MEMO>PIX RECEBIDO CARLA</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>4630.10<DTASOF>20261031000000[-3:BRT]</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`;
writeFileSync(resolve(fixturesDir, 'extrato-conta.ofx'), Buffer.from(ofx, 'latin1'));
const csv = `Data,Valor,Identificador,Descrição
01/11/2026,"8.500,00",f1,Transferência recebida pelo Pix - EMPRESA EXEMPLO
03/11/2026,"-23,50",f2,Compra no débito - PADARIA REAL
05/11/2026,"-1.881,04",f3,Pagamento de fatura
07/11/2026,"-150,00",f4,Transferência enviada pelo Pix - JOAO PEDREIRO
10/11/2026,"-300,00",f5,Aplicação RDB
`;
writeFileSync(resolve(fixturesDir, 'extrato-conta.csv'), csv);
console.log('[fixtures] extrato-conta.ofx, extrato-conta.csv');

const outputs = {
  'fatura-coluna-unica.pdf': await singleColumn(),
  'fatura-duas-colunas.pdf': await twoColumns(),
  'fatura-tabela.pdf': await table(),
  'fatura-cidades.pdf': await cityColumn(),
  'fatura-estab-esquerda.pdf': await merchantFirst(),
  'fatura-sem-cabecalho.pdf': await noHeader(),
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
