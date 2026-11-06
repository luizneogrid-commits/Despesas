import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { listenInstallPrompt } from './pwa/install';
import { registerServiceWorker } from './pwa/register';
import { useUiStore } from './ui/uiStore';
import './styles/fonts.css';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');

listenInstallPrompt();
registerServiceWorker((apply) =>
  useUiStore
    .getState()
    .toast(
      { message: 'Nova versão do app disponível.', action: { label: 'Atualizar', run: apply } },
      60_000,
    ),
);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
