/**
 * Leitor de extratos/faturas em CSV. Cada banco usa colunas diferentes, então
 * as colunas são reconhecidas pelo cabeçalho (data, descrição, valor ou
 * crédito/débito, saldo). Aceita "1.234,56" e "1234.56", datas dd/mm/aaaa e
 * aaaa-mm-dd. Exemplos: Nubank conta ("Data,Valor,Identificador,Descrição"),
 * Nubank cartão ("date,title,amount"), Itaú/Bradesco/Inter exportados.
 */
import { normalizeText, prettifyDescription } from '../categorization/normalize';
import { isValidDate, normalizeYear, toISO, yearMonth } from '../domain/dates';
import type { AccountType } from '../domain/types';
import { parseCSV } from '../utils/csv';
import { detectIssuer } from './metadata';
import { classifyAccount } from './parseAccount';
import { classify, type ParsedStatement, type ParsedTransaction } from './parseStatement';

const COLS = {
  date: /^(data|date|dt|data (do )?lan[cç]amento|data (da )?movimenta[cç][aã]o|data movimento|dia)$/,
  desc: /(descri|hist[oó]rico|lan[cç]amento|title|t[ií]tulo|estabelecimento|memo|detalhe|favorecido)/,
  amount: /^(valor|amount|quantia|value|valor \(r\$\)|valor r\$|montante)$/,
  credit: /(cr[eé]dito|entrada)/,
  debit: /(d[eé]bito|sa[ií]da)/,
  balance: /(saldo|balance)/,
  id: /^(identificador|id|fitid|c[oó]digo)$/,
};

function header(cell: string): string {
  return cell
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(raw: string): string | undefined {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDate(y, mo, d) ? toISO(y, mo, d) : undefined;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), normalizeYear(Number(m[3]))];
    return isValidDate(y, mo, d) ? toISO(y, mo, d) : undefined;
  }
  return undefined;
}

/** Valor como escrito no arquivo ("-1.234,56", "1234.56", "R$ 10,00", "(10,00)"). */
export function parseFlexibleAmount(raw: string): number | undefined {
  let s = raw.replace(/R\$|\s/g, '').trim();
  if (!s) return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/^\+/, '');
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s))
    s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

export function parseCSVStatement(
  text: string,
  opts: { fileName?: string; forceType?: AccountType } = {},
): ParsedStatement {
  const rows = parseCSV(text);
  const headerIdx = rows.slice(0, 15).findIndex((r) => {
    const h = r.map(header);
    return (
      h.some((c) => COLS.date.test(c)) &&
      h.some((c) => COLS.amount.test(c) || COLS.credit.test(c) || COLS.debit.test(c))
    );
  });
  if (headerIdx < 0) {
    return {
      issuer: detectIssuer(`${opts.fileName ?? ''} ${text.slice(0, 500)}`),
      accountType: opts.forceType ?? 'conta',
      format: 'csv',
      referenceMonth: '1970-01',
      referenceEstimated: true,
      transactions: [],
      unrecognizedLines: rows.slice(0, 5).map((r) => r.join(' | ')),
      skippedFutureCount: 0,
      warnings: ['Não encontramos as colunas de data e valor neste CSV.'],
    };
  }
  const h = (rows[headerIdx] ?? []).map(header);
  const find = (re: RegExp, exclude: number[] = []) =>
    h.findIndex((c, i) => re.test(c) && !exclude.includes(i));
  const iDate = find(COLS.date);
  const iAmount = find(COLS.amount);
  const iCredit = iAmount < 0 ? find(COLS.credit) : -1;
  const iDebit = iAmount < 0 ? find(COLS.debit) : -1;
  const iBalance = find(COLS.balance);
  const iId = find(COLS.id);
  const iDesc = find(COLS.desc, [iDate, iAmount, iCredit, iDebit, iBalance, iId]);

  // Cartão: cabeçalho típico de fatura (title/estabelecimento, sem saldo, sem crédito/débito).
  const looksCard =
    iBalance < 0 && iCredit < 0 && iDebit < 0 && h.some((c) => /^(title|estabelecimento)$/.test(c));
  const accountType: AccountType = opts.forceType ?? (looksCard ? 'cartao' : 'conta');

  const transactions: ParsedTransaction[] = [];
  const unrecognizedLines: string[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const date = parseDate(row[iDate] ?? '');
    const description = (iDesc >= 0 ? row[iDesc] : '')?.replace(/\s+/g, ' ').trim() ?? '';
    let money: number | undefined;
    if (iAmount >= 0) money = parseFlexibleAmount(row[iAmount] ?? '');
    else {
      const c = parseFlexibleAmount(row[iCredit] ?? '');
      const d = parseFlexibleAmount(row[iDebit] ?? '');
      if (c) money = Math.abs(c);
      else if (d) money = -Math.abs(d);
    }
    if (!date || money === undefined || money === 0 || !description) {
      if (row.some((c) => c.trim())) unrecognizedLines.push(row.join(' | '));
      continue;
    }
    const normalized = normalizeText(description);
    // Conta: negativo = saída. Cartão (Nubank etc.): positivo = compra.
    const out = accountType === 'cartao' ? money > 0 : money < 0;
    const amountCents = out ? Math.abs(money) : -Math.abs(money);
    const kind =
      accountType === 'cartao'
        ? classify(normalized, amountCents).kind
        : classifyAccount(normalized, !out);
    const balance = iBalance >= 0 ? parseFlexibleAmount(row[iBalance] ?? '') : undefined;
    const id = iId >= 0 ? row[iId]?.trim() : undefined;
    transactions.push({
      date,
      description: prettifyDescription(description),
      rawDescription: description,
      amountCents,
      kind,
      international: false,
      sourceLine: row.join(';'),
      ...(balance !== undefined ? { balanceCents: balance } : {}),
      ...(id ? { externalId: `csv:${id}` } : {}),
    });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));
  const first = transactions[0];
  const last = transactions.at(-1);
  const [y, m] = (last?.date ?? '1970-01-01').split('-').map(Number);
  const withBalance = transactions.filter((t) => t.balanceCents !== undefined);
  const closing = withBalance.at(-1)?.balanceCents;
  const firstBal = withBalance[0];
  const opening =
    firstBal && firstBal.balanceCents !== undefined
      ? firstBal.balanceCents + firstBal.amountCents
      : undefined;
  return {
    issuer: detectIssuer(`${opts.fileName ?? ''} ${text.slice(0, 2000)}`),
    accountType,
    format: 'csv',
    referenceMonth: yearMonth(y ?? 1970, m ?? 1),
    referenceEstimated: accountType === 'cartao',
    transactions,
    unrecognizedLines: unrecognizedLines.slice(0, 50),
    skippedFutureCount: 0,
    warnings: transactions.length === 0 ? ['Nenhum lançamento encontrado no CSV.'] : [],
    ...(first ? { periodStart: first.date } : {}),
    ...(last ? { periodEnd: last.date } : {}),
    ...(accountType === 'conta' && closing !== undefined && opening !== undefined
      ? { openingBalanceCents: opening, closingBalanceCents: closing }
      : {}),
  };
}
