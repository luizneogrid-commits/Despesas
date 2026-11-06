import {
  buildCategoryIndex,
  FALLBACK_CATEGORY,
  FEES_CATEGORY,
  INCOME_FALLBACK,
  NEUTRAL_CATEGORY,
  PAYMENT_CATEGORY,
  scopeOf,
} from '../domain/categories';
import type {
  Category,
  CategoryId,
  CategoryScope,
  CategorySource,
  TxKind,
  UserRule,
} from '../domain/types';
import { BUILTIN_INCOME_RULES, BUILTIN_NEUTRAL_RULES, BUILTIN_RULES } from './builtinRules';
import { merchantKey, normalizeText, stripAcquirer } from './normalize';

export interface CompiledRule {
  id: string;
  categoryId: CategoryId;
  brand?: string;
  source: 'sistema' | 'regra';
  /** Gasto, entrada ou neutro: decide a que lançamentos a regra se aplica. */
  scope: CategoryScope;
  /** Quanto maior, mais específica. Regras do usuário sempre vencem. */
  specificity: number;
  /** Recebe a descrição normalizada e a chave do estabelecimento. */
  test: (normalized: string, key: string) => boolean;
}

export interface CategorizationResult {
  categoryId: CategoryId;
  source: CategorySource;
  ruleId?: string;
  brand?: string;
  /** Tipo resultante quando um de/para muda a natureza do lançamento. */
  kind?: TxKind;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileKeyword(raw: string): { re: RegExp; length: number } | null {
  const prefix = raw.trim().endsWith('*');
  const kw = normalizeText(raw.replace(/\*$/, ''));
  if (!kw) return null;
  const body = kw.split(' ').map(escapeRegExp).join(' ');
  const re = new RegExp(`(?:^| )${body}${prefix ? '' : '(?= |$)'}`);
  return { re, length: kw.length };
}

function compileSet(set: Record<CategoryId, string[]>, scope: CategoryScope): CompiledRule[] {
  const rules: CompiledRule[] = [];
  for (const [categoryId, entries] of Object.entries(set)) {
    entries.forEach((rawEntry, entryIndex) => {
      const platform = rawEntry.startsWith('!');
      const entry = platform ? rawEntry.slice(1) : rawEntry;
      const [keywordsPart, brand] = entry.split('=');
      for (const keyword of (keywordsPart ?? '').split('|')) {
        const compiled = compileKeyword(keyword);
        if (!compiled) continue;
        rules.push({
          id: `sys:${scope}:${categoryId}:${entryIndex}:${keyword}`,
          categoryId,
          ...(brand ? { brand } : {}),
          source: 'sistema',
          scope,
          // Plataformas (iFood, Rappi…) vencem termos genéricos; marcas vencem genéricos do mesmo tamanho.
          specificity: (platform ? 50_000 : 0) + compiled.length * 10 + (brand ? 5 : 0),
          test: (n) => compiled.re.test(n),
        });
      }
    });
  }
  return rules;
}

let builtinCache: CompiledRule[] | null = null;

/** Compila as bases embutidas uma única vez (gasto, entradas e neutras). */
export function compileBuiltinRules(): CompiledRule[] {
  if (builtinCache) return builtinCache;
  builtinCache = [
    ...compileSet(BUILTIN_RULES, 'gasto'),
    ...compileSet(BUILTIN_INCOME_RULES, 'receita'),
    ...compileSet(BUILTIN_NEUTRAL_RULES, 'neutro'),
  ];
  return builtinCache;
}

/** Compila uma regra (de/para) criada pelo usuário. Retorna null se for inválida. */
export function compileUserRule(
  rule: UserRule,
  scope: CategoryScope = 'gasto',
): CompiledRule | null {
  const pattern = rule.pattern.trim();
  if (!pattern) return null;
  let test: (n: string, key: string) => boolean;
  if (rule.match === 'regex') {
    try {
      const re = new RegExp(pattern, 'i');
      test = (n) => re.test(n);
    } catch {
      return null;
    }
  } else {
    const p = normalizeText(pattern);
    if (!p) return null;
    // Testa a descrição e também a chave do estabelecimento (sem números,
    // "LTDA", "DE"...), para que "LOJA MOVEIS" case com "LOJA DE MOVEIS 12".
    if (rule.match === 'exato') test = (n, k) => n === p || k === p;
    else if (rule.match === 'comeca') test = (n, k) => n.startsWith(p) || k.startsWith(p);
    else test = (n, k) => n.includes(p) || k.includes(p);
  }
  const brand = rule.displayName?.trim();
  return {
    id: rule.id,
    categoryId: rule.categoryId,
    source: 'regra',
    scope,
    specificity: 100_000 + pattern.length,
    ...(brand ? { brand } : {}),
    test,
  };
}

/** Regras do usuário (com o escopo da categoria de destino) + bases embutidas. */
export function compileRules(
  userRules: UserRule[],
  customCategories: Category[] = [],
): CompiledRule[] {
  const index = buildCategoryIndex(customCategories);
  const user = userRules
    .map((r) => compileUserRule(r, scopeOf(index.get(r.categoryId))))
    .filter((r): r is CompiledRule => r !== null);
  return [...user, ...compileBuiltinRules()];
}

/** Texto usado no casamento: descrição sem intermediador, normalizada. */
export function matchText(description: string): string {
  return normalizeText(stripAcquirer(description));
}

/** Base embutida consultada para cada tipo de lançamento. */
function builtinScopeFor(kind: TxKind): CategoryScope {
  if (kind === 'receita') return 'receita';
  if (kind === 'transferencia') return 'neutro';
  return 'gasto';
}

/** Escopos de de/para que podem valer para um lançamento (saída não vira entrada). */
function userScopesFor(credit: boolean): CategoryScope[] {
  return credit ? ['gasto', 'receita', 'neutro'] : ['gasto', 'neutro'];
}

/** Tipo do lançamento depois de aplicada uma categoria de outro escopo. */
export function kindForScope(
  scope: CategoryScope,
  categoryId: CategoryId,
  original: TxKind,
  credit: boolean,
): TxKind {
  if (scope === 'neutro') return categoryId === PAYMENT_CATEGORY ? 'pagamento' : 'transferencia';
  if (scope === 'receita') return 'receita';
  if (credit) return 'estorno';
  return original === 'encargo' ? 'encargo' : 'compra';
}

/**
 * Escolhe a categoria de um lançamento. Pagamento da fatura e encargos têm
 * categoria fixa (a menos de um de/para); entradas usam a base de entradas;
 * movimentações neutras, a base neutra; o resto, a regra mais específica.
 * `amountCents` (positivo = saída) desambigua créditos de débitos.
 */
export function categorize(
  description: string,
  kind: TxKind,
  rules: CompiledRule[],
  amountCents?: number,
): CategorizationResult {
  const credit =
    amountCents !== undefined ? amountCents < 0 : kind === 'estorno' || kind === 'receita';
  if (kind === 'pagamento') return { categoryId: PAYMENT_CATEGORY, source: 'sistema' };

  const text = matchText(description);
  const key = merchantKey(description);
  const builtinScope = builtinScopeFor(kind);
  const allowedUser = userScopesFor(credit);
  let best: CompiledRule | undefined;
  for (const rule of rules) {
    if (rule.source === 'sistema' ? rule.scope !== builtinScope : !allowedUser.includes(rule.scope))
      continue;
    if ((!best || rule.specificity > best.specificity) && rule.test(text, key)) best = rule;
  }

  if (best?.source === 'regra') {
    const nextKind = kindForScope(best.scope, best.categoryId, kind, credit);
    return {
      categoryId: best.categoryId,
      source: 'regra',
      ruleId: best.id,
      ...(best.brand ? { brand: best.brand } : {}),
      ...(nextKind !== kind ? { kind: nextKind } : {}),
    };
  }

  // Estorno de IOF/juros continua em tarifas; encargo sem regra também.
  if (kind === 'encargo') {
    const brand = best?.categoryId === FEES_CATEGORY ? best.brand : undefined;
    return { categoryId: FEES_CATEGORY, source: 'sistema', ...(brand ? { brand } : {}) };
  }
  if (!best) {
    if (kind === 'receita') return { categoryId: INCOME_FALLBACK, source: 'sistema' };
    if (kind === 'transferencia') return { categoryId: NEUTRAL_CATEGORY, source: 'sistema' };
    return { categoryId: FALLBACK_CATEGORY, source: 'padrao' };
  }
  return {
    categoryId: best.categoryId,
    source: best.source,
    ...(best.brand ? { brand: best.brand } : {}),
  };
}
