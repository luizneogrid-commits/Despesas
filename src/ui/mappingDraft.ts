import { useMemo } from 'react';
import { compileUserRule, matchText } from '../categorization/categorizer';
import { merchantKey } from '../categorization/normalize';
import type { Transaction } from '../domain/types';
import type { PendingMerchant } from '../services/mappings';

export interface MappingDraft {
  pattern: string;
  categoryId: string;
  displayName: string;
}

export function emptyDraft(p: PendingMerchant): MappingDraft {
  return { pattern: p.key, categoryId: '', displayName: '' };
}

/** Quantos lançamentos um texto "de" reconheceria (prévia antes de salvar). */
export function useMatchCount(pattern: string, pool: Transaction[]): number {
  return useMemo(() => {
    const rule = compileUserRule({
      id: 'previa',
      pattern,
      match: 'contem',
      categoryId: 'x',
      createdAt: '',
    });
    if (!rule) return 0;
    return pool.filter(
      (t) =>
        t.kind !== 'pagamento' &&
        rule.test(matchText(t.rawDescription), merchantKey(t.rawDescription)),
    ).length;
  }, [pattern, pool]);
}
