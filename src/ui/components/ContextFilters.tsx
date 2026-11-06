import type { PeriodKey } from '../../analytics/aggregate';
import { formatYearMonth } from '../../domain/dates';
import { useFilterOptions } from '../useDashboard';
import { useUiStore, type SourceFilter } from '../uiStore';

/**
 * Filtros de contexto compartilhados por Início, Lançamentos e Parcelas:
 * escolher "outubro" numa tela vale para as outras (o usuário não precisa
 * refazer o filtro a cada troca de aba).
 */
export function ContextFilters({
  show = ['periodo', 'origem', 'cartao'],
}: {
  show?: Array<'periodo' | 'origem' | 'cartao'>;
}) {
  const { months, cards, hasAccount, hasCard } = useFilterOptions();
  const period = useUiStore((s) => s.period);
  const setPeriod = useUiStore((s) => s.setPeriod);
  const source = useUiStore((s) => s.source);
  const setSource = useUiStore((s) => s.setSource);
  const card = useUiStore((s) => s.card);
  const setCard = useUiStore((s) => s.setCard);
  const n = months.length;
  const validPeriod =
    period === 'all' || period.startsWith('last') || months.includes(period.slice(2));

  return (
    <div className="toolbar context-filters" role="group" aria-label="Filtros">
      {show.includes('periodo') && (
        <label className="field" style={{ flex: '0 1 220px' }}>
          <span>Período</span>
          <select
            id="filtro-periodo"
            className="select"
            value={validPeriod ? period : 'all'}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
          >
            <option value="all">Todos os meses ({n})</option>
            {n > 3 && <option value="last3">Últimos 3 meses</option>}
            {n > 6 && <option value="last6">Últimos 6 meses</option>}
            {n > 12 && <option value="last12">Últimos 12 meses</option>}
            {[...months].reverse().map((m) => (
              <option key={m} value={`m:${m}`}>
                {formatYearMonth(m, 'long')}
              </option>
            ))}
          </select>
        </label>
      )}
      {show.includes('origem') && hasAccount && hasCard && (
        <label className="field" style={{ flex: '0 1 190px' }}>
          <span>Origem</span>
          <select
            id="filtro-origem"
            className="select"
            value={source}
            onChange={(e) => setSource(e.target.value as SourceFilter)}
          >
            <option value="">Cartão e conta</option>
            <option value="cartao">Só cartão de crédito</option>
            <option value="conta">Só conta corrente</option>
          </select>
        </label>
      )}
      {show.includes('cartao') && cards.length > 1 && source !== 'conta' && (
        <label className="field" style={{ flex: '0 1 170px' }}>
          <span>Cartão</span>
          <select
            id="filtro-cartao"
            className="select"
            value={card}
            onChange={(e) => setCard(e.target.value)}
          >
            <option value="">Todos os cartões</option>
            {cards.map((c) => (
              <option key={c} value={c}>
                Final {c}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
