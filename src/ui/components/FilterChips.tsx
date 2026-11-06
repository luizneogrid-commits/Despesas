import { ArrowLeft, X } from 'lucide-react';
import type { PeriodKey } from '../../analytics/aggregate';
import { formatYearMonth } from '../../domain/dates';
import { navigate, ROUTE_LABELS } from '../route';
import { useCategories } from '../useDashboard';
import { EMPTY_TX_FILTER, useUiStore } from '../uiStore';

function periodLabel(p: PeriodKey): string | null {
  if (p === 'all') return null;
  if (p.startsWith('m:')) return formatYearMonth(p.slice(2), 'long');
  return p === 'last3' ? 'Últimos 3 meses' : p === 'last6' ? 'Últimos 6 meses' : 'Últimos 12 meses';
}

const KIND_LABEL: Record<string, string> = {
  compra: 'Compras',
  estorno: 'Estornos',
  pagamento: 'Pagamentos de fatura',
  encargo: 'Juros e tarifas',
  receita: 'Entradas',
  transferencia: 'Aplicações e transferências',
};

/**
 * Mostra de onde o usuário veio e quais filtros estão valendo, com um "x" em
 * cada um: a lista nunca fica filtrada "sem explicação".
 */
export function FilterChips() {
  const { index } = useCategories();
  const f = useUiStore((s) => s.txFilter);
  const setFilter = useUiStore((s) => s.setTxFilter);
  const period = useUiStore((s) => s.period);
  const setPeriod = useUiStore((s) => s.setPeriod);
  const source = useUiStore((s) => s.source);
  const setSource = useUiStore((s) => s.setSource);
  const cameFrom = useUiStore((s) => s.cameFrom);
  const setOrigin = useUiStore((s) => s.setOrigin);

  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  const pl = periodLabel(period);
  if (pl) chips.push({ key: 'periodo', label: pl, clear: () => setPeriod('all') });
  if (source)
    chips.push({
      key: 'origem',
      label: source === 'conta' ? 'Só conta' : 'Só cartão',
      clear: () => setSource(''),
    });
  if (f.categoryId) {
    chips.push({
      key: 'cat',
      label: index.get(f.categoryId)?.name ?? f.categoryId,
      clear: () => setFilter({ categoryId: '' }),
    });
  }
  if (f.kind)
    chips.push({
      key: 'tipo',
      label: KIND_LABEL[f.kind] ?? f.kind,
      clear: () => setFilter({ kind: '' }),
    });
  if (f.query.trim())
    chips.push({
      key: 'busca',
      label: `"${f.query.trim()}"`,
      clear: () => setFilter({ query: '' }),
    });
  if (f.onlyUnclassified)
    chips.push({
      key: 'sem',
      label: 'Sem categoria',
      clear: () => setFilter({ onlyUnclassified: false }),
    });

  if (!cameFrom && chips.length === 0) return null;
  return (
    <div className="context-bar" role="region" aria-label="Filtros ativos">
      {cameFrom && (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setOrigin(null);
            navigate(cameFrom);
          }}
        >
          <ArrowLeft size={14} aria-hidden="true" /> Voltar{' '}
          {cameFrom === 'visao-geral' ? 'ao' : 'para'} {ROUTE_LABELS[cameFrom]}
        </button>
      )}
      {chips.map((c) => (
        <span key={c.key} className="filter-chip">
          {c.label}
          <button type="button" aria-label={`Remover filtro ${c.label}`} onClick={c.clear}>
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setFilter(EMPTY_TX_FILTER);
            setPeriod('all');
            setSource('');
          }}
        >
          Limpar tudo
        </button>
      )}
    </div>
  );
}
