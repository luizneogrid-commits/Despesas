import { useState } from 'react';
import { formatBRL } from '../../domain/money';
import { useElementWidth } from '../useElementWidth';
import { axisBRL } from './format';

export interface PairDatum {
  key: string;
  label: string;
  longLabel: string;
  a: number;
  b: number;
}

interface Props {
  data: PairDatum[];
  labels: [string, string];
  colors?: [string, string];
  height?: number;
  ariaLabel: string;
}

function columnPath(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** Duas séries lado a lado por mês (ex.: entradas × saídas), eixo único. */
export function PairedColumns({
  data,
  labels,
  colors = ['var(--series-1)', 'var(--series-2)'],
  height = 220,
  ariaLabel,
}: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const margin = { top: 16, right: 8, bottom: 26, left: 64 };
  const plotW = Math.max(40, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;
  const maxV = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const exp = Math.pow(10, Math.floor(Math.log10(maxV)));
  const f = maxV / exp;
  const max = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const band = plotW / Math.max(1, data.length);
  const barW = Math.max(4, Math.min(20, (band - 10) / 2));
  const y = (v: number) => margin.top + plotH - (Math.max(0, v) / max) * plotH;
  const act = active !== null ? data[active] : undefined;

  return (
    <div className="chart" ref={ref}>
      <div className="legend" aria-hidden="true">
        <span>
          <span className="swatch" style={{ background: colors[0] }} /> {labels[0]}
        </span>
        <span>
          <span className="swatch" style={{ background: colors[1] }} /> {labels[1]}
        </span>
      </div>
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
              <path
                d={columnPath(cx - barW - 1, y(d.a), barW, margin.top + plotH - y(d.a), 4)}
                fill={colors[0]}
              />
              <path
                d={columnPath(cx + 1, y(d.b), barW, margin.top + plotH - y(d.b), 4)}
                fill={colors[1]}
              />
              <text x={cx} y={height - 8} textAnchor="middle">
                {d.label}
              </text>
              <rect
                className="hit"
                x={margin.left + band * i}
                y={margin.top}
                width={band}
                height={plotH + margin.bottom}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${d.longLabel}: ${labels[0]} ${formatBRL(d.a)}, ${labels[1]} ${formatBRL(d.b)}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          );
        })}
      </svg>
      {act && active !== null && (
        <div
          className="tooltip"
          style={{
            left: Math.min(Math.max(margin.left + band * active + band / 2, 80), width - 80),
            top: y(Math.max(act.a, act.b)) + 28,
          }}
        >
          <div>{act.longLabel}</div>
          <div className="tooltip__row">
            <span className="tooltip__key" style={{ background: colors[0] }} />
            <strong>{formatBRL(act.a)}</strong>
            <span>{labels[0]}</span>
          </div>
          <div className="tooltip__row">
            <span className="tooltip__key" style={{ background: colors[1] }} />
            <strong>{formatBRL(act.b)}</strong>
            <span>{labels[1]}</span>
          </div>
        </div>
      )}
    </div>
  );
}
