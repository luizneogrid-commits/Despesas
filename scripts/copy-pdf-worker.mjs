// Copia o worker do pdf.js para /public, para que seja servido como arquivo
// estático de mesma origem (necessário para Web Workers e para a CSP).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const dest = resolve(root, 'public', 'pdf.worker.min.mjs');

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-pdf-worker] ${src} -> public/pdf.worker.min.mjs`);
