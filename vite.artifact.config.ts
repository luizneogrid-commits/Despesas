/**
 * Build "página única" para hospedagem com CSP restrita (ex.: Artifact do
 * Claude): JS e CSS vão embutidos no HTML, fontes viram data: URIs e não há
 * divisão de código. Só o worker do pdf.js e o PDF de exemplo ficam como
 * arquivos ao lado da página.
 */
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.ts';

export default mergeConfig(
  base,
  defineConfig({
    build: {
      outDir: 'artifact-build',
      emptyOutDir: true,
      sourcemap: false,
      assetsInlineLimit: 50_000_000,
      cssCodeSplit: false,
      modulePreload: false,
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: { codeSplitting: false },
      },
    },
  }),
);
