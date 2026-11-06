// Pós-build: gera dist/sw.js com a lista de arquivos a guardar em cache
// (precache) e uma versão derivada do conteúdo, para invalidar o cache antigo.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export function precacheList(files) {
  return files
    .filter((f) => !f.endsWith('.map') && !f.endsWith('sw.js') && !f.endsWith('.DS_Store'))
    .map((f) => f.split('\\').join('/'))
    .sort();
}

const files = precacheList(walk(dist).map((f) => relative(dist, f)));
const template = readFileSync(resolve(root, 'scripts', 'sw.template.js'), 'utf8');
const hash = createHash('sha256').update(template);
for (const f of files) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 12);

const urls = ['./', ...files.map((f) => `./${f}`)];
const sw = template
  .replace('__VERSION__', version)
  .replace('__PRECACHE__', JSON.stringify(urls, null, 2));
writeFileSync(join(dist, 'sw.js'), sw);
const kb = files.reduce((a, f) => a + statSync(join(dist, f)).size, 0) / 1024;
console.log(`[sw] versão ${version}: ${urls.length} arquivos em cache (${kb.toFixed(0)} kB)`);
