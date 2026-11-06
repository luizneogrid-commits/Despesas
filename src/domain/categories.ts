import type { Category, CategoryId, CategoryScope, SpendGroup } from './types';

type Def = [id: CategoryId, name: string, group: SpendGroup, icon: string, hidden?: boolean];

/**
 * Categorias padrão. A ordem aqui é a ordem de exibição em listas e seletores.
 * `icon` referencia um ícone do lucide (mapeado em ui/components/CategoryIcon).
 */
const DEFS: Def[] = [
  ['supermercado', 'Supermercado', 'essencial', 'shopping-cart'],
  ['restaurantes', 'Restaurantes, bares e cafés', 'estilo', 'utensils'],
  ['delivery', 'Delivery de comida', 'estilo', 'bike'],
  ['mobilidade', 'Apps de mobilidade', 'essencial', 'car-taxi'],
  ['transporte', 'Transporte e veículo', 'essencial', 'fuel'],
  ['streaming', 'Streaming', 'estilo', 'tv'],
  ['assinaturas', 'Apps e assinaturas digitais', 'estilo', 'repeat'],
  ['compras', 'Compras online e lojas', 'estilo', 'package'],
  ['vestuario', 'Roupas e acessórios', 'estilo', 'shirt'],
  ['saude', 'Saúde e farmácia', 'essencial', 'heart-pulse'],
  ['casa', 'Casa e contas', 'essencial', 'home'],
  ['educacao', 'Educação e livros', 'essencial', 'graduation-cap'],
  ['lazer', 'Lazer e entretenimento', 'estilo', 'ticket'],
  ['viagem', 'Viagens e hospedagem', 'estilo', 'plane'],
  ['academia', 'Academia e esportes', 'estilo', 'dumbbell'],
  ['beleza', 'Beleza e cuidados pessoais', 'estilo', 'sparkles'],
  ['pets', 'Pets', 'essencial', 'paw-print'],
  ['apostas', 'Apostas e jogos de azar', 'estilo', 'dices'],
  ['servicos', 'Serviços e profissionais', 'essencial', 'wrench'],
  ['pix-enviado', 'Pix e transferências enviadas', 'outros', 'send'],
  ['saque', 'Saques em dinheiro', 'outros', 'banknote'],
  ['tarifas', 'Juros, IOF e tarifas', 'financeiro', 'percent'],
  ['outros', 'Outros', 'outros', 'circle-help'],
  // Entradas (extrato de conta): não entram no perfil de gasto.
  ['salario', 'Salário e renda', 'receita', 'briefcase'],
  ['recebimentos', 'Pix e transferências recebidas', 'receita', 'arrow-down-left'],
  ['rendimentos', 'Rendimentos e cashback', 'receita', 'trending-up'],
  // Neutras: nem gasto nem renda (evita contar duas vezes).
  ['pagamentos', 'Pagamento da fatura do cartão', 'neutro', 'badge-check', true],
  ['movimentacoes', 'Aplicações, resgates e entre contas', 'neutro', 'arrow-left-right', true],
];

export const BUILTIN_CATEGORIES: Category[] = DEFS.map(([id, name, group, icon, hidden]) => ({
  id,
  name,
  group,
  icon,
  builtIn: true,
  ...(hidden ? { hidden: true } : {}),
}));

export const FALLBACK_CATEGORY: CategoryId = 'outros';
export const PAYMENT_CATEGORY: CategoryId = 'pagamentos';
export const FEES_CATEGORY: CategoryId = 'tarifas';
export const INCOME_FALLBACK: CategoryId = 'recebimentos';
export const NEUTRAL_CATEGORY: CategoryId = 'movimentacoes';

export function scopeOfGroup(group: SpendGroup): CategoryScope {
  return group === 'receita' ? 'receita' : group === 'neutro' ? 'neutro' : 'gasto';
}

export function scopeOf(category: Category | undefined): CategoryScope {
  return category ? scopeOfGroup(category.group) : 'gasto';
}

export const GROUP_LABELS: Record<SpendGroup, string> = {
  essencial: 'Essenciais',
  estilo: 'Estilo de vida',
  financeiro: 'Custo do crédito',
  outros: 'Outros e não classificados',
  receita: 'Entradas',
  neutro: 'Movimentações neutras',
};

export const GROUP_HINTS: Record<SpendGroup, string> = {
  essencial: 'Mercado, saúde, casa, transporte, educação e pets',
  estilo: 'Restaurantes, delivery, streaming, compras, lazer e viagens',
  financeiro: 'Juros, IOF, multas e anuidade',
  outros: 'Pix enviados, saques e lançamentos sem categoria',
  receita: 'Salário, Pix recebidos e rendimentos',
  neutro: 'Pagamento da fatura, aplicações e transferências entre contas próprias',
};

/** Grupos do perfil de gasto. */
export const GROUP_ORDER: SpendGroup[] = ['essencial', 'estilo', 'financeiro', 'outros'];
/** Todos os grupos, para seletores de categoria. */
export const ALL_GROUPS: SpendGroup[] = [...GROUP_ORDER, 'receita', 'neutro'];

export function buildCategoryIndex(custom: Category[]): Map<CategoryId, Category> {
  const map = new Map<CategoryId, Category>();
  for (const c of BUILTIN_CATEGORIES) map.set(c.id, c);
  for (const c of custom) map.set(c.id, c);
  return map;
}

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
