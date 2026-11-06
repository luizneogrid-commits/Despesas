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

function rowToText(items: PositionedText[]): string {
  let text = '';
  let prevEnd: number | null = null;
  for (const it of items) {
    const h = it.height > 0 ? it.height : 10;
    if (prevEnd !== null) {
      const gap = it.x - prevEnd;
      if (gap > h * 2.5) text += '   ';
      else if (gap > h * 0.12 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
    }
    text += it.str;
    prevEnd = it.x + it.width;
  }
  return text.replace(/[ \t\u00a0]+/g, ' ').trim();
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

/** Linhas de UMA página, já em ordem de leitura (coluna a coluna). */
export function pageItemsToLines(items: PositionedText[]): string[] {
  // Ignora texto girado (ex.: códigos verticais na margem).
  const rows = groupRows(items);
  const boundary = detectColumnBoundary(rows);
  if (boundary === null) {
    return rows.map((r) => rowToText(r.items)).filter((l) => l.length > 0);
  }
  const left = groupRows(items.filter((i) => i.x < boundary));
  const right = groupRows(items.filter((i) => i.x >= boundary));
  return [
    ...left.map((r) => rowToText(r.items)).filter(Boolean),
    BREAK_LINE,
    ...right.map((r) => rowToText(r.items)).filter(Boolean),
  ];
}

/** Compatível com o uso simples (uma página, sem detecção de colunas). */
export function itemsToLines(items: PositionedText[]): string[] {
  return groupRows(items)
    .map((r) => rowToText(r.items))
    .filter((l) => l.length > 0);
}
