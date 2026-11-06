import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { CategoryStat } from '../../analytics/aggregate';
import { formatBRL, formatPercent } from '../../domain/money';
import type { Category, CategoryId } from '../../domain/types';
import { CategoryIcon } from '../components/CategoryIcon';

interface Props {
  stats: CategoryStat[];
  categories: Map<CategoryId, Category>;
  focus: CategoryId | null;
  onFocus: (id: CategoryId | null) => void;
  showDelta: boolean;
}

export function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) return current > 0 ? <span className="chip">novo</span> : null;
  const ratio = (current - previous) / previous;
  if (Math.abs(ratio) < 0.05) return <span className="chip">estável</span>;
  const up = ratio > 0;
  return (
    <span
      className={`delta ${up ? 'delta--up' : 'delta--down'}`}
      title="Em relação ao período anterior"
    >
      {up ? (
        <ArrowUpRight size={14} aria-hidden="true" />
      ) : (
        <ArrowDownRight size={14} aria-hidden="true" />
      )}
      <span>
        {up ? '+' : '−'}
        {formatPercent(Math.abs(ratio))}
        <span className="visually-hidden"> {up ? 'a mais' : 'a menos'} que o período anterior</span>
      </span>
    </span>
  );
}

/** Barras horizontais ranqueadas, uma cor: comparar categorias com precisão. */
export function CategoryBars({ stats, categories, focus, onFocus, showDelta }: Props) {
  const positive = stats.filter((s) => s.totalCents > 0);
  const max = Math.max(...positive.map((s) => s.totalCents), 1);
  return (
    <div className={`catbars${focus ? ' catbars--focus' : ''}`}>
      {positive.map((s) => {
        const cat = categories.get(s.categoryId);
        const pressed = focus === s.categoryId;
        return (
          <button
            key={s.categoryId}
            type="button"
            className="catbar"
            aria-pressed={pressed}
            onClick={() => onFocus(pressed ? null : s.categoryId)}
          >
            <CategoryIcon icon={cat?.icon} />
            <span style={{ minWidth: 0 }}>
              <span className="catbar__name" style={{ display: 'block' }}>
                {cat?.name ?? s.categoryId}
              </span>
              <span className="catbar__meta">
                {s.count} {s.count === 1 ? 'lançamento' : 'lançamentos'} ·{' '}
                <span className="nowrap">média {formatBRL(s.avgTicketCents)}</span>
                {showDelta && s.previousCents !== undefined && (
                  <>
                    {' · '}
                    <Delta current={s.totalCents} previous={s.previousCents} />
                  </>
                )}
              </span>
            </span>
            <span className="catbar__value num">
              {formatBRL(s.totalCents)}
              <span className="catbar__share">{formatPercent(s.share, s.share < 0.1 ? 1 : 0)}</span>
            </span>
            <span className="catbar__track" aria-hidden="true">
              <span
                className="catbar__fill"
                style={{ width: `${(s.totalCents / max) * 100}%`, display: 'block' }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
