// Gera os PNGs do app (PWA, iOS, favicon) a partir dos SVGs em public/icons.
// Uso único, quando o ícone mudar: requer o Playwright (npx playwright install chromium).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const jobs = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
  ['icon-maskable.svg', 'apple-touch-icon.png', 180],
  ['icon.svg', 'favicon-32.png', 32],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  const svg = readFileSync(resolve(dir, src), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({
    path: resolve(dir, out),
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  console.log(`[icons] ${out} (${size}px)`);
}
await browser.close();
