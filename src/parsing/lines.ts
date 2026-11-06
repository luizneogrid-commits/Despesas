/**
 * Reconstrução de linhas a partir dos fragmentos de texto posicionados que o
 * pdf.js devolve. PDFs não têm "linhas": cada pedaço de texto tem uma posição
 * (x, y). Agrupamos por y (com tolerância proporcional à fonte), ordenamos por
 * x e inserimos espaços conforme a distância horizontal.
 *
 * Várias faturas (ex.: Itaú) usam duas colunas de lançamentos lado a lado.
 * Detectamos a divisa procurando linhas em que um valor ("45,90") é seguido,
 * após um vão, por uma data ("12/10") — e lemos a coluna da esquerda inteira
 * antes da direita, como uma pessoa leria.
 */

export interface PositionedText {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Marca a troca de página ou de coluna no fluxo de linhas. */
export const BREAK_LINE = '\f';

interface Row {
  y: number;
  height: number;
  items: PositionedText[];
}

const AMOUNT_END = /\d,\d{2}\s?-?\s*$/;
const DATE_START =
  /^\s*(\d{1,2}[/.-]\d{1,2}\b|\d{1,2}\s?(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b)/i;

function groupRows(items: PositionedText[]): Row[] {
  const visible = items.filter((i) => i.str.trim().length > 0);
  visible.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const item of visible) {
    const h = item.height > 0 ? item.height : 10;
    const row = rows.find(
      (r) => Math.abs(r.y - item.y) <= Math.max(2, Math.min(h, r.height) * 0.45),
    );
    if (row) row.items.push(item);
    else rows.push({ y: item.y, height: h, items: [item] });
  }
  rows.sort((a, b) => b.y - a.y);
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  return rows;
}

/**
 * Trecho contínuo de texto numa linha (uma "célula"). Um vão maior que ~1
 * caractere largo separa colunas: "PADARIA REAL" | "SAO PAULO" | "23,50".
 */
export interface Segment {
  text: string;
  /** Posição horizontal do início e do fim (pontos do PDF; em texto puro, caracteres). */
  x: number;
  x2: number;
  /** Início/fim no texto da linha. */
  start: number;
  end: number;
}

export interface PdfLine {
  text: string;
  segments: Segment[];
}

/** Linha vinda do PDF (com posições) ou texto puro (testes, colagens). */
export type Line = string | PdfLine;

function rowToLine(items: PositionedText[]): PdfLine {
  const cells: Array<{ x: number; x2: number; text: string }> = [];
  let prevEnd: number | null = null;
  for (const it of items) {
    const h = it.height > 0 ? it.height : 10;
    const gap = prevEnd === null ? Infinity : it.x - prevEnd;
    const cell = cells.at(-1);
    if (!cell || gap > h * 0.9) {
      cells.push({ x: it.x, x2: it.x + it.width, text: it.str });
    } else {
      cell.x2 = it.x + it.width;
      const space =
        gap > h * 0.12 && !cell.text.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '';
      cell.text += space + it.str;
    }
    prevEnd = it.x + it.width;
  }
  let text = '';
  const segments: Segment[] = [];
  for (const c of cells) {
    const clean = c.text.replace(/[ \t\u00a0]+/g, ' ').trim();
    if (!clean) continue;
    if (text) text += ' ';
    segments.push({
      text: clean,
      x: c.x,
      x2: c.x2,
      start: text.length,
      end: text.length + clean.length,
    });
    text += clean;
  }
  return { text, segments };
}

/** Texto puro: colunas separadas por 2+ espaços; a posição é o índice do caractere. */
export function toPdfLine(line: Line): PdfLine {
  if (typeof line !== 'string') return line;
  const segments: Segment[] = [];
  for (const m of line.matchAll(/\S+(?: \S+)*/g)) {
    const start = m.index ?? 0;
    segments.push({
      text: m[0],
      x: start,
      x2: start + m[0].length,
      start,
      end: start + m[0].length,
    });
  }
  return { text: line, segments };
}

export function lineText(line: Line): string {
  return typeof line === 'string' ? line : line.text;
}

/** Retorna o x da divisa entre colunas, ou null para layout de coluna única. */
export function detectColumnBoundary(rows: Row[]): number | null {
  const cuts: number[] = [];
  for (const row of rows) {
    for (let i = 1; i < row.items.length; i++) {
      const prev = row.items[i - 1];
      const cur = row.items[i];
      if (!prev || !cur) continue;
      const gap = cur.x - (prev.x + prev.width);
      if (AMOUNT_END.test(prev.str) && DATE_START.test(cur.str) && gap > prev.height * 1.5) {
        cuts.push(cur.x);
      }
    }
  }
  if (cuts.length < 2) return null;
  cuts.sort((a, b) => a - b);
  const median = cuts[Math.floor(cuts.length / 2)] ?? 0;
  const near = cuts.filter((c) => Math.abs(c - median) <= 25).length;
  if (near < Math.max(2, cuts.length * 0.6)) return null;
  return Math.min(...cuts.filter((c) => Math.abs(c - median) <= 25)) - 3;
}

/** Linhas de UMA página, já em ordem de leitura (coluna a coluna), com posições. */
export function pageItemsToLines(items: PositionedText[]): Line[] {
  const rows = groupRows(items);
  const boundary = detectColumnBoundary(rows);
  const toLines = (rs: Row[]) => rs.map((r) => rowToLine(r.items)).filter((l) => l.text.length > 0);
  if (boundary === null) return toLines(rows);
  const left = groupRows(items.filter((i) => i.x < boundary));
  const right = groupRows(items.filter((i) => i.x >= boundary));
  return [...toLines(left), BREAK_LINE, ...toLines(right)];
}

/** Compatível com o uso simples (uma página, sem detecção de colunas). */
export function itemsToLines(items: PositionedText[]): string[] {
  return groupRows(items)
    .map((r) => rowToLine(r.items).text)
    .filter((l) => l.length > 0);
}
