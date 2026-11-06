import { formatYearMonth, weekday } from '../domain/dates';
import { formatBRL, formatPercent } from '../domain/money';
import type { Category, CategoryId, Transaction } from '../domain/types';
import type { CategoryStat, Summary } from './aggregate';
import type { CashflowSummary } from './cashflow';
import type { InstallmentOutlook } from './installments';
import type { Subscription } from './recurring';

export type InsightTone = 'neutro' | 'atencao' | 'positivo';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  categoryId?: CategoryId;
  /** Tela com o próximo passo sugerido. */
  action?: 'de-para' | 'parcelas';
}

interface Input {
  stats: CategoryStat[];
  summary: Summary;
  categories: Map<CategoryId, Category>;
  spend: Transaction[];
  subscriptions: Subscription[];
  outlook: InstallmentOutlook;
  /** Fluxo da conta corrente no período (quando há extratos). */
  cashflow?: CashflowSummary;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildInsights({
  stats,
  summary,
  categories,
  spend,
  subscriptions,
  outlook,
  cashflow,
}: Input): Insight[] {
  const out: Insight[] = [];
  if (cashflow && cashflow.inCents > 0) {
    const outgoing = cashflow.spendCents + cashflow.cardPaymentCents;
    const left = cashflow.inCents - outgoing;
    out.push(
      left >= 0
        ? {
            id: 'cashflow',
            tone: 'positivo',
            title: `Sobraram ${formatBRL(left)} na conta`,
            detail: `Entraram ${formatBRL(cashflow.inCents)} e saíram ${formatBRL(outgoing)} em gastos e pagamento de fatura${cashflow.savedCents > 0 ? `; ${formatBRL(cashflow.savedCents)} foram para aplicações` : ''}.`,
          }
        : {
            id: 'cashflow',
            tone: 'atencao',
            title: `Saiu ${formatBRL(-left)} a mais do que entrou`,
            detail: `Entraram ${formatBRL(cashflow.inCents)} e saíram ${formatBRL(outgoing)} em gastos e pagamento de fatura no período.`,
          },
    );
  }
  const name = (id: CategoryId) => categories.get(id)?.name ?? id;
  const stat = (id: CategoryId) => stats.find((s) => s.categoryId === id);
  const total = summary.totalCents;
  if (total <= 0) return out;

  const top = stats.find((s) => s.categoryId !== 'outros' && s.totalCents > 0);
  if (top) {
    out.push({
      id: 'top',
      tone: 'neutro',
      title: `${name(top.categoryId)} lidera com ${formatPercent(top.share)} do gasto`,
      detail: `${formatBRL(top.totalCents)} em ${plural(top.count, 'compra', 'compras')}, ticket médio de ${formatBRL(top.avgTicketCents)}.`,
      categoryId: top.categoryId,
    });
  }

  if (summary.feesCents > 0) {
    out.push({
      id: 'fees',
      tone: 'atencao',
      title: `${formatBRL(summary.feesCents)} pagos em juros, IOF e tarifas`,
      detail:
        'É o custo do crédito: não compra nada. Pagar a fatura integral evita juros; o IOF aparece em compras internacionais.',
      categoryId: 'tarifas',
    });
  }

  const delivery = stat('delivery');
  const restaurants = stat('restaurantes');
  const eatOut = (delivery?.totalCents ?? 0) + (restaurants?.totalCents ?? 0);
  if (eatOut > 0 && eatOut / total >= 0.08) {
    const share = eatOut / total;
    const parts: string[] = [];
    if (delivery && delivery.totalCents > 0) {
      parts.push(
        `delivery ${formatBRL(delivery.totalCents)} em ${plural(delivery.count, 'pedido', 'pedidos')} (média ${formatBRL(delivery.avgTicketCents)})`,
      );
    }
    if (restaurants && restaurants.totalCents > 0)
      parts.push(`restaurantes e cafés ${formatBRL(restaurants.totalCents)}`);
    out.push({
      id: 'eat-out',
      tone: share >= 0.25 ? 'atencao' : 'neutro',
      title: `Comer fora é ${formatPercent(share)} do seu gasto`,
      detail: `${parts.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()),
      categoryId:
        delivery && delivery.totalCents >= (restaurants?.totalCents ?? 0)
          ? 'delivery'
          : 'restaurantes',
    });
  }

  const rides = stat('mobilidade');
  if (rides && rides.count >= 3) {
    const perMonth =
      summary.monthCount > 1
        ? `, cerca de ${Math.round(rides.count / summary.monthCount)} por mês`
        : '';
    out.push({
      id: 'rides',
      tone: 'neutro',
      title: `${plural(rides.count, 'corrida', 'corridas')} por app${perMonth}`,
      detail: `${formatBRL(rides.totalCents)} no total, média de ${formatBRL(rides.avgTicketCents)} por corrida.`,
      categoryId: 'mobilidade',
    });
  }

  if (subscriptions.length > 0) {
    const monthly = subscriptions.reduce((a, s) => a + s.monthlyCents, 0);
    const names = subscriptions
      .slice(0, 3)
      .map((s) => s.name)
      .join(', ');
    out.push({
      id: 'subs',
      tone: 'neutro',
      title: `${plural(subscriptions.length, 'assinatura', 'assinaturas')} somam ${formatBRL(monthly)} por mês`,
      detail: `${formatBRL(monthly * 12)} por ano. As maiores: ${names}. Vale revisar o que você não usa.`,
    });
  }

  const changes = stats
    .filter((s) => s.previousCents !== undefined && (s.previousCents ?? 0) >= 5000)
    .map((s) => ({
      s,
      diff: s.totalCents - (s.previousCents ?? 0),
      ratio: (s.totalCents - (s.previousCents ?? 0)) / (s.previousCents ?? 1),
    }))
    .filter((c) => Math.abs(c.diff) >= 5000 && Math.abs(c.ratio) >= 0.2);
  const up = [...changes].sort((a, b) => b.diff - a.diff)[0];
  if (up && up.diff > 0) {
    out.push({
      id: 'up',
      tone: 'atencao',
      title: `${name(up.s.categoryId)} subiu ${formatPercent(up.ratio)}`,
      detail: `De ${formatBRL(up.s.previousCents ?? 0)} para ${formatBRL(up.s.totalCents)} em relação ao período anterior.`,
      categoryId: up.s.categoryId,
    });
  }
  const down = [...changes].sort((a, b) => a.diff - b.diff)[0];
  if (down && down.diff < 0) {
    out.push({
      id: 'down',
      tone: 'positivo',
      title: `${name(down.s.categoryId)} caiu ${formatPercent(-down.ratio)}`,
      detail: `De ${formatBRL(down.s.previousCents ?? 0)} para ${formatBRL(down.s.totalCents)} em relação ao período anterior.`,
      categoryId: down.s.categoryId,
    });
  }

  if (outlook.totalRemainingCents > 0) {
    const last = outlook.plans
      .map((p) => p.endsMonth)
      .sort()
      .at(-1);
    out.push({
      id: 'installments',
      tone: 'neutro',
      action: 'parcelas',
      title: `${formatBRL(outlook.totalRemainingCents)} já comprometidos em parcelas`,
      detail: `${plural(outlook.plans.length, 'compra parcelada', 'compras parceladas')} em andamento${last ? `; a última termina em ${formatYearMonth(last)}` : ''}.`,
    });
  }

  const leisure = spend.filter(
    (t) => ['restaurantes', 'delivery', 'lazer'].includes(t.categoryId) && t.kind === 'compra',
  );
  if (leisure.length >= 6) {
    const weekend = leisure.filter((t) => [0, 5, 6].includes(weekday(t.date)));
    const sum = (arr: Transaction[]) => arr.reduce((a, t) => a + t.amountCents, 0);
    const share = sum(weekend) / Math.max(1, sum(leisure));
    if (share >= 0.55) {
      out.push({
        id: 'weekend',
        tone: 'neutro',
        title: `${formatPercent(share)} do lazer e comida fora cai de sexta a domingo`,
        detail:
          'Definir um teto para o fim de semana costuma ser a forma mais simples de controlar essas categorias.',
      });
    }
  }

  const pix = stat('pix-enviado');
  if (pix && pix.share >= 0.1) {
    out.push({
      id: 'pix',
      tone: 'atencao',
      title: `${formatPercent(pix.share)} do gasto são Pix e transferências sem destino definido`,
      detail: `${formatBRL(pix.totalCents)} em ${plural(pix.count, 'envio', 'envios')}. Diga no de/para o que é cada destinatário (aluguel, diarista, academia…) e o perfil fica mais fiel.`,
      action: 'de-para',
    });
  }

  const unclassified = stat('outros');
  if (unclassified && unclassified.share >= 0.08) {
    out.push({
      id: 'unclassified',
      tone: 'atencao',
      title: `${formatPercent(unclassified.share)} do gasto está sem categoria`,
      detail: `${plural(unclassified.count, 'lançamento', 'lançamentos')} em "Outros". Mapeie no de/para: vale para o que já foi importado e para as próximas faturas.`,
      action: 'de-para',
    });
  }

  if (summary.internationalCents > 0) {
    out.push({
      id: 'intl',
      tone: 'neutro',
      title: `${formatBRL(summary.internationalCents)} em compras internacionais`,
      detail: 'Inclui serviços cobrados em dólar ou euro. Sobre elas incide IOF de 3,5%.',
    });
  }

  return out;
}
