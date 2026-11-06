import {
  CircleAlert,
  CircleCheck,
  Copy,
  FileSearch,
  FolderOpen,
  FolderSync,
  KeyRound,
  RefreshCw,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  connectFolder,
  disconnectFolder,
  handleInitial,
  resumeFolder,
  scanNow,
  setMode,
  setNotify,
  setPassword,
  useFolder,
  type LogEntry,
} from '../../pwa/folderWatch';
import type { AutoMode } from '../importQueue';

const MODE_LABELS: Record<AutoMode, string> = {
  'quando-confere': 'Importar sozinho quando a leitura conferir (recomendado)',
  sempre: 'Importar sempre, mesmo sem conferir o total',
  revisar: 'Só deixar na fila para eu revisar',
};

const LOG_ICON: Record<LogEntry['type'], typeof CircleCheck> = {
  importado: CircleCheck,
  revisar: CircleAlert,
  duplicado: Copy,
  erro: X,
  encontrado: FileSearch,
};

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Painel da pasta monitorada na tela Importar. */
export function FolderPanel() {
  const f = useFolder();
  const [pwd, setPwd] = useState('');
  const [rememberPwd, setRememberPwd] = useState(false);

  if (!f.supported) {
    return (
      <section className="panel" aria-labelledby="pasta-titulo">
        <div className="panel__head">
          <h2 id="pasta-titulo">Pasta monitorada</h2>
        </div>
        <div className="notice">
          <FolderSync size={16} aria-hidden="true" />
          <span>
            Ler automaticamente os arquivos salvos numa pasta funciona no{' '}
            <strong>Chrome ou Edge do computador</strong>. Neste navegador, envie os arquivos pelo
            botão acima
            <span className="only-touch"> ou, no Android, pelo menu Compartilhar → Raio-X</span>.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="pasta-titulo">
      <div className="panel__head">
        <div>
          <h2 id="pasta-titulo">
            Pasta monitorada{' '}
            {f.status === 'monitorando' && (
              <span className="live-pill">
                <span className="live-dot" aria-hidden="true" /> ativa
              </span>
            )}
          </h2>
          <p>
            {f.status === 'monitorando'
              ? `Lendo "${f.folderName}"${f.lastScan ? ` · última verificação às ${time(f.lastScan)}` : ''}`
              : 'Salve faturas e extratos numa pasta e eles entram sozinhos'}
          </p>
        </div>
        {f.status === 'monitorando' && (
          <div className="row-actions">
            <button type="button" className="btn btn--sm" onClick={() => void scanNow()}>
              <RefreshCw size={14} aria-hidden="true" /> Verificar agora
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void connectFolder()}
            >
              Trocar pasta
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => void disconnectFolder()}
            >
              Parar
            </button>
          </div>
        )}
      </div>

      {f.status === 'desligado' || f.status === 'erro' ? (
        <div className="stack" style={{ gap: 12 }}>
          <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-sm)', maxWidth: '68ch' }}>
            Escolha a pasta onde você salva os PDFs, OFX ou CSV do banco (por exemplo,{' '}
            <em>Downloads</em> ou <em>Documentos/Faturas</em>). Enquanto o Raio-X estiver aberto,
            numa aba ou instalado, cada arquivo novo é lido e importado. O app só lê a pasta: nunca
            altera nem apaga arquivos.
          </p>
          {f.error && (
            <div className="notice notice--bad">
              <CircleAlert size={16} aria-hidden="true" />
              <span>{f.error}</span>
            </div>
          )}
          <div>
            <button type="button" className="btn btn--primary" onClick={() => void connectFolder()}>
              <FolderOpen size={16} aria-hidden="true" /> Escolher pasta…
            </button>
          </div>
        </div>
      ) : f.status === 'precisa-permissao' ? (
        <div className="notice notice--warn">
          <CircleAlert size={16} aria-hidden="true" />
          <span>
            O navegador pede para confirmar o acesso à pasta "{f.folderName}" a cada visita.{' '}
            <button type="button" className="link-btn" onClick={() => void resumeFolder()}>
              Retomar monitoramento
            </button>
          </span>
        </div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          {f.initial && (
            <div className="notice">
              <FileSearch size={16} aria-hidden="true" />
              <span style={{ display: 'grid', gap: 8 }}>
                <span>
                  A pasta já tem {f.initial.count} {f.initial.count === 1 ? 'arquivo' : 'arquivos'}{' '}
                  de fatura ou extrato. Importar agora?
                </span>
                <span className="row-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => handleInitial('importar')}
                  >
                    Importar {f.initial.count === 1 ? 'o arquivo' : `os ${f.initial.count}`}
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => handleInitial('ignorar')}
                  >
                    Só os novos daqui em diante
                  </button>
                </span>
              </span>
            </div>
          )}
          <div className="folder-settings">
            <label className="field">
              <span>Quando chegar um arquivo novo</span>
              <select
                id="pasta-modo"
                className="select"
                value={f.mode}
                onChange={(e) => setMode(e.target.value as AutoMode)}
              >
                {(Object.keys(MODE_LABELS) as AutoMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                id="pasta-notificar"
                type="checkbox"
                checked={f.notify}
                onChange={(e) => void setNotify(e.target.checked)}
              />
              Avisar com notificação do sistema quando o app estiver em segundo plano
            </label>
          </div>
          <details className="raw">
            <summary>
              <KeyRound size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Senha dos
              PDFs do banco {f.hasPassword && <span className="chip chip--good">definida</span>}
            </summary>
            <form
              className="toolbar"
              style={{ marginTop: 10 }}
              onSubmit={(e) => {
                e.preventDefault();
                setPassword(pwd, rememberPwd);
                setPwd('');
              }}
            >
              <label className="field" style={{ flex: '0 1 220px' }}>
                <span>Senha (ex.: dígitos do CPF)</span>
                <input
                  id="pasta-senha"
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                />
              </label>
              <label className="check">
                <input
                  id="pasta-lembrar-senha"
                  type="checkbox"
                  checked={rememberPwd}
                  onChange={(e) => setRememberPwd(e.target.checked)}
                />
                Lembrar neste aparelho
              </label>
              <button type="submit" className="btn btn--sm">
                Usar senha
              </button>
            </form>
            <p className="muted" style={{ fontSize: 'var(--text-xs)', marginTop: 6 }}>
              Usada só para abrir os PDFs da pasta. Sem "lembrar", vale até fechar o app. Se
              lembrada, fica guardada apenas neste navegador.
            </p>
          </details>
          {f.log.length > 0 && (
            <div>
              <h3 className="eyebrow" style={{ marginBottom: 6 }}>
                Atividade recente
              </h3>
              <ul className="plain folder-log">
                {f.log.slice(0, 8).map((e) => {
                  const Icon = LOG_ICON[e.type];
                  return (
                    <li
                      key={`${e.time}-${e.fileName}-${e.type}`}
                      className={`folder-log__item folder-log__item--${e.type}`}
                    >
                      <Icon size={14} aria-hidden="true" />
                      <span className="num">{time(e.time)}</span>
                      <span className="folder-log__name">{e.fileName}</span>
                      <span className="muted">
                        {e.type === 'encontrado' ? (e.detail ?? 'arquivo novo') : e.detail}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
