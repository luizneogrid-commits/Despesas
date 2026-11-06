// Gera artifact/index.html (conteúdo de página com tudo embutido) + arquivos de apoio.
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { escapeControlChars } from './escape-control-chars.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = resolve(root, 'artifact-build');
const out = resolve(root, 'artifact');

await import('./copy-pdf-worker.mjs');
await build({ configFile: resolve(root, 'vite.artifact.config.ts'), root, logLevel: 'warn' });

const html = readFileSync(resolve(tmp, 'index.html'), 'utf8');
const cssHref = /<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/.exec(html)?.[1];
const jsSrc = /<script type="module"[^>]*src="\.\/([^"]+)"/.exec(html)?.[1];
if (!cssHref || !jsSrc) throw new Error('Não encontrei CSS/JS no index.html do build');

const jsFiles = readdirSync(resolve(tmp, 'assets')).filter((f) => f.endsWith('.js'));
if (jsFiles.length !== 1)
  throw new Error(`Esperava 1 bundle JS, encontrei ${jsFiles.length}: ${jsFiles}`);

const css = readFileSync(resolve(tmp, cssHref), 'utf8');
// Evita que o parser HTML encerre o <script> antes da hora.
const js = escapeControlChars(readFileSync(resolve(tmp, jsSrc), 'utf8'))
  .replace(/<\/script/gi, '<\\/script')
  .replace(/<!--/g, '<\\!--');
const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? 'Raio-X da Fatura';

const page = [
  `<title>${title}</title>`,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<meta name="description" content="Importe o PDF da fatura do cartão e veja o perfil de gastos por categoria, 100% no navegador.">',
  `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`,
  '<div id="root"></div>',
  `<script type="module">${js}</script>`,
  '',
].join('\n');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'index.html'), page);
writeFileSync(
  resolve(out, 'pdf.worker.min.mjs'),
  escapeControlChars(readFileSync(resolve(root, 'public', 'pdf.worker.min.mjs'), 'utf8')),
);
copyFileSync(resolve(root, 'public', 'exemplo-fatura.pdf'), resolve(out, 'exemplo-fatura.pdf'));
rmSync(tmp, { recursive: true, force: true });

for (const f of readdirSync(out)) {
  console.log(`[artifact] ${f}: ${(statSync(resolve(out, f)).size / 1024).toFixed(0)} kB`);
}
