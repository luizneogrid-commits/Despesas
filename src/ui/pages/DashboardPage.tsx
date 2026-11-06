import { ArrowRight, Upload, X } from 'lucide-react';
import { useState } from 'react';
import type { PeriodKey } from '../../analytics/aggregate';
import { formatMonthAxis, formatYearMonth } from '../../domain/dates';
import { formatBRL, formatInt, formatPercent } from '../../domain/money';
import type { CategoryId } from '../../domain/types';
import { CategoryBars, Delta } from '../charts/CategoryBars';
import { ColumnChart } from '../charts/ColumnChart';
import { GroupBar } from '../charts/GroupBar';
import { CategoryIcon } from '../components/CategoryIcon';
import { navigate } from '../route';
import { useDashboard, type DashboardData } from '../useDashboard';
import { EMPTY_TX_FILTER, useUiStore } from '../uiStore';

function openTransactions(patch: { categoryId?: CategoryId; month?: string }) {
  useUiStore.getState().setTxFilter({ ...EMPTY_TX_FILTER, ...patch });
  navigate('lancamentos');
}

function Filters({ data }: { data: DashboardData }) {
  const period = useUiStore((s) => s.period);
  const setPeriod = useUiStore((s) => s.setPeriod);
  const card = useUiStore((s) => s.card);
  const setCard = useUiStore((s) => s.setCard);
  const n = data.available.length;
  return (
    <div className="toolbar" role="group" aria-label="Filtros da visão geral">
      <label className="field" style={{ flex: '0 1 240px' }}>
        <span>Período</span>
        <select
          id="filtro-periodo"
          className="select"
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodKey)}
        >
          <option value="all">Todas as faturas ({n})</option>
          {n > 3 && <option value="last3">Últimas 3 faturas</option>}
          {n > 6 && <option value="last6">Últimas 6 faturas</option>}
          {n > 12 && <option value="last12">Últimas 12 faturas</option>}
          {[...data.available].reverse().map((m) => (
            <option key={m} value={`m:${m}`}>
              Fatura de {formatYearMonth(m, 'long')}
            </option>
          ))}
        </select>
      </label>
      {data.cards.length > 1 && (
        <label className="field" style={{ flex: '0 1 200px' }}>
          <span>Cartão</span>
          <select
            id="filtro-cartao"
            className="select"
            value={card}
            onChange={(e) => setCard(e.target.value)}
          >
            <option value="">Todos os cartões</option>
            {data.cards.map((c) => (
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

/** Mini-série das faturas: o período selecionado aparece no acento. */
function Spark({ data }: { data: DashboardData }) {
  const series = data.series.slice(-12);
  const max = Math.max(...series.map((m) => m.totalCents), 1);
  const selected = new Set(data.months);
  const first = series[0]?.month;
  const last = series.at(-1)?.month;
  return (
    <div className="spark" aria-hidden="true">
      <div className="spark__bars">
        {series.map((m) => (
          <span
            key={m.month}
            className={`spark__bar${selected.has(m.month) ? ' spark__bar--on' : ''}`}
            style={{ height: `${Math.max(4, (Math.max(0, m.totalCents) / max) * 100)}%` }}
            title={`${formatYearMonth(m.month)}: ${formatBRL(m.totalCents)}`}
          />
        ))}
      </div>
      <span className="spark__caption">
        Faturas de {first ? formatYearMonth(first) : ''} a {last ? formatYearMonth(last) : ''}
      </span>
    </div>
  );
}

function Summary({ data }: { data: DashboardData }) {
  const { summary, previousSummary, subscriptions, outlook, months } = data;
  const monthly = subscriptions.reduce((a, s) => a + s.monthlyCents, 0);
  const next = outlook.schedule[0];
  const periodLabel =
    months.length === 1
      ? `Fatura de ${formatYearMonth(months[0] ?? '', 'long')}`
      : `${months.length} faturas`;
  return (
    <section className="panel summary" aria-labelledby="resumo-titulo">
      <div className="hero">
        <span className="eyebrow" id="resumo-titulo">
          Gasto no período
        </span>
        <span className="hero__value">{formatBRL(summary.totalCents)}</span>
        <span className="hero__sub">
          {periodLabel}
          {months.length > 1 && <> · média de {formatBRL(summary.monthlyAvgCents)} por mês</>}
        </span>
        {data.series.length > 1 && <Spark data={data} />}
        {previousSummary && previousSummary.totalCents > 0 && (
          <span className="hero__sub">
            <Delta current={summary.totalCents} previous={previousSummary.totalCents} /> vs. período
            anterior ({formatBRL(previousSummary.totalCents)})
          </span>
        )}
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <div className="tiles">
          <div className="tile">
            <span className="tile__label">Compras</span>
            <span className="tile__value">{formatInt(summary.purchaseCount)}</span>
            <span className="tile__sub">ticket médio {formatBRL(summary.avgTicketCents)}</span>
          </div>
          <div className="tile">
            <span className="tile__label">Assinaturas</span>
            <span className="tile__value">{formatBRL(monthly)}</span>
            <span className="tile__sub">
              por mês · {subscriptions.length} {subscriptions.length === 1 ? 'serviço' : 'serviços'}
            </span>
          </div>
          <div className="tile">
            <span className="tile__label">Parcelas a vencer</span>
            <span className="tile__value">{formatBRL(outlook.totalRemainingCents)}</span>
            <span className="tile__sub">
              {next
                ? `${formatBRL(next.totalCents)} em ${formatYearMonth(next.month)}`
                : 'nenhuma parcela em aberto'}
            </span>
          </div>
        </div>
        <div>
          <div className="panel__head" style={{ marginBottom: 10 }}>
            <h2 style={{ fontSize: 'var(--text-md)' }}>Seu perfil de gasto</h2>
            <p>Essenciais × estilo de vida × custo do crédito</p>
          </div>
          <GroupBar groups={data.groups} />
        </div>
      </div>
    </section>
  );
}

function CategoryDetail({ data, id }: { data: DashboardData; id: CategoryId }) {
  const setFocus = useUiStore((s) => s.setFocus);
  const cat = data.categories.get(id);
  const stat = data.stats.find((s) => s.categoryId === id);
  const txs = data.spend.filter((t) => t.categoryId === id);
  const merchants = new Map<string, { total: number; count: number }>();
  for (const t of txs) {
    const m = merchants.get(t.merchantName) ?? { total: 0, count: 0 };
    m.total += t.amountCents;
    m.count += t.kind === 'estorno' ? 0 : 1;
    merchants.set(t.merchantName, m);
  }
  const top = [...merchants.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  return (
    <section className="panel" aria-labelledby="detalhe-titulo">
      <div className="panel__head" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
          <CategoryIcon icon={cat?.icon} />
          <h2 id="detalhe-titulo">{cat?.name}</h2>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Fechar detalhe da categoria"
          onClick={() => setFocus(null)}
        >
          <X size={18} />
        </button>
      </div>
      {stat ? (
        <div className="stack" style={{ gap: 16 }}>
          <dl className="facts">
            <div className="fact">
              <dt>Total</dt>
              <dd className="num">{formatBRL(stat.totalCents)}</dd>
            </div>
            <div className="fact">
              <dt>Fatia do gasto</dt>
              <dd>{formatPercent(stat.share, 1)}</dd>
            </div>
            <div className="fact">
              <dt>Lançamentos</dt>
              <dd>
                {stat.count} · média {formatBRL(stat.avgTicketCents)}
              </dd>
            </div>
            {stat.previousCents !== undefined && (
              <div className="fact">
                <dt>Período anterior</dt>
                <dd>
                  <span className="num">{formatBRL(stat.previousCents)}</span>{' '}
                  <Delta current={stat.totalCents} previous={stat.previousCents} />
                </dd>
              </div>
            )}
          </dl>
          <table className="ledger">
            <thead>
              <tr>
                <th>Onde</th>
                <th className="right">Vezes</th>
                <th className="right">Total</th>
              </tr>
            </thead>
            <tbody>
              {top.map(([name, m]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="right num">{m.count}</td>
                  <td className="right num">{formatBRL(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => openTransactions({ categoryId: id })}
            >
              Ver os {txs.length} lançamentos <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <p className="muted">Sem gastos nesta categoria no período.</p>
      )}
    </section>
  );
}

function Insights({ data }: { data: DashboardData }) {
  const setFocus = useUiStore((s) => s.setFocus);
  return (
    <section className="panel" aria-labelledby="destaques-titulo">
      <div className="panel__head">
        <h2 id="destaques-titulo">Destaques</h2>
        <p>Leituras automáticas do período</p>
      </div>
      {data.insights.length === 0 ? (
        <p className="muted">Importe mais faturas para ver comparações e tendências.</p>
      ) : (
        <ul className="plain insights">
          {data.insights.slice(0, 7).map((ins) => (
            <li key={ins.id} className={`insight insight--${ins.tone}`}>
              <span className="insight__stripe" aria-hidden="true" />
              <div>
                <h3>{ins.title}</h3>
                <p>{ins.detail}</p>
                {ins.action === 'de-para' && (
                  <a className="link-btn" href="#de-para">
                    Mapear no de/para
                  </a>
                )}
                {ins.action === 'parcelas' && (
                  <a className="link-btn" href="#parcelas">
                    Ver projeção das parcelas
                  </a>
                )}
                {!ins.action && ins.categoryId && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setFocus(ins.categoryId ?? null)}
                  >
                    Ver categoria
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Evolution({ data }: { data: DashboardData }) {
  const [asTable, setAsTable] = useState(false);
  const focusName = data.focus ? data.categories.get(data.focus)?.name : undefined;
  const months = new Set(data.months);
  const chartData = data.series.map((m) => ({
    key: m.month,
    label: formatMonthAxis(m.month),
    longLabel: `Fatura de ${formatYearMonth(m.month, 'long')}`,
    value: m.totalCents,
    focus: m.focusCents,
    dimmed: !months.has(m.month),
  }));
  return (
    <section className="panel" aria-labelledby="evolucao-titulo">
      <div className="panel__head">
        <div>
          <h2 id="evolucao-titulo">Evolução por fatura</h2>
          <p>
            {focusName
              ? `Destacando ${focusName} dentro do total de cada mês`
              : 'Total gasto em cada fatura (sem pagamentos)'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
        >
          {asTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>
      {focusName && !asTable && (
        <div className="legend" aria-hidden="true">
          <span>
            <span className="swatch" style={{ background: 'var(--bar)' }} /> {focusName}
          </span>
          <span>
            <span className="swatch" style={{ background: 'var(--bar-muted)' }} /> Demais categorias
          </span>
        </div>
      )}
      {asTable ? (
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>Fatura</th>
                {focusName && <th className="right">{focusName}</th>}
                <th className="right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.series.map((m) => (
                <tr key={m.month}>
                  <td>{formatYearMonth(m.month, 'long')}</td>
                  {focusName && <td className="right num">{formatBRL(m.focusCents)}</td>}
                  <td className="right num">{formatBRL(m.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ColumnChart
          data={chartData}
          {...(focusName ? { focusLabel: focusName } : {})}
          ariaLabel={`Gasto por fatura${focusName ? `, destacando ${focusName}` : ''}`}
        />
      )}
    </section>
  );
}

function Merchants({ data }: { data: DashboardData }) {
  return (
    <section className="panel" aria-labelledby="estab-titulo">
      <div className="panel__head">
        <h2 id="estab-titulo">Onde você mais gasta</h2>
        <p>Estabelecimentos e marcas no período</p>
      </div>
      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th>Estabelecimento</th>
              <th className="right">Vezes</th>
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.merchants.map((m) => {
              const cat = data.categories.get(m.categoryId);
              return (
                <tr key={m.name}>
                  <td>
                    <span className="name-cell">
                      <CategoryIcon icon={cat?.icon} size="sm" />
                      <span title={cat?.name}>{m.name}</span>
                    </span>
                  </td>
                  <td className="right num">{m.count}</td>
                  <td className="right num">{formatBRL(m.totalCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Commitments({ data }: { data: DashboardData }) {
  const { subscriptions, outlook } = data;
  return (
    <div className="stack">
      <section className="panel" aria-labelledby="assin-titulo">
        <div className="panel__head">
          <h2 id="assin-titulo">Assinaturas e recorrentes</h2>
          <p>
            {subscriptions.length
              ? `${formatBRL(subscriptions.reduce((a, s) => a + s.monthlyCents, 0) * 12)} por ano`
              : ''}
          </p>
        </div>
        {subscriptions.length === 0 ? (
          <p className="muted">Nenhuma cobrança recorrente identificada ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="ledger">
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.name}>
                    <td>
                      <span className="name-cell">
                        <CategoryIcon icon={data.categories.get(s.categoryId)?.icon} size="sm" />
                        <span>{s.name}</span>
                      </span>
                    </td>
                    <td>
                      <span
                        className={`chip${s.confidence === 'confirmada' ? ' chip--carbon' : ''}`}
                      >
                        {s.confidence === 'confirmada' ? `${s.monthsSeen} faturas` : 'provável'}
                      </span>
                    </td>
                    <td className="right num">{formatBRL(s.monthlyCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel" aria-labelledby="parcelas-titulo">
        <div className="panel__head">
          <h2 id="parcelas-titulo">Parcelas nas próximas faturas</h2>
          {outlook.plans.length > 0 && (
            <a className="link-btn" href="#parcelas" style={{ fontSize: 'var(--text-sm)' }}>
              Ver projeção completa
            </a>
          )}
        </div>
        {outlook.plans.length === 0 ? (
          <p className="muted">Nenhuma compra parcelada em andamento.</p>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            <ColumnChart
              height={160}
              totalLabel="em parcelas"
              ariaLabel="Valor de parcelas por fatura futura"
              data={outlook.schedule.map((m) => ({
                key: m.month,
                label: formatMonthAxis(m.month),
                longLabel: formatYearMonth(m.month, 'long'),
                value: m.totalCents,
              }))}
            />
            <div className="table-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Compra</th>
                    <th className="right">Parcela</th>
                    <th className="right">Falta</th>
                  </tr>
                </thead>
                <tbody>
                  {outlook.plans.map((p) => (
                    <tr key={`${p.name}-${p.total}-${p.installmentCents}`}>
                      <td>{p.name}</td>
                      <td className="right num">
                        {p.current}/{p.total} · {formatBRL(p.installmentCents)}
                      </td>
                      <td className="right num">{formatBRL(p.remainingCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function DashboardPage() {
  const data = useDashboard();
  const setFocus = useUiStore((s) => s.setFocus);
  const [showAll, setShowAll] = useState(false);

  if (data.available.length === 0) {
    return (
      <section className="panel empty">
        <h2>Nenhuma fatura por aqui ainda</h2>
        <p>
          Importe o PDF da fatura do seu cartão para ver para onde vai o seu dinheiro: categorias,
          assinaturas, parcelas e evolução mês a mês.
        </p>
        <div className="row-actions" style={{ justifyContent: 'center' }}>
          <a className="btn btn--primary" href="#importar">
            <Upload size={16} aria-hidden="true" /> Importar fatura
          </a>
        </div>
      </section>
    );
  }

  const positive = data.stats.filter((s) => s.totalCents > 0);
  const visible = showAll ? positive : positive.slice(0, 10);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Para onde vai o seu dinheiro</h1>
          <p>Perfil de gastos do cartão por categoria, a partir das faturas importadas.</p>
        </div>
        <Filters data={data} />
      </div>
      <Summary data={data} />
      <div className="grid-2">
        <section className="panel" aria-labelledby="categorias-titulo">
          <div className="panel__head">
            <h2 id="categorias-titulo">Gastos por categoria</h2>
            <p>Toque numa categoria para destacá-la</p>
          </div>
          <CategoryBars
            stats={visible}
            categories={data.categories}
            focus={data.focus}
            onFocus={setFocus}
            showDelta={data.prevMonths.length > 0}
          />
          {positive.length > 10 && (
            <button
              type="button"
              className="link-btn"
              style={{ marginTop: 12 }}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? 'Mostrar só as 10 maiores'
                : `Mostrar todas as ${positive.length} categorias`}
            </button>
          )}
        </section>
        <div className="stack">
          {data.focus && <CategoryDetail data={data} id={data.focus} />}
          <Insights data={data} />
        </div>
      </div>
      <Evolution data={data} />
      <div className="grid-2 grid-2--even">
        <Merchants data={data} />
        <Commitments data={data} />
      </div>
    </>
  );
}
