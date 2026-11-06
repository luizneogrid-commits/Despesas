/** "R$ 2 mil", "R$ 750": rótulos de eixo compactos. */
export function axisBRL(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1000) {
    return `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }
  return `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
}
