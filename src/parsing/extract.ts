/**
 * Extração de linhas de um documento pdf.js já aberto. Separado de pdf.ts
 * (que configura o worker do navegador) para poder ser testado no Node com
 * o build "legacy" do pdf.js.
 */
import { BREAK_LINE, pageItemsToLines, type PositionedText } from './lines';

/** Subconjunto estrutural do PDFDocumentProxy (vale para o build normal e o legacy). */
export interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: unknown[] }>;
    cleanup(): unknown;
  }>;
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextItem(item: unknown): item is TextItem {
  return typeof item === 'object' && item !== null && 'str' in item && 'transform' in item;
}

/** Extrai linhas de texto em ordem de leitura de um documento já aberto. */
export async function extractLinesFromDocument(doc: PdfDocLike): Promise<string[]> {
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: PositionedText[] = [];
    for (const raw of content.items) {
      if (!isTextItem(raw)) continue;
      const [a = 1, b = 0, , d = 1, x = 0, y = 0] = raw.transform;
      if (Math.abs(b) > Math.abs(a) * 0.2) continue; // texto girado (margens)
      items.push({
        str: raw.str,
        x,
        y,
        width: raw.width,
        height: Math.abs(d) || raw.height || 10,
      });
    }
    if (p > 1) lines.push(BREAK_LINE);
    lines.push(...pageItemsToLines(items));
    page.cleanup();
  }
  return lines;
}
