/* Service worker do Raio-X da Fatura (gerado por scripts/build-sw.mjs).
 * - Precache do app inteiro: funciona offline, inclusive a leitura de PDFs.
 * - Atualização controlada: a nova versão espera o usuário tocar em "Atualizar".
 * - Alvo de compartilhamento: recebe o PDF enviado por "Compartilhar" no celular.
 * Nenhum dado de fatura passa por servidor: o PDF compartilhado fica num cache
 * local só até o app abrir e importá-lo.
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `raio-x-app-${VERSION}`;
const SHARE_CACHE = 'raio-x-compartilhado';
const scope = new URL(self.registration.scope);
const INDEX = new URL('./index.html', scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((p) => new URL(p, scope).href))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('raio-x-app-') && k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function receiveShare(request) {
  const form = await request.formData();
  const files = form
    .getAll('fatura')
    .filter((f) => f && typeof f === 'object' && 'arrayBuffer' in f);
  const cache = await caches.open(SHARE_CACHE);
  let i = 0;
  for (const file of files) {
    const key = new URL(`./__compartilhado/${Date.now()}-${i++}`, scope).href;
    await cache.put(
      key,
      new Response(file, {
        headers: {
          'content-type': file.type || 'application/pdf',
          'x-file-name': encodeURIComponent(file.name || 'fatura.pdf'),
        },
      }),
    );
  }
  return Response.redirect(new URL('./?compartilhado=1#importar', scope).href, 303);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== scope.origin) return;

  if (request.method === 'POST' && url.pathname.endsWith('/compartilhar')) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    // App de página única: qualquer navegação abre o index do cache (offline).
    event.respondWith(
      (async () => {
        const cached = await caches.match(INDEX, { ignoreSearch: true, ignoreVary: true });
        if (cached) return cached;
        return fetch(request);
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { ignoreSearch: true, ignoreVary: true });
      if (cached) return cached;
      return fetch(request);
    })(),
  );
});
