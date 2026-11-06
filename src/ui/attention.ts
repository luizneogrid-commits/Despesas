import { useMemo } from 'react';
import { useFolder } from '../pwa/folderWatch';
import { pendingMerchants } from '../services/mappings';
import { useAppStore } from '../store/appStore';
import { useQueue } from './importQueue';
import type { Route } from './route';

export interface AttentionItem {
  id: 'revisar' | 'de-para' | 'pasta';
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
  const queue = useQueue((s) => s.items);
  const folderStatus = useFolder((s) => s.status);
  const folderName = useFolder((s) => s.folderName);
  const pending = useMemo(() => pendingMerchants(transactions), [transactions]);

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
  }, [queue, pending, folderStatus, folderName]);
}
