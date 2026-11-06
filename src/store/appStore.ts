import { create } from 'zustand';
import { categorize, compileRules } from '../categorization/categorizer';
import { displayMerchant } from '../categorization/normalize';
import { buildCategoryIndex, slugify } from '../domain/categories';
import type {
  Category,
  CategoryId,
  PersistedState,
  RuleMatch,
  SpendGroup,
  Transaction,
  UserRule,
} from '../domain/types';
import { buildDemoState } from '../services/demo';
import type { ImportDraft } from '../services/importService';
import { emptyState, loadState, migrate, saveState } from '../storage/persist';
import { uid } from '../utils/id';

export type StorageStatus = 'carregando' | 'local' | 'memoria';

export interface MappingInput {
  /** Atualiza o mapeamento existente com este id. */
  id?: string;
  pattern: string;
  match: RuleMatch;
  categoryId: CategoryId;
  displayName?: string;
}

/** Aplica entradas de de/para à lista de regras: atualiza pelo id ou pelo mesmo texto+tipo. */
export function mergeMappings(
  rules: UserRule[],
  entries: MappingInput[],
): { rules: UserRule[]; ids: string[] } {
  const now = new Date().toISOString();
  const next = [...rules];
  const ids: string[] = [];
  for (const e of entries) {
    const pattern = e.pattern.trim();
    if (!pattern) continue;
    const displayName = e.displayName?.trim() || undefined;
    const idx = next.findIndex(
      (r) =>
        (e.id && r.id === e.id) ||
        (!e.id && r.match === e.match && r.pattern.toUpperCase() === pattern.toUpperCase()),
    );
    if (idx >= 0) {
      const cur = next[idx] as UserRule;
      const updated: UserRule = {
        ...cur,
        pattern,
        match: e.match,
        categoryId: e.categoryId,
        updatedAt: now,
      };
      if (displayName) updated.displayName = displayName;
      else delete updated.displayName;
      next[idx] = updated;
      ids.push(cur.id);
    } else {
      const rule: UserRule = {
        id: uid('depara'),
        pattern,
        match: e.match,
        categoryId: e.categoryId,
        createdAt: now,
      };
      if (displayName) rule.displayName = displayName;
      next.push(rule);
      ids.push(rule.id);
    }
  }
  return { rules: next, ids };
}

interface AppState extends PersistedState {
  hydrated: boolean;
  storage: StorageStatus;
  hydrate: () => Promise<void>;
  commitImport: (draft: ImportDraft, opts?: { replaceStatementId?: string }) => void;
  removeStatement: (id: string) => void;
  setCategory: (txId: string, categoryId: CategoryId, applyToSimilar: boolean) => number;
  toggleExcluded: (txId: string) => void;
  /** Cria ou atualiza mapeamentos de/para e recategoriza tudo. */
  saveMappings: (entries: MappingInput[]) => { saved: number; affected: number };
  deleteRule: (id: string) => void;
  addCategory: (name: string, group: SpendGroup) => Category | null;
  deleteCategory: (id: CategoryId) => void;
  loadDemo: () => void;
  clearAll: () => void;
  restoreBackup: (raw: unknown) => boolean;
}

/**
 * Recalcula categoria e nome de todos os lançamentos que não foram ajustados
 * à mão, aplicando o de/para do usuário e a base embutida.
 */
export function recategorize(
  txs: Transaction[],
  rules: UserRule[],
  categories: Category[],
): Transaction[] {
  const compiled = compileRules(rules);
  const valid = buildCategoryIndex(categories);
  return txs.map((t) => {
    if (t.categorySource === 'manual' && valid.has(t.categoryId)) return t;
    const r = categorize(t.rawDescription, t.kind, compiled);
    const next: Transaction = {
      ...t,
      categoryId: r.categoryId,
      categorySource: r.source,
      merchantName: r.brand ?? displayMerchant(t.rawDescription),
    };
    if (r.ruleId) next.ruleId = r.ruleId;
    else delete next.ruleId;
    return next;
  });
}

function persistable(s: AppState): PersistedState {
  return {
    schemaVersion: s.schemaVersion,
    statements: s.statements,
    transactions: s.transactions,
    rules: s.rules,
    customCategories: s.customCategories,
  };
}

export const useAppStore = create<AppState>()((set, get) => ({
  ...emptyState(),
  hydrated: false,
  storage: 'carregando',

  hydrate: async () => {
    const { state, available } = await loadState();
    // Primeiro acesso (nada salvo ainda): abre com dados de exemplo.
    const data = state ?? buildDemoState();
    set({ ...data, hydrated: true, storage: available ? 'local' : 'memoria' });
  },

  commitImport: (draft, opts) => {
    const s = get();
    // A primeira fatura real substitui os dados de exemplo.
    const dropIds = new Set(
      draft.statement.isDemo ? [] : s.statements.filter((st) => st.isDemo).map((st) => st.id),
    );
    if (opts?.replaceStatementId) dropIds.add(opts.replaceStatementId);
    // Reaplica regras do usuário criadas depois do rascunho ter sido montado.
    const txs = recategorize(draft.transactions, s.rules, s.customCategories);
    set({
      statements: [...s.statements.filter((st) => !dropIds.has(st.id)), draft.statement].sort(
        (a, b) => a.referenceMonth.localeCompare(b.referenceMonth),
      ),
      transactions: [...s.transactions.filter((t) => !dropIds.has(t.statementId)), ...txs],
    });
  },

  removeStatement: (id) =>
    set((s) => ({
      statements: s.statements.filter((st) => st.id !== id),
      transactions: s.transactions.filter((t) => t.statementId !== id),
    })),

  setCategory: (txId, categoryId, applyToSimilar) => {
    const s = get();
    const tx = s.transactions.find((t) => t.id === txId);
    if (!tx) return 0;
    if (!applyToSimilar || !tx.merchantKey) {
      set({
        transactions: s.transactions.map((t) =>
          t.id === txId ? { ...t, categoryId, categorySource: 'manual' as const } : t,
        ),
      });
      return 1;
    }
    // Aprende: cria (ou atualiza) o de/para do estabelecimento.
    const existing = s.rules.find((r) => r.match === 'contem' && r.pattern === tx.merchantKey);
    const { rules } = mergeMappings(s.rules, [
      {
        ...(existing ? { id: existing.id } : {}),
        pattern: tx.merchantKey,
        match: 'contem',
        categoryId,
        ...(existing?.displayName ? { displayName: existing.displayName } : {}),
      },
    ]);
    // Lançamentos desse estabelecimento ajustados à mão passam a seguir o de/para.
    const released = s.transactions.map((t) =>
      t.merchantKey === tx.merchantKey && t.categorySource === 'manual'
        ? { ...t, categorySource: 'padrao' as const }
        : t,
    );
    const transactions = recategorize(released, rules, s.customCategories);
    set({ rules, transactions });
    return transactions.filter((t) => t.merchantKey === tx.merchantKey).length;
  },

  toggleExcluded: (txId) =>
    set((s) => ({
      transactions: s.transactions.map((t) =>
        t.id === txId ? { ...t, excluded: !t.excluded } : t,
      ),
    })),

  saveMappings: (entries) => {
    const s = get();
    const { rules, ids } = mergeMappings(s.rules, entries);
    const transactions = recategorize(s.transactions, rules, s.customCategories);
    const touched = new Set(ids);
    set({ rules, transactions });
    return {
      saved: ids.length,
      affected: transactions.filter((t) => t.ruleId && touched.has(t.ruleId)).length,
    };
  },

  deleteRule: (id) => {
    const s = get();
    const rules = s.rules.filter((r) => r.id !== id);
    set({ rules, transactions: recategorize(s.transactions, rules, s.customCategories) });
  },

  addCategory: (name, group) => {
    const s = get();
    const clean = name.trim().slice(0, 40);
    if (!clean) return null;
    const index = buildCategoryIndex(s.customCategories);
    let id = `custom-${slugify(clean) || 'categoria'}`;
    let n = 2;
    while (index.has(id)) id = `custom-${slugify(clean)}-${n++}`;
    const category: Category = { id, name: clean, group, icon: 'tag', builtIn: false };
    set({ customCategories: [...s.customCategories, category] });
    return category;
  },

  deleteCategory: (id) => {
    const s = get();
    const customCategories = s.customCategories.filter((c) => c.id !== id);
    const rules = s.rules.filter((r) => r.categoryId !== id);
    const released = s.transactions.map((t) =>
      t.categoryId === id ? { ...t, categorySource: 'padrao' as const } : t,
    );
    set({ customCategories, rules, transactions: recategorize(released, rules, customCategories) });
  },

  loadDemo: () => set({ ...buildDemoState() }),

  clearAll: () => set({ ...emptyState() }),

  restoreBackup: (raw) => {
    const data = migrate(raw);
    if (!data) return false;
    set({ ...data });
    return true;
  },
}));

// Persistência: grava no IndexedDB (com atraso) sempre que os dados mudam.
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSaved: PersistedState | undefined;
useAppStore.subscribe((state) => {
  if (!state.hydrated || state.storage === 'memoria') return;
  const data = persistable(state);
  if (
    lastSaved &&
    lastSaved.statements === data.statements &&
    lastSaved.transactions === data.transactions &&
    lastSaved.rules === data.rules &&
    lastSaved.customCategories === data.customCategories
  ) {
    return;
  }
  lastSaved = data;
  clearTimeout(timer);
  timer = setTimeout(() => {
    void saveState(data).then((ok) => {
      if (!ok) useAppStore.setState({ storage: 'memoria' });
    });
  }, 300);
});
