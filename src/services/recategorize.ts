import { categorize, compileRules } from '../categorization/categorizer';
import { displayMerchant } from '../categorization/normalize';
import { buildCategoryIndex } from '../domain/categories';
import type { Category, Transaction, UserRule } from '../domain/types';

/**
 * Recalcula categoria e nome de todos os lançamentos que não foram ajustados
 * à mão, aplicando o de/para do usuário e a base embutida.
 */
export function recategorize(
  txs: Transaction[],
  rules: UserRule[],
  categories: Category[],
): Transaction[] {
  const compiled = compileRules(rules, categories);
  const valid = buildCategoryIndex(categories);
  return txs.map((t) => {
    if (t.categorySource === 'manual' && valid.has(t.categoryId)) return t;
    // Sempre a partir do tipo lido no documento: apagar um de/para desfaz a conversão.
    const base = t.parsedKind ?? t.kind;
    const r = categorize(t.rawDescription, base, compiled, t.amountCents);
    const next: Transaction = {
      ...t,
      kind: r.kind ?? base,
      categoryId: r.categoryId,
      categorySource: r.source,
      merchantName: r.brand ?? displayMerchant(t.rawDescription),
    };
    if (r.ruleId) next.ruleId = r.ruleId;
    else delete next.ruleId;
    return next;
  });
}

/**
 * Ao substituir uma importação pela leitura nova do mesmo documento, leva
 * para os lançamentos novos o que o usuário ajustou à mão nos antigos
 * (categoria e "fora da análise"). O par é encontrado por data e valor.
 */
export function carryOverManual(incoming: Transaction[], previous: Transaction[]): Transaction[] {
  const pool = new Map<string, Transaction[]>();
  for (const t of previous) {
    if (t.categorySource !== 'manual' && !t.excluded) continue;
    const key = `${t.date}|${t.amountCents}`;
    pool.set(key, [...(pool.get(key) ?? []), t]);
  }
  if (pool.size === 0) return incoming;
  return incoming.map((t) => {
    const list = pool.get(`${t.date}|${t.amountCents}`);
    const old = list?.shift();
    if (!old) return t;
    const next: Transaction = { ...t };
    if (old.categorySource === 'manual') {
      next.categoryId = old.categoryId;
      next.categorySource = 'manual';
      next.kind = old.kind;
      delete next.ruleId;
    }
    if (old.excluded) next.excluded = true;
    return next;
  });
}
