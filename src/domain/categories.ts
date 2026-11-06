import type { Category, CategoryId, SpendGroup } from './types';

/**
 * Categorias padrão. A ordem aqui é a ordem de exibição em listas e seletores.
 * `icon` referencia um ícone do lucide (mapeado em ui/components/CategoryIcon).
 */
export const BUILTIN_CATEGORIES: Category[] = [
  {
    id: 'supermercado',
    name: 'Supermercado',
    group: 'essencial',
    icon: 'shopping-cart',
    builtIn: true,
  },
  {
    id: 'restaurantes',
    name: 'Restaurantes, bares e cafés',
    group: 'estilo',
    icon: 'utensils',
    builtIn: true,
  },
  { id: 'delivery', name: 'Delivery de comida', group: 'estilo', icon: 'bike', builtIn: true },
  {
    id: 'mobilidade',
    name: 'Apps de mobilidade',
    group: 'essencial',
    icon: 'car-taxi',
    builtIn: true,
  },
  {
    id: 'transporte',
    name: 'Transporte e veículo',
    group: 'essencial',
    icon: 'fuel',
    builtIn: true,
  },
  { id: 'streaming', name: 'Streaming', group: 'estilo', icon: 'tv', builtIn: true },
  {
    id: 'assinaturas',
    name: 'Apps e assinaturas digitais',
    group: 'estilo',
    icon: 'repeat',
    builtIn: true,
  },
  {
    id: 'compras',
    name: 'Compras online e lojas',
    group: 'estilo',
    icon: 'package',
    builtIn: true,
  },
  { id: 'vestuario', name: 'Roupas e acessórios', group: 'estilo', icon: 'shirt', builtIn: true },
  { id: 'saude', name: 'Saúde e farmácia', group: 'essencial', icon: 'heart-pulse', builtIn: true },
  { id: 'casa', name: 'Casa e contas', group: 'essencial', icon: 'home', builtIn: true },
  {
    id: 'educacao',
    name: 'Educação e livros',
    group: 'essencial',
    icon: 'graduation-cap',
    builtIn: true,
  },
  { id: 'lazer', name: 'Lazer e entretenimento', group: 'estilo', icon: 'ticket', builtIn: true },
  { id: 'viagem', name: 'Viagens e hospedagem', group: 'estilo', icon: 'plane', builtIn: true },
  { id: 'academia', name: 'Academia e esportes', group: 'estilo', icon: 'dumbbell', builtIn: true },
  {
    id: 'beleza',
    name: 'Beleza e cuidados pessoais',
    group: 'estilo',
    icon: 'sparkles',
    builtIn: true,
  },
  { id: 'pets', name: 'Pets', group: 'essencial', icon: 'paw-print', builtIn: true },
  { id: 'apostas', name: 'Apostas e jogos de azar', group: 'estilo', icon: 'dices', builtIn: true },
  {
    id: 'servicos',
    name: 'Serviços e profissionais',
    group: 'essencial',
    icon: 'wrench',
    builtIn: true,
  },
  {
    id: 'tarifas',
    name: 'Juros, IOF e tarifas',
    group: 'financeiro',
    icon: 'percent',
    builtIn: true,
  },
  { id: 'outros', name: 'Outros', group: 'outros', icon: 'circle-help', builtIn: true },
  {
    id: 'pagamentos',
    name: 'Pagamentos da fatura',
    group: 'outros',
    icon: 'badge-check',
    builtIn: true,
    hidden: true,
  },
];

export const FALLBACK_CATEGORY: CategoryId = 'outros';
export const PAYMENT_CATEGORY: CategoryId = 'pagamentos';
export const FEES_CATEGORY: CategoryId = 'tarifas';

export const GROUP_LABELS: Record<SpendGroup, string> = {
  essencial: 'Essenciais',
  estilo: 'Estilo de vida',
  financeiro: 'Custo do crédito',
  outros: 'Não classificado',
};

export const GROUP_HINTS: Record<SpendGroup, string> = {
  essencial: 'Mercado, saúde, casa, transporte, educação e pets',
  estilo: 'Restaurantes, delivery, streaming, compras, lazer e viagens',
  financeiro: 'Juros, IOF, multas e anuidade',
  outros: 'Lançamentos ainda sem categoria',
};

export const GROUP_ORDER: SpendGroup[] = ['essencial', 'estilo', 'financeiro', 'outros'];

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
