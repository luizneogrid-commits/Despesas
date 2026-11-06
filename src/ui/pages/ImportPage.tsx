import {
  CircleAlert,
  CircleCheck,
  FileText,
  Info,
  LoaderCircle,
  Lock,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { installmentOutlook } from '../../analytics/installments';
import { addMonths, formatDateBR, formatYearMonth } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import {
  findConflicts,
  reconcile,
  withReferenceMonth,
  type ImportDraft,
} from '../../services/importService';
import { pendingMerchants } from '../../services/mappings';
import { recategorize, useAppStore } from '../../store/appStore';
import { CategoryIcon } from '../components/CategoryIcon';
import { MappingRow } from '../components/MappingRow';
import { emptyDraft, type MappingDraft } from '../mappingDraft';
import { addFiles, processItem, useQueue, type QueueItem } from '../importQueue';
import { navigate } from '../route';
import { useCategories } from '../useDashboard';
import { useUiStore } from '../uiStore';

function Dropzone() {
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    addFiles([...e.dataTransfer.files]);
  };
  return (
    <label
      className={`dropzone${over ? ' dropzone--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        id="arquivo-fatura"
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <span className="dropzone__icon" aria-hidden="true">
        <Upload size={24} />
      </span>
      <h2>
        <span className="only-mouse">Arraste o PDF da fatura ou clique para escolher</span>
        <span className="only-touch">Toque para escolher o PDF da fatura</span>
      </h2>
      <p>
        Funciona com a fatura em PDF baixada do app ou do site do banco (Nubank, Itaú, Bradesco,
        Santander, Inter, C6, BB, Caixa e outros). Dá para enviar vários meses de uma vez.
        <span className="only-touch">
          {' '}
          No Android, com o app instalado, você também pode abrir o PDF no app do banco e usar
          Compartilhar → Raio-X.
        </span>
      </p>
      <span className="privacy-note">
        <ShieldCheck size={14} aria-hidden="true" /> O arquivo é lido aqui no seu navegador. Nada é
        enviado para servidores.
      </span>
    </label>
  );
}

function PasswordForm({ item }: { item: QueueItem }) {
  const [password, setPassword] = useState('');
  return (
    <form
      className="receipt__body"
      onSubmit={(e) => {
        e.preventDefault();
        if (password) void processItem(item, password);
      }}
    >
      <div className={`notice${item.wrongPassword ? ' notice--bad' : ''}`}>
        <Lock size={16} aria-hidden="true" />
        <span>
          {item.wrongPassword
            ? 'Senha incorreta. Tente de novo.'
            : 'Este PDF tem senha. Muitos bancos usam os primeiros dígitos do CPF; confira no e-mail ou app do banco.'}
        </span>
      </div>
      <div className="toolbar">
        <label className="field" style={{ flex: '0 1 260px' }}>
          <span>Senha do PDF</span>
          <input
            id={`senha-${item.id}`}
            className="input"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={!password}>
          Abrir PDF
        </button>
      </div>
      <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
        A senha é usada só para abrir o arquivo neste navegador e não fica salva.
      </p>
    </form>
  );
}

function DraftReview({ item }: { item: QueueItem & { draft: ImportDraft } }) {
  const { draft } = item;
  const commitImport = useAppStore((s) => s.commitImport);
  const statements = useAppStore((s) => s.statements);
  const { index, list: categoryList } = useCategories();
  const rules = useAppStore((s) => s.rules);
  const customCategories = useAppStore((s) => s.customCategories);
  const existingTxs = useAppStore((s) => s.transactions);
  const saveMappings = useAppStore((s) => s.saveMappings);
  const remove = useQueue((s) => s.remove);
  const upsert = useQueue((s) => s.upsert);
  const toast = useUiStore((s) => s.toast);
  const setPeriod = useUiStore((s) => s.setPeriod);
  const [showAll, setShowAll] = useState(false);
  const st = draft.statement;
  // O de/para atual (inclusive o criado nesta tela) já se aplica ao rascunho.
  const txs = useMemo(
    () => recategorize(draft.transactions, rules, customCategories),
    [draft.transactions, rules, customCategories],
  );
  const pending = useMemo(() => pendingMerchants(txs), [txs]);
  const pool = useMemo(() => [...txs, ...existingTxs], [txs, existingTxs]);
  const byMapping = txs.filter((t) => t.categorySource === 'regra').length;
  const draftOutlook = useMemo(() => installmentOutlook(txs), [txs]);
  const [mapDrafts, setMapDrafts] = useState<Record<string, MappingDraft>>({});
  const saveMapping = (key: string) => {
    const p = pending.find((x) => x.key === key);
    const v = mapDrafts[key] ?? (p ? emptyDraft(p) : undefined);
    if (!v) return;
    const { affected } = saveMappings([
      { pattern: v.pattern, match: 'contem', categoryId: v.categoryId, displayName: v.displayName },
    ]);
    toast(
      {
        message: `Salvo no de/para: ${affected} ${affected === 1 ? 'lançamento já importado' : 'lançamentos já importados'} + os desta e das próximas faturas.`,
      },
      5000,
    );
  };
  const rec = reconcile(st);
  // Recalculado a cada render: outra fatura pode ter sido importada enquanto esta aguardava.
  const { duplicateOf, sameMonthAs } = item.example ? {} : findConflicts(st, statements);

  const byCat = new Map<string, number>();
  for (const t of txs) {
    if (t.kind === 'pagamento') continue;
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amountCents);
  }
  const topCats = [...byCat.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const monthOptions = Array.from({ length: 13 }, (_, i) => addMonths(st.referenceMonth, i - 6));

  const doImport = (replace?: string) => {
    commitImport(draft, replace ? { replaceStatementId: replace } : undefined);
    remove(item.id);
    setPeriod('all');
    toast({
      message: `Fatura de ${formatYearMonth(st.referenceMonth)} importada: ${draft.transactions.length} lançamentos.`,
      action: { label: 'Ver visão geral', run: () => navigate('visao-geral') },
    });
  };

  const visible = showAll ? txs : txs.slice(0, 8);

  return (
    <>
      <div className="receipt__body">
        <dl className="facts">
          <div className="fact">
            <dt>Mês da fatura</dt>
            <dd>
              <select
                id={`mes-${item.id}`}
                className="select"
                aria-label="Mês de referência da fatura"
                value={st.referenceMonth}
                onChange={(e) =>
                  upsert({ ...item, draft: withReferenceMonth(draft, e.target.value) })
                }
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatYearMonth(m, 'long')}
                  </option>
                ))}
              </select>
            </dd>
          </div>
          <div className="fact">
            <dt>Vencimento</dt>
            <dd>{st.dueDate ? formatDateBR(st.dueDate) : 'não encontrado'}</dd>
          </div>
          <div className="fact">
            <dt>Lançamentos lidos</dt>
            <dd>{draft.transactions.length}</dd>
          </div>
          <div className="fact">
            <dt>Soma dos lançamentos</dt>
            <dd className="num">{formatBRL(st.parsedTotalCents)}</dd>
          </div>
          <div className="fact">
            <dt>Total impresso na fatura</dt>
            <dd className="num">
              {st.declaredTotalCents !== undefined ? formatBRL(st.declaredTotalCents) : '—'}
            </dd>
          </div>
        </dl>

        {rec.status === 'confere' && (
          <div className="notice notice--good">
            <CircleCheck size={16} aria-hidden="true" />
            <span>A soma dos lançamentos confere com o total da fatura.</span>
          </div>
        )}
        {rec.status === 'diferente' && (
          <div className="notice notice--warn">
            <CircleAlert size={16} aria-hidden="true" />
            <span>
              Diferença de {formatBRL(Math.abs(rec.diffCents))} para o total impresso. Pode ser
              saldo anterior, juros do rotativo ou lançamentos que não reconhecemos — confira abaixo
              antes de importar.
            </span>
          </div>
        )}
        {byMapping > 0 && (
          <div className="notice notice--good">
            <CircleCheck size={16} aria-hidden="true" />
            <span>
              {byMapping} {byMapping === 1 ? 'lançamento reconhecido' : 'lançamentos reconhecidos'}{' '}
              pelo seu de/para.
            </span>
          </div>
        )}
        {draftOutlook.plans.length > 0 && (
          <div className="notice">
            <Info size={16} aria-hidden="true" />
            <span>
              {draftOutlook.plans.length}{' '}
              {draftOutlook.plans.length === 1 ? 'compra parcelada' : 'compras parceladas'} nesta
              fatura: <strong>{formatBRL(draftOutlook.totalRemainingCents)}</strong> ainda vão cair
              nas próximas faturas
              {draftOutlook.endsMonth ? ` (até ${formatYearMonth(draftOutlook.endsMonth)})` : ''}.
              Depois de importar, veja a projeção mês a mês em Parcelas.
            </span>
          </div>
        )}
        {draft.skippedFutureCount > 0 && (
          <div className="notice">
            <Info size={16} aria-hidden="true" />
            <span>
              {draft.skippedFutureCount}{' '}
              {draft.skippedFutureCount === 1 ? 'parcela listada' : 'parcelas listadas'} em
              "próximas faturas" foram ignoradas: só entram no mês em que forem cobradas.
            </span>
          </div>
        )}
        {st.warnings.map((w) => (
          <div key={w} className="notice notice--warn">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{w}</span>
          </div>
        ))}
        {duplicateOf && (
          <div className="notice notice--bad">
            <CircleAlert size={16} aria-hidden="true" />
            <span>
              Este mesmo arquivo já foi importado em{' '}
              {formatDateBR(duplicateOf.importedAt.slice(0, 10))}. Importar de novo duplicaria os
              lançamentos.
            </span>
          </div>
        )}
        {sameMonthAs && (
          <div className="notice notice--warn">
            <CircleAlert size={16} aria-hidden="true" />
            <span>
              Já existe uma fatura {sameMonthAs.issuerName} de{' '}
              {formatYearMonth(sameMonthAs.referenceMonth)} ({sameMonthAs.fileName}). Se for a mesma
              fatura reemitida, substitua a anterior.
            </span>
          </div>
        )}

        {pending.length > 0 && (
          <div>
            <h3 className="eyebrow" style={{ marginBottom: 4 }}>
              Não reconhecidos nesta fatura ({pending.length})
            </h3>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              Mapeie agora ou depois em De/para. O mapeamento vale para esta fatura, para as já
              importadas e para as próximas.
            </p>
            <ul className="plain maplist">
              {pending.slice(0, 5).map((p) => (
                <MappingRow
                  key={p.key}
                  idPrefix={`rev-${item.id}`}
                  pending={p}
                  value={mapDrafts[p.key] ?? emptyDraft(p)}
                  categories={categoryList}
                  pool={pool}
                  onChange={(v) => setMapDrafts((d) => ({ ...d, [p.key]: v }))}
                  onSave={() => saveMapping(p.key)}
                />
              ))}
            </ul>
            {pending.length > 5 && (
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                E mais {pending.length - 5}. Depois de importar, mapeie todos na aba De/para.
              </p>
            )}
          </div>
        )}
        {topCats.length > 0 && (
          <div>
            <h3 className="eyebrow" style={{ marginBottom: 8 }}>
              Prévia por categoria
            </h3>
            <ul className="plain cat-grid">
              {topCats.map(([id, v]) => (
                <li key={id} className="cat-card">
                  <CategoryIcon icon={index.get(id)?.icon} size="sm" />
                  <div>
                    <strong>{index.get(id)?.name ?? id}</strong>
                  </div>
                  <span className="num">{formatBRL(v)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {txs.length > 0 && (
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th className="right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id}>
                    <td className="num">{formatDateBR(t.date)}</td>
                    <td>
                      {t.description}
                      {t.installment && (
                        <span className="chip chip--carbon" style={{ marginLeft: 6 }}>
                          {t.installment.current}/{t.installment.total}
                        </span>
                      )}
                    </td>
                    <td>{index.get(t.categoryId)?.name}</td>
                    <td className="right num">{formatBRL(t.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {txs.length > 8 && (
          <button type="button" className="link-btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Mostrar menos' : `Ver todos os ${txs.length} lançamentos`}
          </button>
        )}
        {draft.unrecognizedLines.length > 0 && (
          <details className="raw">
            <summary>
              {draft.unrecognizedLines.length}{' '}
              {draft.unrecognizedLines.length === 1
                ? 'linha com valor não reconhecida'
                : 'linhas com valor não reconhecidas'}
            </summary>
            <pre>{draft.unrecognizedLines.join('\n')}</pre>
          </details>
        )}
      </div>
      <div className="receipt__actions">
        {sameMonthAs ? (
          <>
            <button type="button" className="btn btn--primary" onClick={() => doImport()}>
              Importar como outra fatura
            </button>
            <button type="button" className="btn" onClick={() => doImport(sameMonthAs.id)}>
              Substituir a fatura anterior
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            disabled={Boolean(duplicateOf) || draft.transactions.length === 0}
            onClick={() => doImport()}
          >
            Importar {draft.transactions.length} lançamentos
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => remove(item.id)}>
          Descartar
        </button>
      </div>
    </>
  );
}

function QueueCard({ item }: { item: QueueItem }) {
  const remove = useQueue((s) => s.remove);
  const st = item.draft?.statement;
  return (
    <article className="receipt" aria-label={`Arquivo ${item.file.name}`}>
      <header className="receipt__head">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
          <span className="cat-icon" aria-hidden="true">
            {item.status === 'lendo' ? (
              <LoaderCircle size={16} className="spinner" />
            ) : (
              <FileText size={16} />
            )}
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ overflowWrap: 'anywhere' }}>
              {st
                ? `${st.issuerName} · ${formatYearMonth(st.referenceMonth, 'long')}`
                : item.file.name}
            </h2>
            <p className="muted" style={{ fontSize: 'var(--text-xs)', overflowWrap: 'anywhere' }}>
              {item.file.name}
              {item.example ? ' · exemplo com dados fictícios' : ''}
            </p>
          </div>
        </div>
        {item.status === 'revisao' && <span className="chip chip--carbon">Revise e confirme</span>}
        {item.status === 'lendo' && <span className="chip">Lendo o PDF…</span>}
        {item.status === 'senha' && <span className="chip chip--warn">Protegido por senha</span>}
        {item.status === 'erro' && <span className="chip chip--bad">Não foi possível ler</span>}
      </header>
      <div className="receipt__tear" aria-hidden="true" />
      {item.status === 'revisao' && item.draft && (
        <DraftReview item={{ ...item, draft: item.draft }} />
      )}
      {item.status === 'senha' && <PasswordForm item={item} />}
      {item.status === 'erro' && (
        <div className="receipt__body">
          <div className="notice notice--bad">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{item.error}</span>
          </div>
          <div>
            <button type="button" className="btn btn--ghost" onClick={() => remove(item.id)}>
              Remover da lista
            </button>
          </div>
        </div>
      )}
      {item.status === 'lendo' && (
        <div className="receipt__body">
          <p className="muted">Extraindo o texto e reconhecendo os lançamentos…</p>
        </div>
      )}
    </article>
  );
}

export function ImportPage() {
  const items = useQueue((s) => s.items);
  const [loadingExample, setLoadingExample] = useState(false);
  const toast = useUiStore((s) => s.toast);

  const tryExample = async () => {
    setLoadingExample(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}exemplo-fatura.pdf`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      addFiles([new File([blob], 'fatura-exemplo.pdf', { type: 'application/pdf' })], true);
    } catch {
      toast({ message: 'Não foi possível carregar a fatura de exemplo.', tone: 'erro' });
    } finally {
      setLoadingExample(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Importar fatura</h1>
          <p>
            Envie o PDF, confira o que foi lido e confirme. As categorias são sugeridas
            automaticamente e você pode ajustá-las depois.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => void tryExample()}
          disabled={loadingExample}
        >
          <FileText size={16} aria-hidden="true" /> Testar com uma fatura de exemplo
        </button>
      </div>
      <Dropzone />
      {items.map((item) => (
        <QueueCard key={item.id} item={item} />
      ))}
      <section className="panel" aria-labelledby="dicas-titulo">
        <div className="panel__head">
          <h2 id="dicas-titulo">Dicas para uma boa leitura</h2>
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            color: 'var(--ink-2)',
            fontSize: 'var(--text-sm)',
            display: 'grid',
            gap: 6,
          }}
        >
          <li>Use o PDF original do banco. Fotos ou PDFs escaneados não têm texto para ler.</li>
          <li>Faturas com senha abrem aqui mesmo: a senha não é guardada.</li>
          <li>
            Parcelas listadas em "próximas faturas" são ignoradas; entram apenas no mês em que são
            cobradas.
          </li>
          <li>
            Pagamentos da fatura não contam como gasto. Estornos abatem a categoria da compra
            original.
          </li>
          <li>
            Se algo não for reconhecido, abra "linhas com valor não reconhecidas" no cartão de
            revisão para ver o que ficou de fora.
          </li>
        </ul>
      </section>
    </>
  );
}
