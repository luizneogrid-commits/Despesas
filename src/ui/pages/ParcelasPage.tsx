import { CalendarClock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { projectCommitments } from '../../analytics/installments';
import {
  addMonths,
  formatDateBR,
  formatMonthAxis,
  formatYearMonth,
  monthDiff,
} from '../../domain/dates';
import { formatBRL, formatPercent } from '../../domain/money';
import { ColumnChart } from '../charts/ColumnChart';
import { CategoryIcon } from '../components/CategoryIcon';
import { useDashboard } from '../useDashboard';
import { useUiStore } from '../uiStore';

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function ParcelasPage() {
  const data = useDashboard();
  const { outlook, subscriptions, categories, cards } = data;
  const card = useUiStore((s) => s.card);
  const setCard = useUiStore((s) => s.setCard);
  const [withSubs, setWithSubs] = useState(false);
  const [asTable, setAsTable] = useState(false);

  const projection = useMemo(
    () => projectCommitments(outlook, subscriptions, { includeSubscriptions: withSubs }),
    [outlook, subscriptions, withSubs],
  );
  const activeSubs = useMemo(() => {
    const base = outlook.baseMonth;
    return base ? subscriptions.filter((s) => s.lastMonth >= addMonths(base, -1)) : [];
  }, [subscriptions, outlook.baseMonth]);

  const next = projection[0];
  const firstSix = projection.slice(0, 6);
  const avgSix = firstSix.length
    ? Math.round(firstSix.reduce((a, m) => a + m.totalCents, 0) / firstSix.length)
    : 0;
  const monthsToFree =
    outlook.baseMonth && outlook.endsMonth ? monthDiff(outlook.baseMonth, outlook.endsMonth) : 0;
  // Mês em que a fatura já vem sem a parcela (o seguinte ao da última).
  const relief = outlook.schedule
    .filter((m) => m.ending.length > 0)
    .map((m) => ({
      lastMonth: m.month,
      month: addMonths(m.month, 1),
      names: m.ending,
      cents: outlook.plans
        .filter((p) => p.endsMonth === m.month)
        .reduce((a, p) => a + p.installmentCents, 0),
    }));

  const chartData = projection.map((m) => ({
    key: m.month,
    label: formatMonthAxis(m.month),
    longLabel: `Fatura de ${formatYearMonth(m.month, 'long')}`,
    value: m.totalCents,
    focus: m.installmentsCents,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Parcelas e compromissos</h1>
          <p>
            Quanto das próximas faturas já está comprometido com compras parceladas. A projeção
            parte da fatura mais recente de cada cartão: uma compra em 3/10 ainda tem 7 parcelas a
            cair.
          </p>
        </div>
        {cards.length > 1 && (
          <label className="field" style={{ flex: '0 1 200px' }}>
            <span>Cartão</span>
            <select
              id="parcelas-cartao"
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

      {outlook.plans.length === 0 ? (
        <section className="panel empty">
          <CalendarClock size={28} aria-hidden="true" color="var(--ink-3)" />
          <h2>Nenhuma compra parcelada em andamento</h2>
          <p>
            Quando a fatura mais recente trouxer compras como "PARC 03/10", a projeção das parcelas
            futuras aparece aqui.
          </p>
        </section>
      ) : (
        <>
          <section className="panel summary" aria-labelledby="comprometido-titulo">
            <div className="hero">
              <span className="eyebrow" id="comprometido-titulo">
                Já comprometido em parcelas
              </span>
              <span className="hero__value">{formatBRL(outlook.totalRemainingCents)}</span>
              <span className="hero__sub">
                {plural(outlook.plans.length, 'compra parcelada', 'compras parceladas')} em
                andamento
                {outlook.endsMonth && (
                  <>
                    {' '}
                    · última parcela em {formatYearMonth(outlook.endsMonth)} (
                    {plural(monthsToFree, 'mês', 'meses')})
                  </>
                )}
              </span>
              {outlook.baseMonth && (
                <span className="hero__sub">
                  A partir da fatura de {formatYearMonth(outlook.baseMonth, 'long')}
                </span>
              )}
            </div>
            <div className="tiles">
              <div className="tile">
                <span className="tile__label">
                  Próxima fatura{next ? ` (${formatYearMonth(next.month)})` : ''} já começa com
                </span>
                <span className="tile__value">{formatBRL(next?.totalCents ?? 0)}</span>
                <span className="tile__sub">
                  {withSubs && next
                    ? `${formatBRL(next.installmentsCents)} em parcelas + ${formatBRL(next.subscriptionsCents)} em assinaturas`
                    : 'só em parcelas'}
                </span>
              </div>
              <div className="tile">
                <span className="tile__label">Média dos próximos 6 meses</span>
                <span className="tile__value">{formatBRL(avgSix)}</span>
                <span className="tile__sub">por fatura, já comprometidos</span>
              </div>
              <div className="tile">
                <span className="tile__label">Valor total das compras</span>
                <span className="tile__value">{formatBRL(outlook.purchaseTotalCents)}</span>
                <span className="tile__sub">
                  {formatBRL(outlook.paidCents)} pagos (
                  {formatPercent(
                    outlook.purchaseTotalCents ? outlook.paidCents / outlook.purchaseTotalCents : 0,
                  )}
                  )
                </span>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="projecao-titulo">
            <div className="panel__head">
              <div>
                <h2 id="projecao-titulo">Projeção mês a mês</h2>
                <p>Valor que já vem garantido em cada fatura futura</p>
              </div>
              <div className="row-actions">
                <label className="check">
                  <input
                    id="incluir-assinaturas"
                    type="checkbox"
                    checked={withSubs}
                    onChange={(e) => setWithSubs(e.target.checked)}
                  />
                  Somar assinaturas ativas (
                  {formatBRL(activeSubs.reduce((a, s) => a + s.monthlyCents, 0))}/mês)
                </label>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  aria-pressed={asTable}
                  onClick={() => setAsTable((v) => !v)}
                >
                  {asTable ? 'Ver gráfico' : 'Ver tabela'}
                </button>
              </div>
            </div>
            {withSubs && !asTable && (
              <div className="legend" aria-hidden="true">
                <span>
                  <span className="swatch" style={{ background: 'var(--bar)' }} /> Parcelas
                </span>
                <span>
                  <span className="swatch" style={{ background: 'var(--bar-muted)' }} /> Assinaturas
                </span>
              </div>
            )}
            {asTable ? (
              <div className="table-wrap">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Fatura</th>
                      <th className="right">Parcelas</th>
                      <th className="right">Qtde.</th>
                      {withSubs && <th className="right">Assinaturas</th>}
                      <th className="right">Comprometido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.map((m) => (
                      <tr key={m.month}>
                        <td>{formatYearMonth(m.month, 'long')}</td>
                        <td className="right num">{formatBRL(m.installmentsCents)}</td>
                        <td className="right num">
                          {outlook.schedule.find((s) => s.month === m.month)?.count ?? 0}
                        </td>
                        {withSubs && (
                          <td className="right num">{formatBRL(m.subscriptionsCents)}</td>
                        )}
                        <td className="right num">{formatBRL(m.totalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ColumnChart
                data={chartData}
                height={240}
                {...(withSubs ? { focusLabel: 'em parcelas' } : {})}
                totalLabel={withSubs ? 'comprometido no total' : 'em parcelas'}
                ariaLabel="Valor comprometido em cada fatura futura"
              />
            )}
          </section>

          <div className="grid-2">
            <section className="panel" aria-labelledby="compras-parceladas-titulo">
              <div className="panel__head">
                <h2 id="compras-parceladas-titulo">Compras parceladas em andamento</h2>
                <p>Ordenadas pelo que falta pagar</p>
              </div>
              <div className="table-wrap only-wide">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Compra</th>
                      <th>Andamento</th>
                      <th className="right">Parcela</th>
                      <th className="right">Falta</th>
                      <th className="right">Termina</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outlook.plans.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span className="name-cell">
                            <CategoryIcon icon={categories.get(p.categoryId)?.icon} size="sm" />
                            <span>
                              {p.name}
                              <span
                                className="muted"
                                style={{ display: 'block', fontSize: 'var(--text-xs)' }}
                              >
                                compra em {formatDateBR(p.purchaseDate)} ·{' '}
                                <span className="nowrap">total {formatBRL(p.purchaseCents)}</span>
                                {p.cardLast4 ? ` · final ${p.cardLast4}` : ''}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className="progress-cell">
                            <span
                              className="meter"
                              role="meter"
                              aria-valuemin={0}
                              aria-valuemax={p.total}
                              aria-valuenow={p.current}
                              aria-label={`${p.current} de ${p.total} parcelas pagas`}
                            >
                              <span
                                className="meter__fill"
                                style={{ width: `${(p.current / p.total) * 100}%` }}
                              />
                            </span>
                            <small>
                              {p.current} de {p.total} · faltam {p.remaining}
                            </small>
                          </span>
                        </td>
                        <td className="right num">{formatBRL(p.installmentCents)}</td>
                        <td className="right num">{formatBRL(p.remainingCents)}</td>
                        <td className="right">{formatYearMonth(p.endsMonth)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>
                        <strong style={{ fontWeight: 600 }}>Total comprometido</strong>
                      </td>
                      <td className="right num">
                        <strong style={{ fontWeight: 600 }}>
                          {formatBRL(outlook.totalRemainingCents)}
                        </strong>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <ul className="plain plan-cards only-narrow">
                {outlook.plans.map((p) => (
                  <li key={p.id} className="plan-card">
                    <div className="plan-card__head">
                      <CategoryIcon icon={categories.get(p.categoryId)?.icon} size="sm" />
                      <div style={{ minWidth: 0 }}>
                        <strong>{p.name}</strong>
                        <small>
                          compra em {formatDateBR(p.purchaseDate)} · total{' '}
                          {formatBRL(p.purchaseCents)}
                        </small>
                      </div>
                    </div>
                    <span className="meter" aria-hidden="true">
                      <span
                        className="meter__fill"
                        style={{ width: `${(p.current / p.total) * 100}%` }}
                      />
                    </span>
                    <dl className="plan-card__facts">
                      <div>
                        <dt>Pagas</dt>
                        <dd>
                          {p.current} de {p.total}
                        </dd>
                      </div>
                      <div>
                        <dt>Parcela</dt>
                        <dd className="num">{formatBRL(p.installmentCents)}</dd>
                      </div>
                      <div>
                        <dt>Falta</dt>
                        <dd className="num">{formatBRL(p.remainingCents)}</dd>
                      </div>
                      <div>
                        <dt>Termina</dt>
                        <dd>{formatYearMonth(p.endsMonth)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
                <li className="plan-card plan-card--total">
                  <strong>Total comprometido</strong>
                  <strong className="num">{formatBRL(outlook.totalRemainingCents)}</strong>
                </li>
              </ul>
            </section>
            <section className="panel" aria-labelledby="alivio-titulo">
              <div className="panel__head">
                <h2 id="alivio-titulo">Quando a fatura fica mais leve</h2>
                <p>A partir de quando cada compra deixa de pesar</p>
              </div>
              <ul className="plain relief">
                {relief.map((r) => (
                  <li key={r.month}>
                    <strong style={{ fontWeight: 600 }}>{formatYearMonth(r.month)}</strong>
                    <span>
                      {r.names.length === 1 ? 'acaba' : 'acabam'} {r.names.join(', ')}
                      <span
                        className="muted"
                        style={{ display: 'block', fontSize: 'var(--text-xs)' }}
                      >
                        última parcela em {formatYearMonth(r.lastMonth)}
                      </span>
                    </span>
                    <span className="num">−{formatBRL(r.cents)}/mês</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}
