/**
 * Qual parte da linha é o nome do estabelecimento?
 *
 * Faturas e extratos misturam, na mesma linha, o estabelecimento e
 * informações que não o identificam: cidade, UF, país, número do cartão.
 * Às vezes em colunas separadas ("PADARIA REAL | SAO PAULO"), às vezes com o
 * estabelecimento ANTES da data ("PADARIA REAL  05/10  SAO PAULO  23,50"),
 * às vezes grudado ("HELP.UBER.COSAO PAULO BR").
 *
 * A decisão usa, em ordem de confiança:
 *  1. o cabeçalho da tabela ("Estabelecimento", "Cidade", "Local"…) e a
 *     posição horizontal de cada coluna;
 *  2. a geometria do documento: uma coluna cujos textos são, na maioria,
 *     cidades é coluna de lugar;
 *  3. a repetição: um final que se repete em vários estabelecimentos
 *     diferentes ("… SAO PAULO") é lugar, não nome;
 *  4. a lista de cidades/UF/países (places.ts).
 */
import { normalizeText, prettifyDescription } from '../categorization/normalize';
import {
  isForeignLocation,
  isLocationText,
  prettyLocation,
  splitGluedLocation,
  splitTrailingLocation,
} from './places';

export type ColumnRole = 'merchant' | 'location' | 'date' | 'amount' | 'other';

export interface Part {
  text: string;
  /** Posição horizontal (pontos do PDF, ou caracteres em texto puro). */
  x: number;
  /** Veio antes da data na linha (coluna mais à esquerda). */
  lead?: boolean;
  /** Largura média de um caractere (para posicionar palavras dentro do bloco). */
  charWidth?: number;
}

export interface HeaderModel {
  columns: Array<{ x: number; role: ColumnRole }>;
  /** Quanto o texto de uma célula pode começar à esquerda do rótulo da coluna. */
  tolerance: number;
}

const HEADER_LABELS: Array<[RegExp, ColumnRole]> = [
  [
    /^(ESTABELECIMENTO|DESCRICAO|HISTORICO|LANCAMENTO|LANCAMENTOS|TRANSACAO|TRANSACOES|COMPRA|COMPRAS|NOME|FAVORECIDO|DESCRICAO DO LANCAMENTO|ESTABELECIMENTO COMERCIAL)\b/,
    'merchant',
  ],
  [
    /^(CIDADE|LOCAL|LOCALIDADE|MUNICIPIO|PAIS|UF|ESTADO|CIDADE UF|CIDADE PAIS|LOCAL DA COMPRA)\b/,
    'location',
  ],
  [/^(DATA|DIA|DT)\b/, 'date'],
  [/^(VALOR|VALORES|R|US|DEBITO|CREDITO|SALDO|TOTAL|VALOR EM R|VALOR R|VALOR US)\b/, 'amount'],
  [
    /^(CATEGORIA|DOC|DOCUMENTO|N DOC|NUMERO|PARCELA|PARCELAS|CARTAO|FINAL|COTACAO|DOLAR|AUTORIZACAO)\b/,
    'other',
  ],
];

function roleOfLabel(text: string): ColumnRole | null {
  const n = normalizeText(text);
  for (const [re, role] of HEADER_LABELS) if (re.test(n)) return role;
  return null;
}

/**
 * Linha de cabeçalho: sem valores, com pelo menos dois rótulos conhecidos,
 * sendo um deles de descrição ou de lugar.
 */
export function detectHeader(parts: Part[]): HeaderModel | null {
  const columns: HeaderModel['columns'] = [];
  for (const p of parts) {
    const tokens = normalizeText(p.text).split(' ').filter(Boolean);
    const roles = tokens.map((t) => roleOfLabel(t));
    // "DATA ESTABELECIMENTO" num item só: um rótulo por palavra.
    if (tokens.length > 1 && roles.every(Boolean) && new Set(roles).size > 1) {
      let offset = 0;
      tokens.forEach((t, i) => {
        const role = roles[i];
        if (role) columns.push({ x: p.x + offset * (p.charWidth ?? 5), role });
        offset += t.length + 1;
      });
      continue;
    }
    const role = roleOfLabel(p.text);
    if (role) columns.push({ x: p.x, role });
  }
  const roles = new Set(columns.map((c) => c.role));
  if (columns.length < 2 || (!roles.has('merchant') && !roles.has('location'))) return null;
  columns.sort((a, b) => a.x - b.x);
  let minGap = Infinity;
  for (let i = 1; i < columns.length; i++) {
    const gap = (columns[i]?.x ?? 0) - (columns[i - 1]?.x ?? 0);
    if (gap > 0) minGap = Math.min(minGap, gap);
  }
  return { columns, tolerance: Math.min(14, Number.isFinite(minGap) ? minGap * 0.4 : 14) };
}

export function roleAt(header: HeaderModel, x: number): ColumnRole | undefined {
  let role: ColumnRole | undefined;
  for (const c of header.columns) {
    if (c.x <= x + header.tolerance) role = c.role;
    else break;
  }
  return role;
}

/** O cabeçalho vale para esta linha? (outra coluna da página pode ter outra geometria) */
export function headerFits(header: HeaderModel, dateX: number | undefined, parts: Part[]): boolean {
  const first = header.columns[0];
  if (!first) return false;
  const dateCol = header.columns.find((c) => c.role === 'date');
  if (
    dateCol &&
    dateX !== undefined &&
    Math.abs(dateX - dateCol.x) > Math.max(30, header.tolerance * 3)
  ) {
    return false;
  }
  return parts.every((p) => p.x >= first.x - Math.max(20, header.tolerance * 2));
}

/** O cabeçalho põe o estabelecimento antes da data ("Estabelecimento | Data | Cidade | Valor")? */
export function headerMerchantFirst(header: HeaderModel): boolean {
  const merchant = header.columns.find((c) => c.role === 'merchant');
  const date = header.columns.find((c) => c.role === 'date');
  return Boolean(merchant && date && merchant.x < date.x);
}

const MASK = /^(?:[•*xX]{2,}[\s.-]?)+\d{0,4}$|^final\s*\d{4}$/i;
/** Rótulo antes da data ("Pagamento em", "Compras de"), não um estabelecimento. */
const LABEL_LIKE = /\b(EM|DE|DA|DO|ATE|NO|NA|A)$|:$/;
/** Linha do titular ("MARIA S SILVA (final 1234)"). */
const OWNER_LINE = /\bfinal\s*\d{4}\b|\(final/i;

export interface DocStats {
  /** Finais (1–4 palavras) que se repetem em estabelecimentos diferentes. */
  repeatedTails: Set<string>;
  /** Posições x de colunas que são, na maioria, lugares (layout sem cabeçalho). */
  locationXs: number[];
}

/** Estatísticas do documento inteiro, a partir das partes de texto de cada lançamento. */
export function buildDocStats(rows: Part[][]): DocStats {
  const tailPrefixes = new Map<string, Set<string>>();
  const xs: Array<{ x: number; loc: boolean; text: string }> = [];
  for (const parts of rows) {
    const after = parts.filter((p) => !p.lead);
    // Com o nome antes da data, a 1ª coluna depois dela já pode ser a de lugar.
    const leadName = parts.some((p) => p.lead && isMerchantLikeLead(p.text));
    (leadName ? after : after.slice(1)).forEach((p) =>
      xs.push({
        x: p.x,
        loc: isLocationText(p.text, { strong: true }),
        text: normalizeText(p.text),
      }),
    );
    const joined = normalizeText(parts.map((p) => p.text).join(' '));
    const tokens = joined.split(' ').filter(Boolean);
    for (let n = 1; n <= 4 && n < tokens.length; n++) {
      const tail = tokens.slice(-n).join(' ');
      const prefix = tokens.slice(0, -n).join(' ');
      if (!/[A-Z]{2}/.test(tail)) continue;
      const set = tailPrefixes.get(tail) ?? new Set<string>();
      set.add(prefix.split(' ').slice(0, 2).join(' '));
      tailPrefixes.set(tail, set);
    }
  }
  const minRepeat = Math.max(3, Math.ceil(rows.length * 0.12));
  const repeatedTails = new Set<string>();
  for (const [tail, prefixes] of tailPrefixes) {
    // Precisa repetir em estabelecimentos diferentes e parecer lugar (não "LTDA", "ONLINE"…).
    if (prefixes.size >= minRepeat && isLocationText(tail, { strong: true }))
      repeatedTails.add(tail);
  }
  // Coluna de lugar sem cabeçalho: agrupa posições x próximas.
  xs.sort((a, b) => a.x - b.x);
  const locationXs: number[] = [];
  let group: typeof xs = [];
  const flush = () => {
    if (group.length >= 3) {
      const known = group.filter((g) => g.loc).length / group.length;
      const distinct = new Set(group.map((g) => g.text)).size / group.length;
      // Coluna de lugar: muitas cidades conhecidas, ou poucos valores que se repetem e incluem cidade.
      if (known >= 0.4 || (known > 0 && distinct <= 0.6))
        locationXs.push(Math.min(...group.map((g) => g.x)));
    }
    group = [];
  };
  for (const item of xs) {
    const first = group[0];
    if (first && item.x - first.x > 12) flush();
    group.push(item);
  }
  flush();
  return { repeatedTails, locationXs };
}

export interface MerchantChoice {
  merchant: string;
  location?: string;
  /** Não havia estabelecimento na linha, só lugar: vale procurar na linha vizinha. */
  fromLocation?: boolean;
  /** O lugar é fora do Brasil (compra internacional). */
  foreign?: boolean;
}

/** Texto antes da data com cara de estabelecimento (não rótulo, não titular do cartão). */
export function isMerchantLikeLead(text: string): boolean {
  const t = text.trim();
  return (
    t.length >= 2 && !MASK.test(t) && !LABEL_LIKE.test(normalizeText(t)) && !OWNER_LINE.test(t)
  );
}

/**
 * Evidência de layout "estabelecimento à esquerda da data": a linha tem texto
 * antes da data e, depois dela, só lugar (ou nada).
 */
export function hasLeadLayout(parts: Part[], stats?: DocStats): boolean {
  const leads = parts.filter((p) => p.lead);
  if (!leads.some((l) => isMerchantLikeLead(l.text))) return false;
  return parts
    .filter((p) => !p.lead && !MASK.test(p.text.trim()))
    .every(
      (p) =>
        isLocationText(p.text, { strong: true }) ||
        (stats?.locationXs.some((x) => Math.abs(x - p.x) <= 12) ?? false),
    );
}

/**
 * Escolhe o texto do estabelecimento entre as partes da linha e separa o
 * lugar. Nunca devolve vazio se havia algum texto.
 */
export function chooseMerchant(
  parts: Part[],
  ctx: { header?: HeaderModel | null; stats?: DocStats } = {},
): MerchantChoice {
  const { header, stats } = ctx;
  const located: string[] = [];
  const after: Part[] = [];
  const leads: Part[] = [];

  for (const p of parts) {
    const text = p.text.trim();
    if (!text || MASK.test(text)) continue;
    const role = header ? roleAt(header, p.x) : undefined;
    const inLocationColumn = stats?.locationXs.some((x) => Math.abs(x - p.x) <= 12) ?? false;
    const repeated = stats?.repeatedTails.has(normalizeText(text)) ?? false;
    const notMerchantColumn = role !== 'merchant';
    if (
      role === 'location' ||
      (notMerchantColumn && inLocationColumn) ||
      (notMerchantColumn && repeated && isLocationText(text, { strong: true }))
    ) {
      located.push(text);
      continue;
    }
    if (role === 'other') continue;
    if (p.lead) {
      // "PADARIA REAL  SAO PAULO  05/10  23,50": cidade também pode vir antes da data.
      if (role !== 'merchant' && leads.length > 0 && isLocationText(text)) {
        located.push(text);
        continue;
      }
      // Texto antes da data: estabelecimento se o cabeçalho disser; senão, decide abaixo.
      if (role === 'merchant' || isMerchantLikeLead(text)) {
        leads.push({ ...p, text });
      }
      continue;
    }
    if (notMerchantColumn && (after.length > 0 || leads.length > 0) && isLocationText(text)) {
      // Coluna com nome de cidade inequívoco ao lado do estabelecimento.
      located.push(text);
      continue;
    }
    after.push({ ...p, text });
  }

  const leadIsMerchantColumn = header
    ? leads.some((l) => roleAt(header, l.x) === 'merchant')
    : false;
  // Sem cabeçalho, o texto antes da data só vale se depois dela não houver estabelecimento.
  const useLead = leadIsMerchantColumn || after.length === 0;
  const chosen = [...(useLead ? leads : []), ...(leadIsMerchantColumn ? [] : after)].sort(
    (a, b) => a.x - b.x,
  );
  let merchant = chosen.map((p) => p.text).join(' ');
  if (!merchant) merchant = (after.length ? after : leads).map((p) => p.text).join(' ');
  if (!merchant) return { merchant: located.join(' '), fromLocation: true };

  // Lugar no fim do próprio nome ("PADARIA REAL SAO PAULO", "… CAMPINAS SP").
  const norm = normalizeText(merchant);
  const strong = [...(stats?.repeatedTails ?? [])].some((t) => norm.endsWith(` ${t}`));
  // Grudado primeiro: "HELP.UBER.COSAO PAULO BR" só perderia o "BR" no corte pelo fim.
  const glued = splitGluedLocation(merchant);
  const tail = glued.location ? glued : splitTrailingLocation(merchant, { strong });
  if (tail.location) {
    merchant = tail.rest;
    located.push(tail.location);
  }

  const place = located.length ? normalizeText(located.join(' ')) : '';
  if (!place) return { merchant };
  return {
    merchant,
    location: prettyLocation(place),
    ...(isForeignLocation(place) ? { foreign: true } : {}),
  };
}

interface Describable {
  rawDescription: string;
  description: string;
  location?: string;
  international: boolean;
}

/**
 * Descrições sem posição (OFX, CSV, dados já salvos): separa o lugar do fim
 * de cada uma, usando a repetição no documento como reforço.
 */
export function separateLocations<T extends Describable>(txs: T[]): T[] {
  const stats = buildDocStats(txs.map((t) => [{ text: t.rawDescription, x: 0 }]));
  return txs.map((t) => {
    if (t.location) return t;
    const choice = chooseMerchant([{ text: t.rawDescription, x: 0 }], { stats });
    if (!choice.location || choice.fromLocation || choice.merchant === t.rawDescription) return t;
    return {
      ...t,
      rawDescription: choice.merchant,
      description: prettifyDescription(choice.merchant),
      location: choice.location,
      ...(choice.foreign ? { international: true } : {}),
    };
  });
}
