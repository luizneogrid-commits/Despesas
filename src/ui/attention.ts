import { useMemo } from 'react';
import { useFolder } from '../pwa/folderWatch';
import { isLocationText } from '../parsing/places';
import { isOutdatedRead } from '../services/importService';
import { pendingMerchants } from '../services/mappings';
import { useAppStore } from '../store/appStore';
import { useQueue } from './importQueue';
import type { Statement, Transaction } from '../domain/types';
import type { Route } from './route';

export interface AttentionItem {
  id: 'revisar' | 'de-para' | 'pasta' | 'reler';
  title: string;
  detail: string;
  action: { label: string; route: Route };
  count: number;
}

/**
 * O que pede ação do usuário, reunido num lugar só (Início, aba "Mais" e
 * contadores do menu): arquivos para revisar, não reconhecidos e a pasta
 * monitorada esperando permissão.
 */
export function useAttention(): {
  items: AttentionItem[];
  total: number;
  pending: number;
  reviews: number;
} {
  const transactions = useAppStore((s) => s.transactions);
  const statements = useAppStore((s) => s.statements);
  const queue = useQueue((s) => s.items);
  const folderStatus = useFolder((s) => s.status);
  const folderName = useFolder((s) => s.folderName);
  const pending = useMemo(() => pendingMerchants(transactions), [transactions]);
  const reread = useMemo(
    () => cityOnlyStatements(statements, transactions),
    [statements, transactions],
  );

  return useMemo(() => {
    const items: AttentionItem[] = [];
    const reviews = queue.filter((q) => q.status !== 'lendo').length;
    if (reviews > 0) {
      const passwords = queue.filter((q) => q.status === 'senha').length;
      items.push({
        id: 'revisar',
        title: `${reviews} ${reviews === 1 ? 'arquivo esperando' : 'arquivos esperando'} revisão`,
        detail:
          passwords > 0
            ? `${passwords} com senha. Confira e confirme a importação.`
            : 'Confira o que foi lido e confirme a importação.',
        action: { label: 'Revisar', route: 'importar' },
        count: reviews,
      });
    }
    if (pending.length > 0) {
      const total = pending.reduce((a, p) => a + p.totalCents, 0);
      const pix = pending.filter((p) => p.isPix).length;
      items.push({
        id: 'de-para',
        title: `${pending.length} ${pending.length === 1 ? 'estabelecimento não reconhecido' : 'estabelecimentos ou Pix sem categoria'}`,
        detail: `Somam ${(total / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}${pix ? `, incluindo ${pix} ${pix === 1 ? 'destinatário de Pix' : 'destinatários de Pix'}` : ''}. Mapeie uma vez e vale para as próximas importações.`,
        action: { label: 'Mapear no de/para', route: 'de-para' },
        count: pending.length,
      });
    }
    if (reread.statements > 0) {
      const many = reread.statements > 1;
      items.push({
        id: 'reler',
        title: `${reread.transactions} ${reread.transactions === 1 ? 'lançamento aparece' : 'lançamentos aparecem'} só com o nome da cidade`,
        detail: `${many ? `${reread.statements} faturas foram lidas` : 'Uma fatura foi lida'} antes da melhoria que separa o estabelecimento da cidade. Importe o mesmo PDF de novo e escolha "Substituir pela leitura nova".`,
        action: { label: 'Importar de novo', route: 'importar' },
        count: reread.statements,
      });
    }
    if (folderStatus === 'precisa-permissao') {
      items.push({
        id: 'pasta',
        title: 'Pasta monitorada pausada',
        detail: `O navegador pede para confirmar o acesso à pasta "${folderName ?? ''}" a cada visita.`,
        action: { label: 'Retomar', route: 'importar' },
        count: 1,
      });
    }
    return {
      items,
      total: items.reduce((a, i) => a + i.count, 0),
      pending: pending.length,
      reviews,
    };
  }, [queue, pending, reread, folderStatus, folderName]);
}

/**
 * Faturas em PDF lidas por um leitor anterior em que algum lançamento ficou
 * só com a cidade no lugar do nome: a leitura nova recupera o estabelecimento.
 */
export function cityOnlyStatements(
  statements: Statement[],
  transactions: Transaction[],
): { statements: number; transactions: number } {
  const outdated = new Set(
    statements.filter((s) => isOutdatedRead(s) && (s.format ?? 'pdf') === 'pdf').map((s) => s.id),
  );
  if (outdated.size === 0) return { statements: 0, transactions: 0 };
  const affected = transactions.filter(
    (t) => outdated.has(t.statementId) && isLocationText(t.rawDescription, { strong: true }),
  );
  return {
    statements: new Set(affected.map((t) => t.statementId)).size,
    transactions: affected.length,
  };
}
