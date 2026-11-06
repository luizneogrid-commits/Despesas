import { create } from 'zustand';
import { compileRules } from '../categorization/categorizer';
import type { AccountType, Statement } from '../domain/types';
import { PdfPasswordError } from '../parsing/errors';
import { fileFormat, processFile, reconcile, type ImportDraft } from '../services/importService';
import { useAppStore } from '../store/appStore';
import { uid } from '../utils/id';

/**
 * Fila de importação fora dos componentes: sobrevive à troca de aba e recebe
 * arquivos de qualquer origem (seletor, arrastar, "Compartilhar" do celular,
 * abrir com o app instalado e pasta monitorada).
 */
export type Status = 'lendo' | 'senha' | 'erro' | 'revisao';
export type Origin = NonNullable<Statement['origin']>;

export interface QueueItem {
  id: string;
  file: File;
  status: Status;
  origin: Origin;
  error?: string;
  wrongPassword?: boolean;
  draft?: ImportDraft;
  example?: boolean;
  /** Importar sem revisão quando a leitura for confiável (pasta monitorada). */
  autoCommit?: boolean;
  /** Por que um item automático parou para revisão. */
  reviewReason?: string;
  forceType?: AccountType;
}

export type AutoEvent =
  | { type: 'importado'; fileName: string; draft: ImportDraft }
  | { type: 'revisar'; fileName: string; reason: string }
  | { type: 'duplicado'; fileName: string }
  | { type: 'erro'; fileName: string; reason: string };

/** Ouvintes de eventos de importação automática (ex.: registro da pasta monitorada). */
export const autoListeners = new Set<(e: AutoEvent) => void>();
const emit = (e: AutoEvent) => autoListeners.forEach((fn) => fn(e));

/** Senha usada para PDFs da pasta monitorada (definida pelo usuário, opcional). */
let folderPassword: string | undefined;
export function setFolderPassword(p: string | undefined) {
  folderPassword = p || undefined;
}

interface QueueState {
  items: QueueItem[];
  upsert: (item: QueueItem) => void;
  remove: (id: string) => void;
}

export const useQueue = create<QueueState>()((set) => ({
  items: [],
  upsert: (item) =>
    set((s) => ({
      items: s.items.some((i) => i.id === item.id)
        ? s.items.map((i) => (i.id === item.id ? item : i))
        : [...s.items, item],
    })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export type AutoMode = 'quando-confere' | 'sempre' | 'revisar';
let autoMode: AutoMode = 'quando-confere';
export function setAutoMode(mode: AutoMode) {
  autoMode = mode;
}

/** Decide se um rascunho pode entrar sem revisão; senão, diz o motivo. */
export function autoDecision(
  draft: ImportDraft,
  mode: AutoMode,
): { ok: true } | { ok: false; reason: string } {
  if (mode === 'revisar') return { ok: false, reason: 'configurado para sempre revisar' };
  if (draft.transactions.length === 0) {
    return {
      ok: false,
      reason:
        (draft.statement.skippedDuplicates ?? 0) > 0
          ? 'todas as movimentações já estavam importadas'
          : 'nenhum lançamento reconhecido',
    };
  }
  if (draft.sameMonthAs) return { ok: false, reason: 'já existe uma fatura deste mês' };
  if (mode === 'quando-confere' && reconcile(draft.statement).status === 'diferente') {
    return { ok: false, reason: 'a soma não conferiu com o total do documento' };
  }
  return { ok: true };
}

export async function processItem(
  item: QueueItem,
  opts: { password?: string; forceType?: AccountType } = {},
) {
  const { upsert, remove } = useQueue.getState();
  const forceType = opts.forceType ?? item.forceType;
  upsert({ ...item, status: 'lendo', ...(forceType ? { forceType } : {}) });
  const { rules, statements, transactions, customCategories } = useAppStore.getState();
  const password = opts.password ?? (item.origin === 'pasta' ? folderPassword : undefined);
  try {
    let draft = await processFile(item.file, {
      rules: compileRules(rules, customCategories),
      existing: statements,
      existingTransactions: transactions,
      origin: item.origin,
      ...(password ? { password } : {}),
      ...(forceType ? { forceType } : {}),
    });
    if (item.example) draft = { ...draft, statement: { ...draft.statement, isDemo: true } };

    if (item.autoCommit) {
      if (draft.duplicateOf) {
        remove(item.id);
        emit({ type: 'duplicado', fileName: item.file.name });
        return;
      }
      const decision = autoDecision(draft, autoMode);
      if (decision.ok) {
        useAppStore.getState().commitImport(draft);
        remove(item.id);
        emit({ type: 'importado', fileName: item.file.name, draft });
        return;
      }
      emit({ type: 'revisar', fileName: item.file.name, reason: decision.reason });
      upsert({
        ...item,
        status: 'revisao',
        draft,
        reviewReason: decision.reason,
        ...(forceType ? { forceType } : {}),
      });
      return;
    }
    upsert({ ...item, status: 'revisao', draft, ...(forceType ? { forceType } : {}) });
  } catch (err) {
    if (err instanceof PdfPasswordError) {
      upsert({ ...item, status: 'senha', wrongPassword: err.incorrect && Boolean(opts.password) });
      if (item.autoCommit)
        emit({ type: 'revisar', fileName: item.file.name, reason: 'PDF com senha' });
    } else {
      const reason = err instanceof Error ? err.message : 'Erro inesperado ao ler o arquivo.';
      upsert({ ...item, status: 'erro', error: reason });
      if (item.autoCommit) emit({ type: 'erro', fileName: item.file.name, reason });
    }
  }
}

export function addFiles(
  files: File[],
  opts: { example?: boolean; origin?: Origin; autoCommit?: boolean } = {},
) {
  for (const file of files) {
    const item: QueueItem = {
      id: uid('arq'),
      file,
      status: 'lendo',
      origin: opts.origin ?? 'manual',
      ...(opts.example ? { example: true } : {}),
      ...(opts.autoCommit ? { autoCommit: true } : {}),
    };
    if (!fileFormat(file)) {
      useQueue.getState().upsert({
        ...item,
        status: 'erro',
        error:
          'Formato não suportado. Use o PDF da fatura/extrato ou o OFX/CSV exportado pelo banco.',
      });
      continue;
    }
    if (file.size > 25 * 1024 * 1024) {
      useQueue
        .getState()
        .upsert({ ...item, status: 'erro', error: 'Arquivo grande demais (máx. 25 MB).' });
      continue;
    }
    void processItem(item);
  }
}
