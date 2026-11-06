import { compileRules } from '../categorization/categorizer';
import { addMonths, isValidDate, parseISO, toISO, yearMonth } from '../domain/dates';
import type { PersistedState, Statement, Transaction, TxKind } from '../domain/types';
import { SCHEMA_VERSION } from '../storage/persist';
import { toTransaction } from './importService';

/**
 * Dados de exemplo (fictícios) para o primeiro acesso: 4 faturas com um
 * perfil de gasto plausível. São removidos automaticamente na primeira
 * importação real.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pool = [desc: string, perMonth: number, min: number, max: number];

const VARIABLE: Pool[] = [
  ['CARREFOUR HIPER 123', 2, 18000, 52000],
  ['PAO DE ACUCAR 1452', 2, 6000, 26000],
  ['HORTIFRUTI BOM PRECO', 1, 4000, 12000],
  ['IFD*PIZZARIA BELLA', 2, 4500, 9500],
  ['IFD*BURGER DO ZE', 2, 3500, 7000],
  ['IFD*SUSHI KAZU', 1, 6000, 14000],
  ['IFD*MARMITARIA DA VILA', 2, 2800, 4200],
  ['RAPPI*RESTAURANTE', 1, 4000, 9000],
  ['UBER *TRIP', 8, 1200, 4800],
  ['99APP *99APP', 3, 1000, 3500],
  ['RESTAURANTE COCO BAMBU', 0.6, 18000, 32000],
  ['BAR DO JULINHO', 1.5, 6000, 16000],
  ['PADARIA REAL', 4, 900, 3200],
  ['STARBUCKS MORUMBI', 1, 1800, 3500],
  ['POSTO IPIRANGA', 2, 15000, 26000],
  ['ESTAPAR SHOPPING', 1, 1500, 3000],
  ['DROGASIL 2231', 1, 3000, 14000],
  ['AMAZON MARKETPLACE', 1, 5000, 30000],
  ['MERCADOLIVRE*VENDEDOR', 0.6, 4000, 25000],
  ['CINEMARK', 0.5, 4000, 9000],
  ['PETZ PINHEIROS', 0.5, 8000, 22000],
  ['RENNER', 0.4, 9000, 35000],
  ['XPTO COMERCIO 0042', 0.6, 4000, 15000],
  ['JOSE C OLIVEIRA ME', 0.8, 3000, 9000],
  ['NOVA ERA COM DE ALIM', 0.5, 6000, 18000],
];

const FIXED: Array<[desc: string, cents: number, fromMonth: number, international?: boolean]> = [
  ['NETFLIX.COM', 5590, 0],
  ['SPOTIFY', 2190, 0],
  ['APPLE.COM/BILL', 1490, 0],
  ['SMART FIT', 12990, 0],
  ['VIVO FIBRA', 12990, 0],
  ['OPENAI *CHATGPT SUBSCR', 11000, 0, true],
  ['DISNEY PLUS', 3390, 2],
];

const MONTHS = 4;

export function buildDemoState(today = new Date()): PersistedState {
  const rules = compileRules([]);
  const latest = yearMonth(today.getFullYear(), today.getMonth() + 1);
  const statements: Statement[] = [];
  const transactions: Transaction[] = [];
  let previousTotal = 248700;

  for (let mi = 0; mi < MONTHS; mi++) {
    const ref = addMonths(latest, mi - (MONTHS - 1));
    const rand = rng(20261105 + mi * 7919);
    const { y, m } = parseISO(`${ref}-01`);
    const statementId = `demo-${ref}`;
    const prevRef = addMonths(ref, -1);
    const prev = parseISO(`${prevRef}-01`);
    const day = (offset: number) => {
      // período da fatura: dia 8 do mês anterior até dia 7 do mês da fatura
      const d = 8 + offset;
      if (d <= 30 && isValidDate(prev.y, prev.m, d)) return toISO(prev.y, prev.m, d);
      return toISO(y, m, Math.max(1, Math.min(7, d - 30)));
    };
    const randomDay = () => day(Math.floor(rand() * 37));

    const items: Array<{
      date: string;
      rawDescription: string;
      amountCents: number;
      kind: TxKind;
      international: boolean;
      installment?: { current: number; total: number };
      foreign?: { currency: string; amountCents: number };
    }> = [];
    const add = (
      rawDescription: string,
      amountCents: number,
      kind: TxKind = 'compra',
      extra: Partial<(typeof items)[number]> = {},
    ) =>
      items.push({
        date: randomDay(),
        rawDescription,
        amountCents,
        kind,
        international: false,
        ...extra,
      });

    for (const [desc, perMonth, min, max] of VARIABLE) {
      let count = Math.floor(perMonth);
      if (rand() < perMonth - count) count += 1;
      if (perMonth >= 1) count += Math.round((rand() - 0.5) * 2);
      for (let i = 0; i < Math.max(0, count); i++)
        add(desc, Math.round(min + rand() * (max - min)));
    }
    for (const [desc, cents, fromMonth, intl] of FIXED) {
      if (mi < fromMonth) continue;
      add(
        desc,
        cents,
        'compra',
        intl ? { international: true, foreign: { currency: 'USD', amountCents: 2000 } } : {},
      );
      if (intl)
        add('IOF COMPRA INTERNACIONAL', Math.round(cents * 0.035), 'encargo', {
          international: true,
        });
    }
    // Parceladas: a data é a da compra original, como nas faturas reais.
    const bought = (current: number, d: number) => {
      const pm = parseISO(`${addMonths(ref, -current)}-01`);
      return toISO(pm.y, pm.m, d);
    };
    const parcel = (desc: string, cents: number, current: number, total: number, day: number) =>
      add(desc, cents, 'compra', { installment: { current, total }, date: bought(current, day) });
    parcel('MAGAZINE LUIZA', 25000, mi + 1, 6, 12);
    parcel('LOJA DE MOVEIS', 32000, mi + 5, 10, 23);
    if (mi >= 1) parcel('LATAM AIRLINES', 41333, mi, 3, 18);
    if (mi >= 1) parcel('APPLE STORE IPHONE', 54158, mi, 12, 9);
    if (mi >= 3) parcel('DECATHLON', 18990, 1, 3, 27);
    if (mi === 2) {
      add('BOOKING.COM HOTEL', 68000);
      add('ESTORNO AMAZON MARKETPLACE', -5990, 'estorno');
    }
    add('PAGAMENTO RECEBIDO', -previousTotal, 'pagamento');

    const txs = items.map((it, i) =>
      toTransaction(it, { id: `${statementId}-${i}`, statementId, referenceMonth: ref }, rules),
    );
    const total = txs.reduce((a, t) => (t.kind === 'pagamento' ? a : a + t.amountCents), 0);
    previousTotal = total;
    transactions.push(...txs);
    statements.push({
      id: statementId,
      fileName: `fatura-exemplo-${ref}.pdf`,
      fileHash: `demo-${ref}`,
      issuerId: 'exemplo',
      issuerName: 'Cartão de exemplo',
      referenceMonth: ref,
      dueDate: toISO(y, m, 15),
      closingDate: toISO(y, m, 7),
      declaredTotalCents: total,
      parsedTotalCents: total,
      transactionCount: txs.length,
      importedAt: new Date(Date.UTC(y, m - 1, 8)).toISOString(),
      warnings: [],
      isDemo: true,
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    statements,
    transactions,
    rules: [],
    customCategories: [],
  };
}
