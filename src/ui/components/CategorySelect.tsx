import { GROUP_LABELS, GROUP_ORDER } from '../../domain/categories';
import type { Category, CategoryId } from '../../domain/types';

interface Props {
  id: string;
  value: CategoryId | '';
  categories: Category[];
  onChange: (id: CategoryId) => void;
  label: string;
  includeAll?: boolean;
  includeHidden?: boolean;
  className?: string;
  /** Opção vazia inicial (ex.: "Escolha a categoria"). */
  placeholder?: string;
}

/** Seletor nativo (acessível e ótimo no celular), agrupado por perfil de gasto. */
export function CategorySelect({
  id,
  value,
  categories,
  onChange,
  label,
  includeAll,
  includeHidden,
  className,
  placeholder,
}: Props) {
  const visible = categories.filter((c) => includeHidden || !c.hidden);
  return (
    <select
      id={id}
      className={`select ${className ?? ''}`}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      {includeAll && <option value="">Todas as categorias</option>}
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {GROUP_ORDER.map((g) => {
        const items = visible.filter((c) => c.group === g);
        if (items.length === 0) return null;
        return (
          <optgroup key={g} label={GROUP_LABELS[g]}>
            {items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
