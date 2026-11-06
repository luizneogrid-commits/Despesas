import { useEffect, useState } from 'react';

export const ROUTES = [
  'visao-geral',
  'lancamentos',
  'parcelas',
  'de-para',
  'importar',
  'dados',
] as const;

/** Endereços antigos que continuam funcionando. */
const ALIASES: Record<string, Route> = { regras: 'de-para', categorias: 'de-para' };
export type Route = (typeof ROUTES)[number];

/** Mesmos nomes no computador e no celular. */
export const ROUTE_LABELS: Record<Route, string> = {
  'visao-geral': 'Início',
  lancamentos: 'Lançamentos',
  parcelas: 'Parcelas',
  'de-para': 'De/para',
  importar: 'Importar',
  dados: 'Dados',
};

function current(): Route {
  const h = window.location.hash.replace(/^#/, '');
  if (ALIASES[h]) return ALIASES[h];
  return (ROUTES as readonly string[]).includes(h) ? (h as Route) : 'visao-geral';
}

/** Roteamento por hash simples (#visao-geral, #lancamentos…), compatível com hospedagem estática. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(current);
  useEffect(() => {
    const onChange = () => {
      setRoute(current());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(route: Route) {
  if (window.location.hash !== `#${route}`) window.location.hash = route;
}
