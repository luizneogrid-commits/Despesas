import { create } from 'zustand';
import type { PeriodKey } from '../analytics/aggregate';
import type { CategoryId, TxKind } from '../domain/types';

export interface TxFilter {
  query: string;
  categoryId: CategoryId | '';
  month: string;
  kind: TxKind | '';
  onlyUnclassified: boolean;
}

export const EMPTY_TX_FILTER: TxFilter = {
  query: '',
  categoryId: '',
  month: '',
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
  focus: CategoryId | null;
  txFilter: TxFilter;
  toasts: Toast[];
  setPeriod: (p: PeriodKey) => void;
  setCard: (c: string) => void;
  setFocus: (c: CategoryId | null) => void;
  setTxFilter: (patch: Partial<TxFilter>) => void;
  toast: (t: Omit<Toast, 'id'>, ms?: number) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>()((set, get) => ({
  period: 'all',
  card: '',
  focus: null,
  txFilter: EMPTY_TX_FILTER,
  toasts: [],
  setPeriod: (period) => set({ period }),
  setCard: (card) => set({ card }),
  setFocus: (focus) => set({ focus }),
  setTxFilter: (patch) => set({ txFilter: { ...get().txFilter, ...patch } }),
  toast: (t, ms = 6000) => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    window.setTimeout(() => get().dismissToast(id), ms);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));
