import { ArrowRight, Check } from 'lucide-react';
import { formatDateBR } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import type { Category, Transaction } from '../../domain/types';
import type { PendingMerchant } from '../../services/mappings';
import { useMatchCount, type MappingDraft } from '../mappingDraft';
import { CategorySelect } from './CategorySelect';

interface Props {
  pending: PendingMerchant;
  value: MappingDraft;
  categories: Category[];
  pool: Transaction[];
  onChange: (v: MappingDraft) => void;
  onSave: () => void;
  idPrefix: string;
}

/** Uma linha do de/para: o texto como veio na fatura → categoria e nome. */
export function MappingRow({
  pending,
  value,
  categories,
  pool,
  onChange,
  onSave,
  idPrefix,
}: Props) {
  const count = useMatchCount(value.pattern, pool);
  const id = `${idPrefix}-${pending.key.replace(/\W+/g, '-')}`;
  return (
    <li className="maprow">
      <div className="maprow__from">
        <span className="eyebrow">
          De
          {pending.isPix && (
            <span className="chip" style={{ marginLeft: 6 }}>
              Pix enviado: para quem?
            </span>
          )}
        </span>
        <code title={pending.examples.join('\n')}>{pending.examples[0]}</code>
        <span className="maprow__meta">
          {pending.count} {pending.count === 1 ? 'lançamento' : 'lançamentos'} ·{' '}
          {formatBRL(pending.totalCents)} · último em {formatDateBR(pending.lastDate)}
        </span>
      </div>
      <label className="field maprow__pattern">
        <span>Texto que identifica</span>
        <input
          id={`${id}-texto`}
          className="input"
          value={value.pattern}
          onChange={(e) => onChange({ ...value, pattern: e.target.value })}
          aria-describedby={`${id}-conta`}
        />
        <small id={`${id}-conta`} className="maprow__hint">
          reconhece {count} {count === 1 ? 'lançamento' : 'lançamentos'}
        </small>
      </label>
      <ArrowRight className="maprow__arrow" size={18} aria-hidden="true" />
      <label className="field maprow__to">
        <span>Para a categoria</span>
        <CategorySelect
          id={`${id}-categoria`}
          label={`Categoria para ${pending.examples[0] ?? pending.key}`}
          value={value.categoryId}
          categories={categories.filter((c) => c.id !== 'outros')}
          placeholder="Escolha…"
          onChange={(categoryId) => onChange({ ...value, categoryId })}
        />
      </label>
      <label className="field maprow__name">
        <span>Nome (opcional)</span>
        <input
          id={`${id}-nome`}
          className="input"
          value={value.displayName}
          placeholder={pending.suggestedName}
          maxLength={60}
          onChange={(e) => onChange({ ...value, displayName: e.target.value })}
        />
      </label>
      <button
        type="button"
        className="btn btn--primary maprow__save"
        disabled={!value.categoryId || !value.pattern.trim() || count === 0}
        onClick={onSave}
      >
        <Check size={16} aria-hidden="true" /> Salvar
      </button>
    </li>
  );
}
