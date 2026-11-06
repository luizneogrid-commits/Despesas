import { create } from 'zustand';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  canPrompt: boolean;
  installed: boolean;
  promptInstall: () => Promise<boolean>;
}

let deferred: BeforeInstallPromptEvent | null = null;

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** Estado do convite de instalação (Android/Chrome/Edge). No iOS a instalação é manual. */
export const useInstall = create<InstallState>()((set) => ({
  canPrompt: false,
  installed: typeof window !== 'undefined' && isStandalone(),
  promptInstall: async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    set({ canPrompt: false, installed: outcome === 'accepted' });
    return outcome === 'accepted';
  },
}));

export function listenInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    useInstall.setState({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    useInstall.setState({ canPrompt: false, installed: true });
  });
}
