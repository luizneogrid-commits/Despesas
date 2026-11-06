import type { GroupStat } from '../../analytics/aggregate';
import { GROUP_HINTS, GROUP_LABELS } from '../../domain/categories';
import { formatBRL, formatPercent } from '../../domain/money';
import { useElementWidth } from '../useElementWidth';
import { GROUP_COLORS } from './groupColors';

/** Barra segmentada alta: como o gasto se divide entre essenciais, estilo de vida e crédito. */
export function GroupBar({ groups }: { groups: GroupStat[] }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const parts = groups.filter((g) => g.totalCents > 0);
  return (
    <div className="groupbar">
      <div
        className="groupbar__track"
        ref={ref}
        role="img"
        aria-label={parts
          .map((g) => `${GROUP_LABELS[g.group]} ${formatPercent(g.share)}`)
          .join(', ')}
      >
        {parts.map((g) => {
          const label = formatPercent(g.share);
          const fits = g.share * width >= label.length * 8 + 16;
          return (
            <span
              key={g.group}
              className="groupbar__seg"
              style={{ flex: `${g.share} 1 0`, background: GROUP_COLORS[g.group] }}
              title={`${GROUP_LABELS[g.group]}: ${formatBRL(g.totalCents)} (${label})`}
            >
              {fits ? label : ''}
            </span>
          );
        })}
      </div>
      <ul className="plain groupbar__legend">
        {groups.map((g) => (
          <li key={g.group} title={GROUP_HINTS[g.group]}>
            <span
              className="swatch"
              style={{ background: GROUP_COLORS[g.group] }}
              aria-hidden="true"
            />
            <span>
              {GROUP_LABELS[g.group]} <strong className="num">{formatBRL(g.totalCents)}</strong>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
