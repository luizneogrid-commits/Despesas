import { useState, type KeyboardEvent } from 'react';
import { formatBRL } from '../../domain/money';
import { useElementWidth } from '../useElementWidth';
import { axisBRL } from './format';

export interface ColumnDatum {
  key: string;
  label: string;
  longLabel: string;
  value: number;
  /** Parte destacada (categoria em foco), desenhada na base da coluna. */
  focus?: number;
  dimmed?: boolean;
}

interface Props {
  data: ColumnDatum[];
  height?: number;
  focusLabel?: string;
  totalLabel?: string;
  ariaLabel: string;
  /** Clique/Enter numa coluna (ex.: filtrar pelo mês). */
  onSelect?: (key: string) => void;
  selectHint?: string;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function columnPath(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** Colunas com eixo único, rótulos seletivos e tooltip por coluna (mouse e teclado). */
export function ColumnChart({
  data,
  height = 220,
  focusLabel,
  totalLabel = 'Total',
  ariaLabel,
  onSelect,
  selectHint,
}: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const margin = { top: 22, right: 8, bottom: 26, left: 64 };
  const plotW = Math.max(40, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;
  const values = data.map((d) => Math.max(0, d.value));
  const max = niceMax(Math.max(...values, 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const band = plotW / Math.max(1, data.length);
  const barW = Math.max(6, Math.min(24, band * 0.56));
  const y = (v: number) => margin.top + plotH - (Math.max(0, v) / max) * plotH;

  const hasFocus = focusLabel !== undefined;
  const labelValue = (d: ColumnDatum) => (hasFocus ? (d.focus ?? 0) : d.value);
  const lastIdx = data.length - 1;
  let maxIdx = 0;
  data.forEach((d, i) => {
    if (labelValue(d) > labelValue(data[maxIdx] ?? d)) maxIdx = i;
  });
  const labelled = new Set([lastIdx, maxIdx]);
  const every = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 44)));

  const act = active !== null ? data[active] : undefined;

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line
              className={t === 0 ? 'baseline' : 'gridline'}
              x1={margin.left}
              x2={margin.left + plotW}
              y1={y(t)}
              y2={y(t)}
            />
            <text x={margin.left - 8} y={y(t) + 4} textAnchor="end">
              {axisBRL(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = margin.left + band * i + band / 2;
          const x = cx - barW / 2;
          const total = Math.max(0, d.value);
          const focusV = Math.min(total, Math.max(0, d.focus ?? 0));
          const restTop = y(total);
          const focusTop = y(focusV);
          const opacity = d.dimmed ? 0.35 : 1;
          const showLabel = labelled.has(i) && !d.dimmed && labelValue(d) > 0;
          return (
            <g key={d.key} className={active === i ? 'col-active' : undefined}>
              <rect
                className="col-bg"
                x={margin.left + band * i + 1}
                y={margin.top}
                width={band - 2}
                height={plotH}
                fill="transparent"
                rx={4}
              />
              {hasFocus ? (
                <>
                  <path
                    d={columnPath(
                      x,
                      restTop,
                      barW,
                      Math.max(0, focusTop - restTop - 2),
                      focusV > 0 ? 0 : 4,
                    )}
                    fill="var(--bar-muted)"
                    opacity={opacity}
                  />
                  <path
                    d={columnPath(x, focusTop, barW, margin.top + plotH - focusTop, 4)}
                    fill="var(--bar)"
                    opacity={opacity}
                  />
                </>
              ) : (
                <path
                  d={columnPath(x, restTop, barW, margin.top + plotH - restTop, 4)}
                  fill="var(--bar)"
                  opacity={opacity}
                />
              )}
              {showLabel && (
                <text
                  className="label-strong"
                  x={cx}
                  y={(hasFocus ? focusTop : restTop) - 6}
                  textAnchor="middle"
                >
                  {axisBRL(labelValue(d))}
                </text>
              )}
              {(i % every === 0 || i === lastIdx) && (
                <text x={cx} y={height - 8} textAnchor="middle">
                  {d.label}
                </text>
              )}
              <rect
                className="hit"
                x={margin.left + band * i}
                y={margin.top}
                width={band}
                height={plotH + margin.bottom}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${d.longLabel}: ${formatBRL(d.value)}${hasFocus ? `, ${focusLabel} ${formatBRL(d.focus ?? 0)}` : ''}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                {...(onSelect
                  ? {
                      style: { cursor: 'pointer' },
                      onClick: () => onSelect(d.key),
                      onKeyDown: (e: KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect(d.key);
                        }
                      },
                    }
                  : {})}
              />
            </g>
          );
        })}
      </svg>
      {act && active !== null && (
        <div
          className="tooltip"
          style={{
            left: Math.min(Math.max(margin.left + band * active + band / 2, 70), width - 70),
            top: y(Math.max(0, act.value)),
          }}
        >
          <div>{act.longLabel}</div>
          {hasFocus && (
            <div className="tooltip__row">
              <span className="tooltip__key" style={{ background: 'var(--bar)' }} />
              <strong>{formatBRL(act.focus ?? 0)}</strong>
              <span>{focusLabel}</span>
            </div>
          )}
          <div className="tooltip__row">
            <span
              className="tooltip__key"
              style={{ background: hasFocus ? 'var(--bar-muted)' : 'var(--bar)' }}
            />
            <strong>{formatBRL(act.value)}</strong>
            <span>{totalLabel}</span>
          </div>
          {onSelect && selectHint && <div className="tooltip__hint">{selectHint}</div>}
        </div>
      )}
    </div>
  );
}
