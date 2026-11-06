import { compileRules, categorize } from '../categorization/categorizer';
import { merchantKey, normalizeText } from '../categorization/normalize';
import type { PersistedState, Transaction, UserRule } from '../domain/types';
import { separateLocations } from '../parsing/merchantText';
import { splitGluedLocation, splitTrailingLocation } from '../parsing/places';
import { recategorize } from '../services/recategorize';

/** Separa o lugar das descrições já salvas de um documento. */
function splitStored(txs: Transaction[]): Map<string, Transaction> {
  const out = new Map<string, Transaction>();
  separateLocations(txs).forEach((t, i) => {
    if (t !== txs[i]) out.set(t.id, { ...t, merchantKey: merchantKey(t.rawDescription) });
  });
  return out;
}

/**
 * Regra de de/para criada com a cidade no padrão ("PADARIA REAL SAO PAULO")
 * ou que deixaria de casar com o nome sem a cidade: passa a apontar para o
 * estabelecimento.
 */
function migrateRule(
  rule: UserRule,
  users: Transaction[],
  updated: Map<string, Transaction>,
  state: PersistedState,
): UserRule {
  if (rule.match === 'regex') return rule;
  if (users.length > 0) {
    const compiled = compileRules([rule], state.customCategories);
    const after = users.map((t) => updated.get(t.id) ?? t);
    const stillMatches = after.every(
      (t) =>
        categorize(t.rawDescription, t.parsedKind ?? t.kind, compiled, t.amountCents).ruleId ===
        rule.id,
    );
    if (stillMatches) return rule;
    const keys = new Set(after.map((t) => t.merchantKey));
    const [only] = [...keys];
    if (keys.size === 1 && only) return { ...rule, pattern: only };
  }
  const glued = splitGluedLocation(rule.pattern);
  const split = glued.location ? glued : splitTrailingLocation(rule.pattern);
  if (!split.location || !normalizeText(split.rest)) return rule;
  return { ...rule, pattern: split.rest };
}

/** v1 → v2: cidade/UF/país saem do nome do estabelecimento e vão para `location`. */
export function migrateToV2(state: PersistedState): PersistedState {
  const byStatement = new Map<string, Transaction[]>();
  for (const t of state.transactions) {
    byStatement.set(t.statementId, [...(byStatement.get(t.statementId) ?? []), t]);
  }
  const updated = new Map<string, Transaction>();
  for (const txs of byStatement.values()) {
    for (const [id, t] of splitStored(txs)) updated.set(id, t);
  }
  const rules = state.rules.map((r) =>
    migrateRule(
      r,
      state.transactions.filter((t) => t.ruleId === r.id),
      updated,
      state,
    ),
  );
  const rulesChanged = rules.some((r, i) => r !== state.rules[i]);
  if (updated.size === 0 && !rulesChanged) return state;
  const transactions = state.transactions.map((t) => updated.get(t.id) ?? t);
  return {
    ...state,
    rules,
    transactions: recategorize(transactions, rules, state.customCategories),
  };
}
