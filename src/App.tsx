import {
  ArrowLeftRight,
  CalendarClock,
  ChevronRight,
  Database,
  Download,
  Ellipsis,
  FolderSync,
  LayoutDashboard,
  List,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { restoreFolder, useFolder } from './pwa/folderWatch';
import { useInstall } from './pwa/install';
import { listenLaunchQueue, takeSharedFiles } from './pwa/shared';
import { useAppStore } from './store/appStore';
import { useAttention } from './ui/attention';
import { Toasts } from './ui/components/Toasts';
import { addFiles } from './ui/importQueue';
import { DashboardPage } from './ui/pages/DashboardPage';
import { DataPage } from './ui/pages/DataPage';
import { DeParaPage } from './ui/pages/DeParaPage';
import { ImportPage } from './ui/pages/ImportPage';
import { ParcelasPage } from './ui/pages/ParcelasPage';
import { TransactionsPage } from './ui/pages/TransactionsPage';
import { navigate, ROUTE_LABELS, useRoute, type Route } from './ui/route';
import { useUiStore } from './ui/uiStore';

type Icon = typeof LayoutDashboard;

const NAV: Array<{ route: Route; icon: Icon }> = [
  { route: 'visao-geral', icon: LayoutDashboard },
  { route: 'lancamentos', icon: List },
  { route: 'parcelas', icon: CalendarClock },
  { route: 'de-para', icon: ArrowLeftRight },
  { route: 'importar', icon: Upload },
  { route: 'dados', icon: Database },
];

/** Celular: as quatro telas de uso diário + "Mais" (no máximo cinco abas). */
const TABS: Array<{ route: Route; icon: Icon }> = [
  { route: 'visao-geral', icon: LayoutDashboard },
  { route: 'lancamentos', icon: List },
  { route: 'importar', icon: Upload },
  { route: 'parcelas', icon: CalendarClock },
];
const MORE_ROUTES: Route[] = ['de-para', 'dados'];

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
          Importe sua fatura ou seu extrato para ver o seu perfil; o exemplo sai automaticamente.
        </span>
      </p>
      <a className="btn btn--primary btn--sm" href="#importar">
        <Upload size={14} aria-hidden="true" /> Importar meus arquivos
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

function receiveFiles(files: File[], origin: string) {
  if (files.length === 0) return;
  addFiles(files, { origin: 'compartilhado' });
  navigate('importar');
  useUiStore.getState().toast(
    {
      message: `${files.length === 1 ? 'Arquivo recebido' : `${files.length} arquivos recebidos`} ${origin}. Confira e confirme a importação.`,
    },
    5000,
  );
}

/** Folha "Mais" no celular: o que não coube na barra, com descrição de cada item. */
function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const attention = useAttention();
  const canInstall = useInstall((s) => s.canPrompt);
  const promptInstall = useInstall((s) => s.promptInstall);
  const folder = useFolder((s) => s.status);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);

  const go = (r: Route) => {
    onClose();
    navigate(r);
  };

  const items: Array<{ route: Route; icon: Icon; title: string; detail: string; badge?: number }> =
    [
      {
        route: 'de-para',
        icon: ArrowLeftRight,
        title: 'De/para e categorias',
        detail: 'Ensine o app a reconhecer estabelecimentos e destinatários de Pix',
        badge: attention.pending,
      },
      {
        route: 'importar',
        icon: FolderSync,
        title: 'Pasta monitorada',
        detail:
          folder === 'monitorando'
            ? 'Ativa: arquivos novos entram sozinhos'
            : folder === 'precisa-permissao'
              ? 'Pausada: toque para retomar'
              : 'Importe automaticamente o que for salvo numa pasta',
      },
      {
        route: 'dados',
        icon: Database,
        title: 'Dados e backup',
        detail: 'Exportar planilha, backup, instalar e apagar',
      },
    ];

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="mais-titulo"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet__body">
        <div className="sheet__head">
          <h2 id="mais-titulo">Mais</h2>
          <button type="button" className="icon-btn" aria-label="Fechar" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <ul className="plain sheet__list">
          {items.map((it) => (
            <li key={it.title}>
              <button type="button" className="sheet__item" onClick={() => go(it.route)}>
                <span className="cat-icon" aria-hidden="true">
                  <it.icon size={18} />
                </span>
                <span className="sheet__text">
                  <strong>{it.title}</strong>
                  <small>{it.detail}</small>
                </span>
                {it.badge ? <span className="count-badge">{it.badge}</span> : null}
                <ChevronRight size={18} aria-hidden="true" className="muted" />
              </button>
            </li>
          ))}
          {canInstall && (
            <li>
              <button
                type="button"
                className="sheet__item"
                onClick={() => {
                  onClose();
                  void promptInstall();
                }}
              >
                <span className="cat-icon" aria-hidden="true">
                  <Download size={18} />
                </span>
                <span className="sheet__text">
                  <strong>Instalar o app</strong>
                  <small>Abrir pela tela inicial, em tela cheia e sem internet</small>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="muted" />
              </button>
            </li>
          )}
        </ul>
      </div>
    </dialog>
  );
}

export function App() {
  const route = useRoute();
  const attention = useAttention();
  const hydrated = useAppStore((s) => s.hydrated);
  const hydrate = useAppStore((s) => s.hydrate);
  const canInstall = useInstall((s) => s.canPrompt);
  const promptInstall = useInstall((s) => s.promptInstall);
  const folderOn = useFolder((s) => s.status === 'monitorando');
  const folderName = useFolder((s) => s.folderName);
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const firstRoute = useRef(true);

  useEffect(() => {
    void hydrate().then(async () => {
      void restoreFolder();
      receiveFiles(await takeSharedFiles(), 'pelo Compartilhar');
      listenLaunchQueue((files) => receiveFiles(files, 'para abrir'));
    });
  }, [hydrate]);

  // Título da aba por tela e foco no conteúdo ao navegar (leitores de tela anunciam a troca).
  useEffect(() => {
    if (route !== 'lancamentos') useUiStore.getState().setOrigin(null);
    document.title =
      route === 'visao-geral' ? 'Raio-X da Fatura' : `${ROUTE_LABELS[route]} · Raio-X da Fatura`;
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [route]);

  const badgeFor = (r: Route) =>
    r === 'de-para' ? attention.pending : r === 'importar' ? attention.reviews : 0;
  const moreBadge = attention.pending + (attention.items.some((i) => i.id === 'pasta') ? 1 : 0);

  return (
    <>
      <a
        className="skip-link"
        href="#conteudo"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <div className="topbar__inner">
          <a className="brand" href="#visao-geral" aria-label="Raio-X da Fatura, início">
            <span className="brand__mark" aria-hidden="true" />
            <span className="brand__name">Raio-X da Fatura</span>
            <span className="brand__tag">perfil de gastos</span>
          </a>
          <nav className="nav" aria-label="Seções">
            {NAV.map(({ route: r, icon: Icon }) => {
              const badge = badgeFor(r);
              return (
                <a key={r} href={`#${r}`} aria-current={route === r ? 'page' : undefined}>
                  <Icon size={16} aria-hidden="true" />
                  <span>{ROUTE_LABELS[r]}</span>
                  {badge > 0 && (
                    <span className="count-badge" aria-label={`${badge} pendentes`}>
                      {badge}
                    </span>
                  )}
                </a>
              );
            })}
          </nav>
          <div className="topbar__actions">
            {folderOn && (
              <a
                className="live-pill topbar__folder"
                href="#importar"
                title={`Monitorando a pasta "${folderName}"`}
              >
                <span className="live-dot" aria-hidden="true" /> Pasta ativa
              </a>
            )}
            {canInstall && (
              <button
                type="button"
                className="btn btn--primary btn--sm topbar__install"
                onClick={() => void promptInstall()}
              >
                <Download size={14} aria-hidden="true" /> Instalar app
              </button>
            )}
          </div>
        </div>
      </header>
      <main
        className="page"
        id="conteudo"
        ref={mainRef}
        tabIndex={-1}
        aria-label={ROUTE_LABELS[route]}
      >
        {!hydrated ? (
          <p className="muted">Carregando seus dados…</p>
        ) : (
          <>
            <StorageBanner />
            {route === 'visao-geral' && <DemoBanner />}
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
        <span>Processado no seu navegador. Nenhum dado sai deste dispositivo.</span>
      </footer>
      <nav className="tabbar" aria-label="Seções">
        {TABS.map(({ route: r, icon: Icon }) => {
          const badge = badgeFor(r);
          return (
            <a key={r} href={`#${r}`} aria-current={route === r ? 'page' : undefined}>
              <span className="tabbar__icon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span>{ROUTE_LABELS[r]}</span>
              {badge > 0 && (
                <span className="count-badge" aria-label={`${badge} para revisar`}>
                  {badge}
                </span>
              )}
            </a>
          );
        })}
        <button
          type="button"
          className="tabbar__more"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={MORE_ROUTES.includes(route) ? 'page' : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <span className="tabbar__icon">
            <Ellipsis size={20} aria-hidden="true" />
          </span>
          <span>Mais</span>
          {moreBadge > 0 && (
            <span className="count-badge" aria-label={`${moreBadge} pendentes`}>
              {moreBadge}
            </span>
          )}
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <Toasts />
    </>
  );
}
