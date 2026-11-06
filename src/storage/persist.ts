import type { PersistedState } from '../domain/types';
import { kvGet, kvSet } from './db';
import { migrateToV2 } from './migrations';

/** 2: cidade/país separados do nome do estabelecimento (`Transaction.location`). */
export const SCHEMA_VERSION = 2;
const KEY = 'state';

export function emptyState(): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    statements: [],
    transactions: [],
    rules: [],
    customCategories: [],
  };
}

/** Valida e migra um estado salvo (ou um backup importado). */
export function migrate(raw: unknown): PersistedState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<PersistedState>;
  if (!Array.isArray(r.statements) || !Array.isArray(r.transactions)) return null;
  const version = typeof r.schemaVersion === 'number' ? r.schemaVersion : 0;
  if (version > SCHEMA_VERSION) return null; // backup de versão futura
  let state: PersistedState = {
    schemaVersion: SCHEMA_VERSION,
    statements: r.statements,
    transactions: r.transactions,
    rules: Array.isArray(r.rules) ? r.rules : [],
    customCategories: Array.isArray(r.customCategories) ? r.customCategories : [],
  };
  if (version < 2) state = migrateToV2(state);
  return state;
}

export async function loadState(): Promise<{ state: PersistedState | null; available: boolean }> {
  try {
    const raw = await kvGet<unknown>(KEY);
    return { state: raw ? migrate(raw) : null, available: true };
  } catch {
    return { state: null, available: false };
  }
}

export async function saveState(state: PersistedState): Promise<boolean> {
  try {
    await kvSet(KEY, state);
    return true;
  } catch {
    return false;
  }
}
