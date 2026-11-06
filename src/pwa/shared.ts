/**
 * Arquivos que chegam "de fora": PDF compartilhado pelo menu Compartilhar do
 * celular (Web Share Target, tratado no service worker) ou aberto com o app
 * instalado no computador (File Handling / launchQueue).
 */
const SHARE_CACHE = 'raio-x-compartilhado';

export async function takeSharedFiles(): Promise<File[]> {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('compartilhado')) return [];
  // Limpa o endereço para um recarregamento não reimportar.
  window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  if (!('caches' in window)) return [];
  const cache = await caches.open(SHARE_CACHE);
  const files: File[] = [];
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      const name = decodeURIComponent(response.headers.get('x-file-name') ?? 'fatura.pdf');
      files.push(new File([blob], name, { type: blob.type || 'application/pdf' }));
    }
    await cache.delete(request);
  }
  return files;
}

interface LaunchParams {
  files?: Array<{ getFile(): Promise<File> }>;
}

export function listenLaunchQueue(onFiles: (files: File[]) => void): void {
  const lq = (
    window as unknown as { launchQueue?: { setConsumer(cb: (p: LaunchParams) => void): void } }
  ).launchQueue;
  if (!lq) return;
  lq.setConsumer((params) => {
    void Promise.all((params.files ?? []).map((h) => h.getFile())).then((files) => {
      if (files.length) onFiles(files);
    });
  });
}
