import { FALLBACK_CATEGORY, FEES_CATEGORY, PAYMENT_CATEGORY } from '../domain/categories';
import type { CategoryId, CategorySource, TxKind, UserRule } from '../domain/types';
import { BUILTIN_RULES } from './builtinRules';
import { merchantKey, normalizeText, stripAcquirer } from './normalize';

export interface CompiledRule {
  id: string;
  categoryId: CategoryId;
  brand?: string;
  source: 'sistema' | 'regra';
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

let builtinCache: CompiledRule[] | null = null;

/** Compila a base embutida uma única vez (≈ 900 palavras-chave). */
export function compileBuiltinRules(): CompiledRule[] {
  if (builtinCache) return builtinCache;
  const rules: CompiledRule[] = [];
  for (const [categoryId, entries] of Object.entries(BUILTIN_RULES)) {
    entries.forEach((rawEntry, entryIndex) => {
      const platform = rawEntry.startsWith('!');
      const entry = platform ? rawEntry.slice(1) : rawEntry;
      const [keywordsPart, brand] = entry.split('=');
      for (const keyword of (keywordsPart ?? '').split('|')) {
        const compiled = compileKeyword(keyword);
        if (!compiled) continue;
        rules.push({
          id: `sys:${categoryId}:${entryIndex}:${keyword}`,
          categoryId,
          ...(brand ? { brand } : {}),
          source: 'sistema',
          // Marcas ganham um pequeno bônus sobre termos genéricos do mesmo tamanho.
          specificity: (platform ? 50_000 : 0) + compiled.length * 10 + (brand ? 5 : 0),
          test: (n) => compiled.re.test(n),
        });
      }
    });
  }
  builtinCache = rules;
  return rules;
}

/** Compila uma regra (de/para) criada pelo usuário. Retorna null se for inválida. */
export function compileUserRule(rule: UserRule): CompiledRule | null {
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
    specificity: 100_000 + pattern.length,
    ...(brand ? { brand } : {}),
    test,
  };
}

export function compileRules(userRules: UserRule[]): CompiledRule[] {
  const user = userRules.map(compileUserRule).filter((r): r is CompiledRule => r !== null);
  return [...user, ...compileBuiltinRules()];
}

/** Texto usado no casamento: descrição sem intermediador, normalizada. */
export function matchText(description: string): string {
  return normalizeText(stripAcquirer(description));
}

/**
 * Escolhe a categoria de um lançamento. Pagamentos e encargos têm categoria
 * fixa; o resto vai para a regra mais específica que casar.
 */
export function categorize(
  description: string,
  kind: TxKind,
  rules: CompiledRule[],
): CategorizationResult {
  if (kind === 'pagamento') return { categoryId: PAYMENT_CATEGORY, source: 'sistema' };

  const text = matchText(description);
  const key = merchantKey(description);
  let best: CompiledRule | undefined;
  for (const rule of rules) {
    if ((!best || rule.specificity > best.specificity) && rule.test(text, key)) best = rule;
  }

  // Estorno de IOF/juros continua em tarifas; encargo sem regra também.
  if (kind === 'encargo' && (!best || best.source === 'sistema')) {
    const brand = best?.categoryId === FEES_CATEGORY ? best.brand : undefined;
    return { categoryId: FEES_CATEGORY, source: 'sistema', ...(brand ? { brand } : {}) };
  }
  if (!best) return { categoryId: FALLBACK_CATEGORY, source: 'padrao' };
  return {
    categoryId: best.categoryId,
    source: best.source,
    ...(best.source === 'regra' ? { ruleId: best.id } : {}),
    ...(best.brand ? { brand: best.brand } : {}),
  };
}
