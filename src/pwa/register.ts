/**
 * Registro do service worker (só no build de produção e fora de iframes).
 * Uma versão nova fica em espera até o usuário aceitar "Atualizar", para não
 * recarregar a tela no meio de uma revisão de importação.
 */
export function registerServiceWorker(onUpdateReady: (apply: () => void) => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (window.top !== window) return; // ex.: dentro do Artifact do Claude
  // Só a versão instalável (com manifesto) tem service worker; a página única do Artifact não.
  if (!document.querySelector('link[rel="manifest"]')) return;

  let accepted = false;
  const start = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const offer = () => {
        const waiting = reg.waiting;
        if (!waiting || !navigator.serviceWorker.controller) return;
        onUpdateReady(() => {
          accepted = true;
          waiting.postMessage({ type: 'SKIP_WAITING' });
        });
      };
      offer();
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed') offer();
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (accepted) window.location.reload();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
      });
    } catch {
      // Sem service worker o app continua funcionando, só não fica offline.
    }
  };
  if (document.readyState === 'complete') void start();
  else window.addEventListener('load', () => void start(), { once: true });
}
