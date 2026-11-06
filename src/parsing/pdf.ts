/**
 * Leitura de PDF no navegador com pdf.js. Nada sai da máquina do usuário:
 * o arquivo é lido em memória e só o texto é extraído (não renderizamos
 * páginas nem executamos scripts do PDF).
 */
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import { PdfInvalidError, PdfNoTextError, PdfPasswordError } from './errors';
import { extractLinesFromDocument } from './extract';
import type { Line } from './lines';

let workerConfigured = false;

function configureWorker() {
  if (workerConfigured) return;
  // O worker é copiado para /public no build (scripts/copy-pdf-worker.mjs) e
  // servido como arquivo de mesma origem, compatível com CSP restritiva.
  GlobalWorkerOptions.workerSrc = new URL(
    `${import.meta.env.BASE_URL}pdf.worker.min.mjs`,
    document.baseURI,
  ).href;
  workerConfigured = true;
}

export interface PdfTextResult {
  lines: Line[];
  pageCount: number;
}

export async function readPdfLines(data: ArrayBuffer, password?: string): Promise<PdfTextResult> {
  configureWorker();
  const task = getDocument({
    data: new Uint8Array(data),
    ...(password ? { password } : {}),
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e?.name === 'PasswordException') throw new PdfPasswordError(e.code === 2);
    throw new PdfInvalidError();
  }
  try {
    const lines = await extractLinesFromDocument(doc);
    const textChars = lines
      .map((l) => (typeof l === 'string' ? l : l.text))
      .join('')
      .replace(/\s/g, '').length;
    if (textChars < 40) throw new PdfNoTextError();
    return { lines, pageCount: doc.numPages };
  } finally {
    void task.destroy();
  }
}
