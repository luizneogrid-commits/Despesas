/**
 * Modelo de domínio. Valores monetários são sempre inteiros em centavos
 * (nunca float) para evitar erros de arredondamento.
 */

export type CategoryId = string;

/** Agrupamento usado no "perfil": essenciais × estilo de vida × custo do crédito. */
export type SpendGroup = 'essencial' | 'estilo' | 'financeiro' | 'outros';

export interface Category {
  id: CategoryId;
  name: string;
  group: SpendGroup;
  /** Nome do ícone (mapeado para um componente na camada de UI). */
  icon: string;
  /** Categorias do sistema não podem ser removidas. */
  builtIn: boolean;
  /** Não entra nas análises de gasto (ex.: pagamentos da fatura). */
  hidden?: boolean;
}

/**
 * compra    – débito comum
 * estorno   – crédito que abate gasto (estorno, reembolso, cashback)
 * pagamento – pagamento da fatura (não é gasto)
 * encargo   – juros, IOF, multa, anuidade, tarifas
 */
export type TxKind = 'compra' | 'estorno' | 'pagamento' | 'encargo';

export interface Installment {
  current: number;
  total: number;
}

/** De onde veio a categoria atual do lançamento. */
export type CategorySource = 'sistema' | 'regra' | 'manual' | 'padrao';

export interface Transaction {
  id: string;
  statementId: string;
  /** Data da compra (ISO yyyy-mm-dd). */
  date: string;
  /** Mês de referência da fatura (yyyy-mm), usado nas análises mensais. */
  referenceMonth: string;
  /** Descrição limpa para exibição. */
  description: string;
  /** Texto original extraído do PDF. */
  rawDescription: string;
  /** Chave normalizada do estabelecimento (para agrupar e aprender regras). */
  merchantKey: string;
  /** Nome do estabelecimento/marca para exibição agrupada. */
  merchantName: string;
  /** Positivo = débito; negativo = crédito. */
  amountCents: number;
  kind: TxKind;
  installment?: Installment;
  international: boolean;
  foreign?: { currency: string; amountCents: number };
  cardLast4?: string;
  categoryId: CategoryId;
  categorySource: CategorySource;
  /** Id da regra que definiu a categoria (quando houver). */
  ruleId?: string;
  /** Excluído das análises pelo usuário (ex.: compra para terceiros). */
  excluded?: boolean;
}

export interface Statement {
  id: string;
  fileName: string;
  fileHash: string;
  issuerId: string;
  issuerName: string;
  referenceMonth: string;
  dueDate?: string;
  closingDate?: string;
  declaredTotalCents?: number;
  parsedTotalCents: number;
  transactionCount: number;
  importedAt: string;
  warnings: string[];
  isDemo?: boolean;
}

export type RuleMatch = 'contem' | 'comeca' | 'exato' | 'regex';

/**
 * Mapeamento de/para criado pelo usuário: "de" (texto como aparece na fatura)
 * "para" (categoria e, opcionalmente, um nome amigável). Vale para os
 * lançamentos já importados e para as próximas faturas.
 */
export interface UserRule {
  id: string;
  pattern: string;
  match: RuleMatch;
  categoryId: CategoryId;
  /** Nome de exibição do estabelecimento (ex.: "Padaria do bairro"). */
  displayName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PersistedState {
  schemaVersion: number;
  statements: Statement[];
  transactions: Transaction[];
  rules: UserRule[];
  customCategories: Category[];
}
