import { GROUP_LABELS } from '../domain/categories';
import { formatDateBR } from '../domain/dates';
import type { Category, CategoryId, PersistedState, Transaction, TxKind } from '../domain/types';

const KIND_LABEL: Record<TxKind, string> = {
  compra: 'Compra',
  estorno: 'Estorno/crédito',
  pagamento: 'Pagamento',
  encargo: 'Encargo',
};

function csvCell(value: string): string {
  // Neutraliza fórmulas (CSV injection) e escapa aspas.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function decimalBR(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** CSV no padrão do Excel em português: ";" como separador, vírgula decimal, BOM UTF-8. */
export function transactionsToCSV(
  txs: Transaction[],
  categories: Map<CategoryId, Category>,
): string {
  const header = [
    'Data',
    'Descrição',
    'Estabelecimento',
    'Categoria',
    'Grupo',
    'Tipo',
    'Valor (R$)',
    'Parcela',
    'Cartão',
    'Internacional',
    'Mês da fatura',
    'Fora da análise',
  ];
  const rows = [...txs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      const cat = categories.get(t.categoryId);
      return [
        formatDateBR(t.date),
        t.description,
        t.merchantName,
        cat?.name ?? t.categoryId,
        cat ? GROUP_LABELS[cat.group] : '',
        KIND_LABEL[t.kind],
        decimalBR(t.amountCents),
        t.installment ? `${t.installment.current}/${t.installment.total}` : '',
        t.cardLast4 ? `final ${t.cardLast4}` : '',
        t.international ? 'sim' : 'não',
        t.referenceMonth,
        t.excluded ? 'sim' : 'não',
      ].map((v) => csvCell(String(v)));
    });
  return '\uFEFF' + [header.map(csvCell), ...rows].map((r) => r.join(';')).join('\r\n');
}

export function backupJSON(state: PersistedState): string {
  return JSON.stringify(
    { app: 'raio-x-fatura', exportedAt: new Date().toISOString(), ...state },
    null,
    2,
  );
}
