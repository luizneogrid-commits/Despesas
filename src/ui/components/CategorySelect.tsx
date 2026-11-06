import { ALL_GROUPS, GROUP_LABELS, scopeOf } from '../../domain/categories';
import type { Category, CategoryId, CategoryScope } from '../../domain/types';

interface Props {
  id: string;
  value: CategoryId | '';
  categories: Category[];
  onChange: (id: CategoryId) => void;
  label: string;
  includeAll?: boolean;
  /** Lista também entradas e movimentações neutras (equivale a todos os escopos). */
  includeHidden?: boolean;
  /** Escopos listados (padrão: só gasto). */
  scopes?: CategoryScope[];
  className?: string;
  /** Opção vazia inicial (ex.: "Escolha a categoria"). */
  placeholder?: string;
}

const ALL_SCOPES: CategoryScope[] = ['gasto', 'receita', 'neutro'];

/** Seletor nativo (acessível e ótimo no celular), agrupado por perfil. */
export function CategorySelect({
  id,
  value,
  categories,
  onChange,
  label,
  includeAll,
  includeHidden,
  scopes,
  className,
  placeholder,
}: Props) {
  const allowed = includeHidden ? ALL_SCOPES : (scopes ?? ['gasto']);
  const visible = categories.filter((c) => allowed.includes(scopeOf(c)));
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
      {ALL_GROUPS.map((g) => {
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
