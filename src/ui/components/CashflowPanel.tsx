import { useState } from 'react';
import { formatMonthAxis, formatYearMonth } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import { PairedColumns } from '../charts/PairedColumns';
import type { DashboardData } from '../useDashboard';

/** Entradas × saídas da conta corrente, mês a mês. */
export function CashflowPanel({ data }: { data: DashboardData }) {
  const [asTable, setAsTable] = useState(false);
  const t = data.cashflowTotals;
  const outgoing = t.spendCents + t.cardPaymentCents;
  const left = t.inCents - outgoing;
  return (
    <section className="panel" aria-labelledby="fluxo-titulo">
      <div className="panel__head">
        <div>
          <h2 id="fluxo-titulo">Entradas e saídas da conta</h2>
          <p>
            Pagamento da fatura aparece à parte: as compras do cartão já estão no perfil de gasto
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
        >
          {asTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>
      <div className="tiles" style={{ marginBottom: 16 }}>
        <div className="tile">
          <span className="tile__label">Entradas</span>
          <span className="tile__value">{formatBRL(t.inCents)}</span>
          <span className="tile__sub">salário, Pix recebidos e rendimentos</span>
        </div>
        <div className="tile">
          <span className="tile__label">Saídas</span>
          <span className="tile__value">{formatBRL(outgoing)}</span>
          <span className="tile__sub">
            {formatBRL(t.spendCents)} em gastos + {formatBRL(t.cardPaymentCents)} de fatura
          </span>
        </div>
        <div className="tile">
          <span className="tile__label">{left >= 0 ? 'Sobrou' : 'Faltou'}</span>
          <span className="tile__value" style={{ color: left >= 0 ? 'var(--good)' : 'var(--bad)' }}>
            {formatBRL(Math.abs(left))}
          </span>
          <span className="tile__sub">
            {t.savedCents !== 0
              ? `${formatBRL(Math.abs(t.savedCents))} ${t.savedCents > 0 ? 'foram para aplicações' : 'vieram de resgates'}`
              : 'entradas − saídas'}
          </span>
        </div>
      </div>
      {asTable ? (
        <div className="table-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="right">Entradas</th>
                <th className="right">Gastos</th>
                <th className="right">Fatura</th>
                <th className="right">Aplicações</th>
                <th className="right">Saldo do mês</th>
              </tr>
            </thead>
            <tbody>
              {data.cashflow.map((m) => (
                <tr key={m.month}>
                  <td>{formatYearMonth(m.month, 'long')}</td>
                  <td className="right num">{formatBRL(m.inCents)}</td>
                  <td className="right num">{formatBRL(m.spendCents)}</td>
                  <td className="right num">{formatBRL(m.cardPaymentCents)}</td>
                  <td className="right num">{formatBRL(m.savedCents)}</td>
                  <td className="right num">{formatBRL(m.netCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <PairedColumns
          ariaLabel="Entradas e saídas da conta por mês"
          labels={['Entradas', 'Saídas (gastos + fatura)']}
          data={data.cashflow.map((m) => ({
            key: m.month,
            label: formatMonthAxis(m.month),
            longLabel: formatYearMonth(m.month, 'long'),
            a: m.inCents,
            b: m.spendCents + m.cardPaymentCents,
          }))}
        />
      )}
    </section>
  );
}
