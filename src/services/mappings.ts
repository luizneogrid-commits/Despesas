/**
 * De/para: estabelecimentos não reconhecidos → categoria (e nome amigável).
 * Os mapeamentos são regras do usuário: valem para os lançamentos já
 * importados e são aplicados automaticamente nas próximas faturas.
 */
import { displayMerchant, merchantKey, normalizeText } from '../categorization/normalize';
import { FALLBACK_CATEGORY } from '../domain/categories';
import type { Category, CategoryId, RuleMatch, Transaction, UserRule } from '../domain/types';
import type { MappingInput } from '../store/appStore';

export interface PendingMerchant {
  /** Chave do estabelecimento: vira o "de" sugerido. */
  key: string;
  suggestedName: string;
  examples: string[];
  count: number;
  totalCents: number;
  lastDate: string;
  txIds: string[];
}

/** Lançamentos que nenhuma regra reconheceu ("Outros"), agrupados por estabelecimento. */
export function pendingMerchants(txs: Transaction[]): PendingMerchant[] {
  const map = new Map<string, PendingMerchant>();
  for (const t of txs) {
    if (
      t.kind === 'pagamento' ||
      t.categoryId !== FALLBACK_CATEGORY ||
      t.categorySource === 'manual'
    )
      continue;
    const key = t.merchantKey || merchantKey(t.rawDescription) || normalizeText(t.rawDescription);
    if (!key) continue;
    const cur =
      map.get(key) ??
      ({
        key,
        suggestedName: displayMerchant(t.rawDescription),
        examples: [],
        count: 0,
        totalCents: 0,
        lastDate: t.date,
        txIds: [],
      } as PendingMerchant);
    cur.count += 1;
    cur.totalCents += t.amountCents;
    cur.txIds.push(t.id);
    if (t.date > cur.lastDate) cur.lastDate = t.date;
    if (cur.examples.length < 3 && !cur.examples.includes(t.rawDescription))
      cur.examples.push(t.rawDescription);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents || b.count - a.count);
}

export const MATCH_LABELS: Record<RuleMatch, string> = {
  contem: 'contém',
  comeca: 'começa com',
  exato: 'é exatamente',
  regex: 'expressão regular',
};

function cell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Exporta o de/para em CSV (";"), legível no Excel e reimportável. */
export function mappingsToCSV(rules: UserRule[], categories: Map<CategoryId, Category>): string {
  const rows = [['de', 'tipo', 'para', 'nome']];
  for (const r of rules) {
    rows.push([
      r.pattern,
      MATCH_LABELS[r.match],
      categories.get(r.categoryId)?.name ?? r.categoryId,
      r.displayName ?? '',
    ]);
  }
  return '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

/** CSV simples com aspas, separador ";" ou ",". */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const MATCH_BY_LABEL: Record<string, RuleMatch> = {
  contem: 'contem',
  contém: 'contem',
  comeca: 'comeca',
  'começa com': 'comeca',
  'comeca com': 'comeca',
  exato: 'exato',
  'é exatamente': 'exato',
  'e exatamente': 'exato',
  regex: 'regex',
  'expressão regular': 'regex',
};

export interface ParsedMappings {
  entries: MappingInput[];
  errors: string[];
}

/** Lê um CSV de de/para (colunas: de; tipo; para; nome). Categorias por nome ou id. */
export function parseMappingsCSV(
  text: string,
  categories: Map<CategoryId, Category>,
): ParsedMappings {
  const byName = new Map<string, CategoryId>();
  for (const c of categories.values()) {
    byName.set(normalizeText(c.name), c.id);
    byName.set(normalizeText(c.id), c.id);
  }
  const rows = parseCSV(text);
  const entries: MappingInput[] = [];
  const errors: string[] = [];
  // Colunas pelo cabeçalho (de, tipo, para/categoria, nome); sem cabeçalho: de;tipo;para;nome.
  let cols = { de: 0, tipo: 1, para: 2, nome: 3 };
  const header = (rows[0] ?? []).map((h) => normalizeText(h));
  const hasHeader =
    header.includes('DE') && (header.includes('PARA') || header.includes('CATEGORIA'));
  if (hasHeader) {
    const at = (...names: string[]) => header.findIndex((h) => names.includes(h));
    cols = { de: at('DE'), tipo: at('TIPO'), para: at('PARA', 'CATEGORIA'), nome: at('NOME') };
  }
  rows.forEach((row, i) => {
    if (hasHeader && i === 0) return;
    const get = (idx: number) => (idx >= 0 ? (row[idx] ?? '').trim() : '');
    const pattern = get(cols.de).replace(/^'/, '');
    if (!pattern) return;
    const tipo = get(cols.tipo).toLowerCase();
    const match = MATCH_BY_LABEL[tipo] ?? 'contem';
    const paraRaw = get(cols.para);
    const categoryId = byName.get(normalizeText(paraRaw));
    if (!categoryId) {
      errors.push(`Linha ${i + 1}: categoria "${paraRaw}" não existe.`);
      return;
    }
    const nome = get(cols.nome).replace(/^'/, '');
    entries.push({ pattern, match, categoryId, ...(nome ? { displayName: nome } : {}) });
  });
  return { entries, errors };
}
