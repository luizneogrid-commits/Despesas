import { create } from 'zustand';
import type { PeriodKey } from '../analytics/aggregate';
import type { CategoryId, TxKind } from '../domain/types';
import type { Route } from './route';

export type SourceFilter = '' | 'cartao' | 'conta';

export interface TxFilter {
  query: string;
  categoryId: CategoryId | '';
  kind: TxKind | '';
  onlyUnclassified: boolean;
}

export const EMPTY_TX_FILTER: TxFilter = {
  query: '',
  categoryId: '',
  kind: '',
  onlyUnclassified: false,
};

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  tone?: 'neutro' | 'erro';
}

interface UiState {
  period: PeriodKey;
  card: string;
  /** Origem dos dados: tudo, só faturas de cartão ou só extratos de conta. */
  source: SourceFilter;
  /** Tela de onde o usuário veio ao abrir Lançamentos já filtrado (para "Voltar"). */
  cameFrom: Route | null;
  focus: CategoryId | null;
  txFilter: TxFilter;
  toasts: Toast[];
  setPeriod: (p: PeriodKey) => void;
  setCard: (c: string) => void;
  setSource: (s: SourceFilter) => void;
  setOrigin: (r: Route | null) => void;
  setFocus: (c: CategoryId | null) => void;
  setTxFilter: (patch: Partial<TxFilter>) => void;
  toast: (t: Omit<Toast, 'id'>, ms?: number) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>()((set, get) => ({
  period: 'all',
  card: '',
  source: '',
  cameFrom: null,
  focus: null,
  txFilter: EMPTY_TX_FILTER,
  toasts: [],
  setPeriod: (period) => set({ period }),
  setCard: (card) => set({ card }),
  setSource: (source) => set({ source }),
  setOrigin: (cameFrom) => set({ cameFrom }),
  setFocus: (focus) => set({ focus }),
  setTxFilter: (patch) => set({ txFilter: { ...get().txFilter, ...patch } }),
  toast: (t, ms = 6000) => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    window.setTimeout(() => get().dismissToast(id), ms);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));
