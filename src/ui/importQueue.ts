import { create } from 'zustand';
import { compileRules } from '../categorization/categorizer';
import { PdfPasswordError } from '../parsing/errors';
import { processPdfFile, type ImportDraft } from '../services/importService';
import { useAppStore } from '../store/appStore';
import { uid } from '../utils/id';

/**
 * Fila de importação fora dos componentes: sobrevive à troca de aba e recebe
 * arquivos de qualquer origem (seletor, arrastar, "Compartilhar" do celular,
 * abrir PDF com o app instalado).
 */
export type Status = 'lendo' | 'senha' | 'erro' | 'revisao';

export interface QueueItem {
  id: string;
  file: File;
  status: Status;
  error?: string;
  wrongPassword?: boolean;
  draft?: ImportDraft;
  example?: boolean;
}

interface QueueState {
  items: QueueItem[];
  upsert: (item: QueueItem) => void;
  remove: (id: string) => void;
}

/** Fila de importação fora do componente: sobrevive à troca de aba. */
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

export async function processItem(item: QueueItem, password?: string) {
  const { upsert } = useQueue.getState();
  upsert({ ...item, status: 'lendo' });
  const { rules, statements } = useAppStore.getState();
  try {
    let draft = await processPdfFile(item.file, {
      rules: compileRules(rules),
      existing: statements,
      ...(password ? { password } : {}),
    });
    if (item.example) draft = { ...draft, statement: { ...draft.statement, isDemo: true } };
    upsert({
      id: item.id,
      file: item.file,
      status: 'revisao',
      draft,
      ...(item.example ? { example: true } : {}),
    });
  } catch (err) {
    if (err instanceof PdfPasswordError) {
      upsert({ ...item, status: 'senha', wrongPassword: err.incorrect });
    } else {
      upsert({
        ...item,
        status: 'erro',
        error: err instanceof Error ? err.message : 'Erro inesperado ao ler o PDF.',
      });
    }
  }
}

export function addFiles(files: File[], example = false) {
  for (const file of files) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const item: QueueItem = {
      id: uid('arq'),
      file,
      status: 'lendo',
      ...(example ? { example: true } : {}),
    };
    if (!isPdf) {
      useQueue.getState().upsert({
        ...item,
        status: 'erro',
        error: 'Este arquivo não é um PDF. Baixe a fatura em PDF no app ou site do banco.',
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
