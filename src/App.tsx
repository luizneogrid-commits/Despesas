import {
  ArrowLeftRight,
  CalendarClock,
  Database,
  Download,
  LayoutDashboard,
  List,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useInstall } from './pwa/install';
import { listenLaunchQueue, takeSharedFiles } from './pwa/shared';
import { pendingMerchants } from './services/mappings';
import { useAppStore } from './store/appStore';
import { Toasts } from './ui/components/Toasts';
import { DashboardPage } from './ui/pages/DashboardPage';
import { DataPage } from './ui/pages/DataPage';
import { ImportPage } from './ui/pages/ImportPage';
import { DeParaPage } from './ui/pages/DeParaPage';
import { ParcelasPage } from './ui/pages/ParcelasPage';
import { TransactionsPage } from './ui/pages/TransactionsPage';
import { addFiles } from './ui/importQueue';
import { navigate, useRoute, type Route } from './ui/route';
import { useUiStore } from './ui/uiStore';

const NAV: Array<{ route: Route; label: string; icon: typeof LayoutDashboard }> = [
  { route: 'visao-geral', label: 'Visão geral', icon: LayoutDashboard },
  { route: 'lancamentos', label: 'Lançamentos', icon: List },
  { route: 'parcelas', label: 'Parcelas', icon: CalendarClock },
  { route: 'de-para', label: 'De/para', icon: ArrowLeftRight },
  { route: 'importar', label: 'Importar', icon: Upload },
  { route: 'dados', label: 'Dados', icon: Database },
];

function DemoBanner() {
  const hasDemo = useAppStore((s) => s.statements.some((st) => st.isDemo));
  const hasReal = useAppStore((s) => s.statements.some((st) => !st.isDemo));
  const clearAll = useAppStore((s) => s.clearAll);
  const removeStatement = useAppStore((s) => s.removeStatement);
  if (!hasDemo) return null;
  const clearDemo = () => {
    const s = useAppStore.getState();
    if (!hasReal) clearAll();
    else s.statements.filter((st) => st.isDemo).forEach((st) => removeStatement(st.id));
  };
  return (
    <div className="banner" role="note">
      <p>
        <strong>Você está vendo dados de exemplo (fictícios).</strong>{' '}
        <span className="banner__more">
          Importe o PDF da sua fatura para ver o seu perfil; o exemplo sai automaticamente.
        </span>
      </p>
      <a className="btn btn--primary btn--sm" href="#importar">
        <Upload size={14} aria-hidden="true" /> Importar minha fatura
      </a>
      <button type="button" className="btn btn--ghost btn--sm" onClick={clearDemo}>
        Limpar exemplo
      </button>
    </div>
  );
}

function StorageBanner() {
  const storage = useAppStore((s) => s.storage);
  if (storage !== 'memoria') return null;
  return (
    <div className="banner banner--warn" role="note">
      <p>
        <strong>Modo temporário:</strong> este navegador não permitiu salvar dados. Tudo some ao
        fechar a página. Use Dados → Backup para guardar.
      </p>
    </div>
  );
}

/** Barra inferior no celular: as cinco telas de uso diário; "Dados" fica no topo. */
const TABS: Array<{ route: Route; label: string; icon: typeof LayoutDashboard }> = [
  { route: 'visao-geral', label: 'Início', icon: LayoutDashboard },
  { route: 'lancamentos', label: 'Lançamentos', icon: List },
  { route: 'importar', label: 'Importar', icon: Upload },
  { route: 'parcelas', label: 'Parcelas', icon: CalendarClock },
  { route: 'de-para', label: 'De/para', icon: ArrowLeftRight },
];

function receiveFiles(files: File[], origin: string) {
  if (files.length === 0) return;
  addFiles(files);
  navigate('importar');
  useUiStore.getState().toast(
    {
      message: `${files.length === 1 ? 'PDF recebido' : `${files.length} PDFs recebidos`} ${origin}. Confira e confirme a importação.`,
    },
    5000,
  );
}

function usePendingCount(): number {
  const transactions = useAppStore((s) => s.transactions);
  return useMemo(() => pendingMerchants(transactions).length, [transactions]);
}

export function App() {
  const route = useRoute();
  const pendingCount = usePendingCount();
  const hydrated = useAppStore((s) => s.hydrated);
  const hydrate = useAppStore((s) => s.hydrate);

  const canInstall = useInstall((s) => s.canPrompt);
  const promptInstall = useInstall((s) => s.promptInstall);

  useEffect(() => {
    void hydrate().then(async () => {
      receiveFiles(await takeSharedFiles(), 'pelo Compartilhar');
      listenLaunchQueue((files) => receiveFiles(files, 'para abrir'));
    });
  }, [hydrate]);

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <a className="brand" href="#visao-geral" aria-label="Raio-X da Fatura, visão geral">
            <span className="brand__mark" aria-hidden="true" />
            <span className="brand__name">Raio-X da Fatura</span>
            <span className="brand__tag">perfil de gastos do cartão</span>
          </a>
          <nav className="nav" aria-label="Seções">
            {NAV.map(({ route: r, label, icon: Icon }) => (
              <a key={r} href={`#${r}`} aria-current={route === r ? 'page' : undefined}>
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
                {r === 'de-para' && pendingCount > 0 && (
                  <span className="count-badge" aria-label={`${pendingCount} não reconhecidos`}>
                    {pendingCount}
                  </span>
                )}
              </a>
            ))}
          </nav>
          <div className="topbar__actions">
            {canInstall && (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => void promptInstall()}
              >
                <Download size={14} aria-hidden="true" /> Instalar app
              </button>
            )}
            <a
              className="icon-btn topbar__data"
              href="#dados"
              aria-label="Seus dados, backup e instalação"
              aria-current={route === 'dados' ? 'page' : undefined}
            >
              <Database size={18} aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>
      <main className="page" id="conteudo">
        {!hydrated ? (
          <p className="muted">Carregando seus dados…</p>
        ) : (
          <>
            <StorageBanner />
            {route !== 'importar' && <DemoBanner />}
            {route === 'visao-geral' && <DashboardPage />}
            {route === 'lancamentos' && <TransactionsPage />}
            {route === 'importar' && <ImportPage />}
            {route === 'parcelas' && <ParcelasPage />}
            {route === 'de-para' && <DeParaPage />}
            {route === 'dados' && <DataPage />}
          </>
        )}
      </main>
      <footer className="footer">
        <ShieldCheck size={14} aria-hidden="true" />
        <span>Processado no seu navegador. Nenhum dado da fatura sai deste dispositivo.</span>
      </footer>
      <nav className="tabbar" aria-label="Seções">
        {TABS.map(({ route: r, label, icon: Icon }) => (
          <a key={r} href={`#${r}`} aria-current={route === r ? 'page' : undefined}>
            <span className="tabbar__icon">
              <Icon size={20} aria-hidden="true" />
            </span>
            <span>{label}</span>
            {r === 'de-para' && pendingCount > 0 && (
              <span className="count-badge" aria-label={`${pendingCount} não reconhecidos`}>
                {pendingCount}
              </span>
            )}
          </a>
        ))}
      </nav>
      <Toasts />
    </>
  );
}
