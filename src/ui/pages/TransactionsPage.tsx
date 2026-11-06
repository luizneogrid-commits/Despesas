import { Eye, EyeOff, Globe, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useDeferredValue, useMemo, useState } from 'react';
import { isSpend, monthsForPeriod } from '../../analytics/aggregate';
import { normalizeText } from '../../categorization/normalize';
import { formatDayMonth } from '../../domain/dates';
import { formatBRL, formatMovement } from '../../domain/money';
import type { Transaction, TxKind } from '../../domain/types';
import { useAppStore } from '../../store/appStore';
import { CategoryIcon } from '../components/CategoryIcon';
import { ContextFilters } from '../components/ContextFilters';
import { FilterChips } from '../components/FilterChips';
import { CategorySelect } from '../components/CategorySelect';
import { useCategories, useFilterOptions } from '../useDashboard';
import { EMPTY_TX_FILTER, useUiStore } from '../uiStore';

const KIND_LABELS: Record<TxKind, string> = {
  compra: 'Compras',
  estorno: 'Estornos e créditos',
  pagamento: 'Pagamentos da fatura',
  encargo: 'Juros, IOF e tarifas',
  receita: 'Entradas (conta)',
  transferencia: 'Aplicações e transferências',
};

const PAGE = 120;

export function TransactionsPage() {
  const transactions = useAppStore((s) => s.transactions);
  const setCategory = useAppStore((s) => s.setCategory);
  const toggleExcluded = useAppStore((s) => s.toggleExcluded);
  const { list: categories, index } = useCategories();
  const filter = useUiStore((s) => s.txFilter);
  const setFilter = useUiStore((s) => s.setTxFilter);
  const toast = useUiStore((s) => s.toast);
  const [limit, setLimit] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Atalho "/" para buscar (padrão de apps web), fora de campos de texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || el?.closest('input, select, textarea')) return;
      e.preventDefault();
      document.getElementById('busca-lancamentos')?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const query = useDeferredValue(filter.query);

  const period = useUiStore((s) => s.period);
  const source = useUiStore((s) => s.source);
  const card = useUiStore((s) => s.card);
  const { months: available } = useFilterOptions();
  const periodMonths = useMemo(
    () => new Set(monthsForPeriod(period, available)),
    [period, available],
  );

  const rows = useMemo(() => {
    const q = normalizeText(query);
    return transactions
      .filter((t) => {
        if (!periodMonths.has(t.referenceMonth)) return false;
        if (source === 'conta' ? t.source !== 'conta' : source === 'cartao' && t.source === 'conta')
          return false;
        if (card && t.cardLast4 !== card) return false;
        if (filter.categoryId && t.categoryId !== filter.categoryId) return false;
        if (filter.kind && t.kind !== filter.kind) return false;
        if (filter.onlyUnclassified && t.categoryId !== 'outros') return false;
        if (q && !normalizeText(`${t.description} ${t.merchantName}`).includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  }, [
    transactions,
    periodMonths,
    source,
    card,
    filter.categoryId,
    filter.kind,
    filter.onlyUnclassified,
    query,
  ]);

  const total = rows.reduce((a, t) => (isSpend(t, index) ? a + t.amountCents : a), 0);
  const income = rows.reduce(
    (a, t) => (t.kind === 'receita' && !t.excluded ? a - t.amountCents : a),
    0,
  );
  const unclassified = transactions.filter((t) => t.categoryId === 'outros').length;

  const onCategory = (tx: Transaction, categoryId: string) => {
    setCategory(tx.id, categoryId, false);
    const similar = transactions.filter(
      (t) => t.merchantKey === tx.merchantKey && t.id !== tx.id,
    ).length;
    const catName = index.get(categoryId)?.name ?? categoryId;
    toast(
      {
        message:
          similar > 0
            ? `"${tx.merchantName}" agora é ${catName}. Salvar no de/para e aplicar aos outros ${similar} lançamentos e às próximas faturas?`
            : `"${tx.merchantName}" agora é ${catName}. Salvar no de/para para as próximas faturas?`,
        action: {
          label: 'Salvar no de/para',
          run: () => {
            const n = setCategory(tx.id, categoryId, true);
            toast(
              {
                message: `Regra criada: ${n} ${n === 1 ? 'lançamento' : 'lançamentos'} em ${catName}.`,
              },
              4000,
            );
          },
        },
      },
      9000,
    );
  };

  const activeFilters = [filter.categoryId, filter.kind].filter(Boolean).length;
  const filtered =
    filter.categoryId || filter.kind || filter.onlyUnclassified || filter.query.trim().length > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lançamentos</h1>
          <p>
            Faturas do cartão e extratos da conta juntos. Ao corrigir uma categoria, o app oferece
            salvar no de/para e aplicar nas próximas importações.
          </p>
        </div>
      </div>
      <ContextFilters />
      <FilterChips />
      <section className="panel" aria-label="Filtros dos lançamentos">
        <div className="toolbar">
          <label className="field field--wide">
            <span>Buscar</span>
            <span style={{ position: 'relative', display: 'block' }}>
              <Search
                size={16}
                aria-hidden="true"
                style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-3)' }}
              />
              <input
                id="busca-lancamentos"
                className="input"
                style={{ paddingLeft: 32 }}
                type="search"
                placeholder="Buscar estabelecimento (atalho: /)"
                value={filter.query}
                onChange={(e) => setFilter({ query: e.target.value })}
              />
            </span>
          </label>
          <button
            type="button"
            className="btn filters-toggle"
            aria-expanded={filtersOpen}
            aria-controls="filtros-extras"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal size={16} aria-hidden="true" /> Filtros
            {activeFilters > 0 && <span className="count-badge">{activeFilters}</span>}
          </button>
          <div id="filtros-extras" className={`filters-extra${filtersOpen ? ' is-open' : ''}`}>
            <label className="field">
              <span>Categoria</span>
              <CategorySelect
                id="filtro-categoria"
                label="Categoria"
                value={filter.categoryId}
                categories={categories}
                includeAll
                includeHidden
                onChange={(categoryId) => setFilter({ categoryId })}
              />
            </label>
            <label className="field">
              <span>Tipo</span>
              <select
                id="filtro-tipo"
                className="select"
                value={filter.kind}
                onChange={(e) => setFilter({ kind: e.target.value as TxKind | '' })}
              >
                <option value="">Todos</option>
                {(Object.keys(KIND_LABELS) as TxKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="row-actions" style={{ marginTop: 8, justifyContent: 'space-between' }}>
          <label className="check">
            <input
              id="filtro-sem-categoria"
              type="checkbox"
              checked={filter.onlyUnclassified}
              onChange={(e) => setFilter({ onlyUnclassified: e.target.checked })}
            />
            Só sem categoria ({unclassified})
          </label>
          {filtered && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setFilter(EMPTY_TX_FILTER)}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </section>

      <section className="panel" aria-labelledby="lista-titulo">
        <div className="panel__head">
          <h2 id="lista-titulo">
            {rows.length} {rows.length === 1 ? 'lançamento' : 'lançamentos'}
          </h2>
          <p>
            Gastos: <span className="num">{formatBRL(total)}</span>
            {income > 0 && (
              <>
                {' '}
                · Entradas: <span className="num">{formatBRL(income)}</span>
              </>
            )}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="muted">Nenhum lançamento com esses filtros.</p>
        ) : (
          <div className="txlist" role="list">
            <div className="txrow txrow--head" aria-hidden="true">
              <span>Data</span>
              <span>Descrição</span>
              <span>Categoria</span>
              <span style={{ textAlign: 'right' }}>Valor</span>
              <span />
            </div>
            {rows.slice(0, limit).map((t) => {
              const cat = index.get(t.categoryId);
              const credit = t.amountCents < 0;
              return (
                <div
                  key={t.id}
                  role="listitem"
                  className={`txrow${t.excluded ? ' txrow--excluded' : ''}`}
                >
                  <span className="txrow__date num">{formatDayMonth(t.date)}</span>
                  <div className="txrow__desc">
                    <div className="txrow__title">
                      {t.description}{' '}
                      <span className="txrow__mdate">· {formatDayMonth(t.date)}</span>
                    </div>
                    <div className="txrow__tags">
                      {t.merchantName !== t.description && (
                        <span className="chip">{t.merchantName}</span>
                      )}
                      {t.installment && (
                        <span className="chip chip--carbon">
                          parcela {t.installment.current}/{t.installment.total}
                        </span>
                      )}
                      {t.international && (
                        <span className="chip">
                          <Globe size={12} aria-hidden="true" /> internacional
                          {t.foreign
                            ? ` · ${t.foreign.currency} ${(t.foreign.amountCents / 100).toFixed(2).replace('.', ',')}`
                            : ''}
                        </span>
                      )}
                      {t.kind === 'estorno' && <span className="chip chip--good">estorno</span>}
                      {t.kind === 'pagamento' && <span className="chip">pagamento</span>}
                      {t.kind === 'encargo' && <span className="chip chip--warn">encargo</span>}
                      {t.source === 'conta' ? (
                        <span className="chip">conta</span>
                      ) : (
                        t.cardLast4 && <span className="chip">final {t.cardLast4}</span>
                      )}
                      {t.kind === 'receita' && <span className="chip chip--good">entrada</span>}
                      {t.kind === 'transferencia' && <span className="chip">neutro</span>}
                      {t.categorySource === 'regra' && (
                        <span className="chip chip--carbon">de/para</span>
                      )}
                      {t.excluded && <span className="chip">fora da análise</span>}
                    </div>
                  </div>
                  <div className="txrow__cat">
                    <CategoryIcon icon={cat?.icon} size="sm" />
                    <CategorySelect
                      id={`cat-${t.id}`}
                      label={`Categoria de ${t.description}`}
                      value={t.categoryId}
                      categories={categories}
                      scopes={credit ? ['receita', 'gasto', 'neutro'] : ['gasto', 'neutro']}
                      onChange={(id) => onCategory(t, id)}
                    />
                  </div>
                  <span className={`txrow__amount num${credit ? ' txrow__amount--credit' : ''}`}>
                    {formatMovement(t.amountCents)}
                  </span>
                  <span className="txrow__action">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => toggleExcluded(t.id)}
                      aria-label={
                        t.excluded
                          ? `Voltar a considerar ${t.description}`
                          : `Tirar ${t.description} da análise`
                      }
                      title={
                        t.excluded
                          ? 'Voltar a considerar na análise'
                          : 'Tirar da análise (ex.: compra para outra pessoa)'
                      }
                    >
                      {t.excluded ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {rows.length > limit && (
          <div style={{ marginTop: 16 }}>
            <button type="button" className="btn" onClick={() => setLimit((l) => l + PAGE)}>
              Mostrar mais {Math.min(PAGE, rows.length - limit)} de {rows.length - limit}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
