import {
  CircleCheck,
  Database,
  Download,
  FileJson,
  HardDrive,
  Share,
  ShieldCheck,
  Smartphone,
  SquarePlus,
  Trash2,
  Upload,
} from 'lucide-react';
import { formatDateBR, formatYearMonth } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import { backupJSON, transactionsToCSV } from '../../services/exportService';
import { reconcile } from '../../services/importService';
import { isIOS, useInstall } from '../../pwa/install';
import { useAppStore } from '../../store/appStore';
import { saveFile } from '../../utils/saveFile';
import { ConfirmButton } from '../components/ConfirmButton';
import { useCategories } from '../useDashboard';
import { useUiStore } from '../uiStore';

/** Instalação no celular: convite nativo (Android/Chrome) ou passo a passo (iPhone). */
function InstallPanel() {
  const canPrompt = useInstall((s) => s.canPrompt);
  const installed = useInstall((s) => s.installed);
  const promptInstall = useInstall((s) => s.promptInstall);
  const ios = isIOS();
  const address = window.location.href.split('#')[0]?.split('?')[0] ?? '';
  const framed = window.top !== window;

  return (
    <section className="panel" aria-labelledby="instalar-titulo">
      <div className="panel__head">
        <h2 id="instalar-titulo">App no celular</h2>
        <p>Instale para abrir pela tela inicial, em tela cheia e sem internet</p>
      </div>
      {installed ? (
        <div className="notice notice--good">
          <CircleCheck size={16} aria-hidden="true" />
          <span>O Raio-X está instalado neste aparelho.</span>
        </div>
      ) : canPrompt ? (
        <div className="row-actions">
          <button type="button" className="btn btn--primary" onClick={() => void promptInstall()}>
            <Download size={16} aria-hidden="true" /> Instalar app
          </button>
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            Depois, no Android, dá para enviar o PDF da fatura pelo menu Compartilhar.
          </span>
        </div>
      ) : ios ? (
        <ol className="install-steps">
          <li>
            Abra este endereço no <strong>Safari</strong>.
          </li>
          <li>
            Toque em <Share size={16} aria-label="Compartilhar" style={{ verticalAlign: '-3px' }} />{' '}
            <strong>Compartilhar</strong>.
          </li>
          <li>
            Escolha <SquarePlus size={16} aria-hidden="true" style={{ verticalAlign: '-3px' }} />{' '}
            <strong>Adicionar à Tela de Início</strong>.
          </li>
        </ol>
      ) : (
        <div className="notice">
          <Smartphone size={16} aria-hidden="true" />
          <span>
            {framed
              ? 'Para instalar no celular, abra a versão publicada no GitHub Pages pelo navegador do aparelho e use "Adicionar à tela inicial".'
              : `No celular, abra ${address} no Chrome (Android) ou Safari (iPhone) e use "Instalar app" ou "Adicionar à tela inicial".`}
          </span>
        </div>
      )}
    </section>
  );
}

export function DataPage() {
  const statements = useAppStore((s) => s.statements);
  const transactions = useAppStore((s) => s.transactions);
  const storage = useAppStore((s) => s.storage);
  const removeStatement = useAppStore((s) => s.removeStatement);
  const clearAll = useAppStore((s) => s.clearAll);
  const loadDemo = useAppStore((s) => s.loadDemo);
  const restoreBackup = useAppStore((s) => s.restoreBackup);
  const { index } = useCategories();
  const toast = useUiStore((s) => s.toast);
  const today = new Date().toISOString().slice(0, 10);

  const report = (outcome: string, what: string) => {
    if (outcome === 'salvo') toast({ message: `${what} pronto para salvar.` }, 3000);
    else if (outcome === 'indisponivel')
      toast({ message: 'Este ambiente não permite baixar arquivos.', tone: 'erro' });
  };

  const exportCSV = async () => {
    const csv = transactionsToCSV(transactions, index);
    report(await saveFile(`lancamentos-cartao-${today}.csv`, csv, 'text/csv;charset=utf-8'), 'CSV');
  };

  const exportBackup = async () => {
    const s = useAppStore.getState();
    const json = backupJSON({
      schemaVersion: s.schemaVersion,
      statements: s.statements,
      transactions: s.transactions,
      rules: s.rules,
      customCategories: s.customCategories,
    });
    report(
      await saveFile(`backup-raio-x-fatura-${today}.json`, json, 'application/json'),
      'Backup',
    );
  };

  const onRestore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const ok = restoreBackup(JSON.parse(await file.text()));
      toast(
        ok
          ? { message: 'Backup restaurado.' }
          : { message: 'Arquivo de backup inválido.', tone: 'erro' },
        4000,
      );
    } catch {
      toast({ message: 'Não foi possível ler o arquivo de backup.', tone: 'erro' }, 4000);
    }
  };

  const sorted = [...statements].sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Seus dados</h1>
          <p>
            Tudo fica guardado só neste navegador. Exporte para planilha ou faça backup para levar a
            outro dispositivo.
          </p>
        </div>
      </div>

      <InstallPanel />

      <div className="grid-2 grid-2--even">
        <section className="panel" aria-labelledby="priv-titulo">
          <div className="panel__head">
            <h2 id="priv-titulo">Privacidade</h2>
          </div>
          <ul
            className="plain kbd-list"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-2)' }}
          >
            <li className="notice">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                O PDF é lido no próprio navegador. Nenhum dado da fatura é enviado a servidores, e o
                app não usa rastreadores nem fontes ou scripts de terceiros.
              </span>
            </li>
            <li className={`notice${storage === 'memoria' ? ' notice--warn' : ''}`}>
              <HardDrive size={16} aria-hidden="true" />
              <span>
                {storage === 'memoria'
                  ? 'Este navegador não permitiu salvar dados (janela anônima ou bloqueio). Tudo some ao fechar a página: faça um backup.'
                  : 'Salvo neste navegador (IndexedDB). Limpar os dados do site apaga as informações; faça backups de vez em quando.'}
              </span>
            </li>
          </ul>
        </section>
        <section className="panel" aria-labelledby="export-titulo">
          <div className="panel__head">
            <h2 id="export-titulo">Exportar e backup</h2>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            <div className="row-actions">
              <button
                type="button"
                className="btn"
                onClick={() => void exportCSV()}
                disabled={transactions.length === 0}
              >
                <Download size={16} aria-hidden="true" /> Planilha (CSV)
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void exportBackup()}
                disabled={statements.length === 0}
              >
                <FileJson size={16} aria-hidden="true" /> Backup completo (JSON)
              </button>
              <label className="btn" style={{ position: 'relative' }}>
                <Upload size={16} aria-hidden="true" /> Restaurar backup
                <input
                  id="restaurar-backup"
                  type="file"
                  accept="application/json,.json"
                  className="visually-hidden"
                  onChange={(e) => {
                    void onRestore(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              O CSV usa ";" e vírgula decimal, e abre direto no Excel ou Google Planilhas em
              português. O backup inclui faturas, lançamentos, regras e categorias.
            </p>
          </div>
        </section>
      </div>

      <section className="panel" aria-labelledby="faturas-titulo">
        <div className="panel__head">
          <h2 id="faturas-titulo">Faturas importadas</h2>
          <p>
            {statements.length} {statements.length === 1 ? 'fatura' : 'faturas'} ·{' '}
            {transactions.length} lançamentos
          </p>
        </div>
        {sorted.length === 0 ? (
          <div className="empty" style={{ padding: 24 }}>
            <Database size={28} aria-hidden="true" color="var(--ink-3)" />
            <p>Nenhuma fatura importada.</p>
            <div className="row-actions" style={{ justifyContent: 'center' }}>
              <a className="btn btn--primary" href="#importar">
                Importar fatura
              </a>
              <button type="button" className="btn" onClick={loadDemo}>
                Carregar dados de exemplo
              </button>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Fatura</th>
                  <th className="hide-narrow">Emissor</th>
                  <th className="right hide-narrow">Lanç.</th>
                  <th className="right">Total lido</th>
                  <th>Conferência</th>
                  <th>
                    <span className="visually-hidden">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((st) => {
                  const rec = reconcile(st);
                  return (
                    <tr key={st.id}>
                      <td>
                        <strong style={{ fontWeight: 500 }}>
                          {formatYearMonth(st.referenceMonth, 'long')}
                        </strong>
                        <div
                          className="muted"
                          style={{ fontSize: 'var(--text-xs)', overflowWrap: 'anywhere' }}
                        >
                          {st.fileName}
                          {st.dueDate ? ` · vence ${formatDateBR(st.dueDate)}` : ''}
                        </div>
                      </td>
                      <td className="hide-narrow">
                        {st.issuerName}
                        {st.isDemo && (
                          <span className="chip" style={{ marginLeft: 6 }}>
                            exemplo
                          </span>
                        )}
                      </td>
                      <td className="right num hide-narrow">{st.transactionCount}</td>
                      <td className="right num">{formatBRL(st.parsedTotalCents)}</td>
                      <td>
                        {rec.status === 'confere' && (
                          <span className="chip chip--good">confere</span>
                        )}
                        {rec.status === 'diferente' && (
                          <span className="chip chip--warn">
                            dif. {formatBRL(Math.abs(rec.diffCents))}
                          </span>
                        )}
                        {rec.status === 'sem-total' && <span className="chip">sem total</span>}
                      </td>
                      <td className="right">
                        <ConfirmButton
                          className="icon-btn"
                          ariaLabel={`Remover fatura de ${formatYearMonth(st.referenceMonth)}`}
                          confirmLabel="Remover"
                          onConfirm={() => removeStatement(st.id)}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </ConfirmButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="apagar-titulo">
        <div className="panel__head">
          <h2 id="apagar-titulo">Apagar tudo</h2>
          <p>Remove faturas, lançamentos, regras e categorias deste navegador</p>
        </div>
        <ConfirmButton
          confirmLabel="Sim, apagar tudo"
          prompt="Essa ação não pode ser desfeita."
          onConfirm={clearAll}
          className="btn btn--danger"
        >
          <Trash2 size={16} aria-hidden="true" /> Apagar todos os dados
        </ConfirmButton>
      </section>
    </>
  );
}
