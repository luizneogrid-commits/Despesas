import type { SpendGroup } from '../../domain/types';

/** Slots categóricos 1–3 (validados para daltonismo) + cinza para o não classificado. */
export const GROUP_COLORS: Record<SpendGroup, string> = {
  essencial: 'var(--series-1)',
  estilo: 'var(--series-2)',
  financeiro: 'var(--series-3)',
  outros: 'var(--series-4)',
  receita: 'var(--series-1)',
  neutro: 'var(--series-4)',
};
