/**
 * Modelo de domínio. Valores monetários são sempre inteiros em centavos
 * (nunca float) para evitar erros de arredondamento.
 */

export type CategoryId = string;

/**
 * Agrupamento das categorias. Os quatro primeiros formam o "perfil" de gasto
 * (essenciais × estilo de vida × custo do crédito); "receita" reúne as
 * entradas da conta e "neutro" o que não é gasto nem renda (pagamento da
 * fatura, aplicações, resgates e transferências entre contas próprias).
 */
export type SpendGroup = 'essencial' | 'estilo' | 'financeiro' | 'outros' | 'receita' | 'neutro';

/** Escopo de uma categoria: gasto, entrada ou movimentação neutra. */
export type CategoryScope = 'gasto' | 'receita' | 'neutro';

/** Origem do documento: fatura de cartão de crédito ou extrato de conta corrente. */
export type AccountType = 'cartao' | 'conta';

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
 * compra        – saída que é gasto (compra, Pix enviado, boleto, saque)
 * estorno       – crédito que abate gasto (estorno, reembolso, devolução)
 * pagamento     – pagamento da fatura do cartão (não é gasto: as compras já estão na fatura)
 * encargo       – juros, IOF, multa, anuidade, tarifas
 * receita       – entrada na conta (salário, Pix recebido, rendimentos)
 * transferencia – movimentação neutra (aplicação, resgate, entre contas próprias)
 */
export type TxKind = 'compra' | 'estorno' | 'pagamento' | 'encargo' | 'receita' | 'transferencia';

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
  /** Fatura de cartão (padrão) ou extrato de conta corrente. */
  source?: AccountType;
  /** Saldo da conta após o lançamento (extratos que trazem saldo por linha). */
  balanceCents?: number;
  /** Identificador do banco (ex.: FITID do OFX), usado para não duplicar. */
  externalId?: string;
  /** Tipo lido do documento, antes de qualquer de/para (permite desfazer conversões). */
  parsedKind?: TxKind;
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
  /** Fatura de cartão (padrão) ou extrato de conta corrente. */
  accountType?: AccountType;
  /** Formato do arquivo importado. */
  format?: 'pdf' | 'ofx' | 'csv';
  /** Como o arquivo chegou: escolhido à mão, pasta monitorada ou Compartilhar. */
  origin?: 'manual' | 'pasta' | 'compartilhado';
  periodStart?: string;
  periodEnd?: string;
  openingBalanceCents?: number;
  closingBalanceCents?: number;
  /** Entradas − saídas do extrato (todos os tipos). */
  netMovementCents?: number;
  /** Agência/conta ou identificação do cartão. */
  accountLabel?: string;
  /** Movimentações já importadas de outro extrato e ignoradas nesta importação. */
  skippedDuplicates?: number;
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
