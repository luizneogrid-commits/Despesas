/**
 * Nomes de lugares que aparecem nas faturas junto do estabelecimento.
 *
 * A descrição que o banco imprime vem do campo "nome/cidade/país" da
 * transação (ISO 8583, DE43): ~22 caracteres de nome, 13 de cidade e 2–3 de
 * país. Por isso a cidade costuma vir cortada ("BELO HORIZONT") e às vezes
 * grudada no nome ("HELP.UBER.COSAO PAULO BR"). Esta lista serve para
 * reconhecer e separar essa parte, que não identifica o estabelecimento.
 */
import { normalizeText } from '../categorization/normalize';

/** Cidades brasileiras mais frequentes em faturas (capitais + maiores municípios). */
const BR_CITIES = [
  // capitais
  'SAO PAULO',
  'RIO DE JANEIRO',
  'BELO HORIZONTE',
  'BRASILIA',
  'SALVADOR',
  'FORTALEZA',
  'RECIFE',
  'CURITIBA',
  'PORTO ALEGRE',
  'MANAUS',
  'BELEM',
  'GOIANIA',
  'SAO LUIS',
  'MACEIO',
  'NATAL',
  'TERESINA',
  'JOAO PESSOA',
  'ARACAJU',
  'CAMPO GRANDE',
  'CUIABA',
  'FLORIANOPOLIS',
  'VITORIA',
  'PORTO VELHO',
  'MACAPA',
  'BOA VISTA',
  'PALMAS',
  'RIO BRANCO',
  // SP
  'GUARULHOS',
  'CAMPINAS',
  'SAO BERNARDO DO CAMPO',
  'SANTO ANDRE',
  'OSASCO',
  'SAO JOSE DOS CAMPOS',
  'RIBEIRAO PRETO',
  'SOROCABA',
  'SANTOS',
  'MAUA',
  'SAO JOSE DO RIO PRETO',
  'MOGI DAS CRUZES',
  'DIADEMA',
  'JUNDIAI',
  'PIRACICABA',
  'CARAPICUIBA',
  'BAURU',
  'ITAQUAQUECETUBA',
  'SAO VICENTE',
  'FRANCA',
  'PRAIA GRANDE',
  'GUARUJA',
  'TAUBATE',
  'LIMEIRA',
  'SUZANO',
  'TABOAO DA SERRA',
  'SUMARE',
  'BARUERI',
  'EMBU DAS ARTES',
  'SAO CARLOS',
  'MARILIA',
  'INDAIATUBA',
  'COTIA',
  'AMERICANA',
  'JACAREI',
  'ARARAQUARA',
  'PRESIDENTE PRUDENTE',
  'HORTOLANDIA',
  'SANTANA DE PARNAIBA',
  'RIO CLARO',
  'ARACATUBA',
  'FERRAZ DE VASCONCELOS',
  'ITAPEVI',
  'VALINHOS',
  'VINHEDO',
  'PAULINIA',
  'ATIBAIA',
  'BRAGANCA PAULISTA',
  'ITU',
  'SAO CAETANO DO SUL',
  'FRANCISCO MORATO',
  'ITAPECERICA DA SERRA',
  'MOGI GUACU',
  'BOTUCATU',
  'CAMPOS DO JORDAO',
  'UBATUBA',
  'CARAGUATATUBA',
  'SAO SEBASTIAO',
  'ILHABELA',
  'BERTIOGA',
  'ALPHAVILLE',
  // RJ, MG, ES
  'NITEROI',
  'SAO GONCALO',
  'DUQUE DE CAXIAS',
  'NOVA IGUACU',
  'PETROPOLIS',
  'VOLTA REDONDA',
  'MACAE',
  'CABO FRIO',
  'ANGRA DOS REIS',
  'BUZIOS',
  'ARMACAO DOS BUZIOS',
  'PARATY',
  'TERESOPOLIS',
  'NOVA FRIBURGO',
  'CAMPOS DOS GOYTACAZES',
  'BELFORD ROXO',
  'SAO JOAO DE MERITI',
  'RESENDE',
  'UBERLANDIA',
  'CONTAGEM',
  'JUIZ DE FORA',
  'BETIM',
  'MONTES CLAROS',
  'RIBEIRAO DAS NEVES',
  'UBERABA',
  'GOVERNADOR VALADARES',
  'IPATINGA',
  'SETE LAGOAS',
  'DIVINOPOLIS',
  'NOVA LIMA',
  'POCOS DE CALDAS',
  'VILA VELHA',
  'SERRA',
  'CARIACICA',
  'GUARAPARI',
  // Sul
  'LONDRINA',
  'MARINGA',
  'PONTA GROSSA',
  'CASCAVEL',
  'SAO JOSE DOS PINHAIS',
  'FOZ DO IGUACU',
  'COLOMBO',
  'GUARAPUAVA',
  'JOINVILLE',
  'BLUMENAU',
  'SAO JOSE',
  'CHAPECO',
  'ITAJAI',
  'CRICIUMA',
  'BALNEARIO CAMBORIU',
  'PALHOCA',
  'CAXIAS DO SUL',
  'PELOTAS',
  'CANOAS',
  'SANTA MARIA',
  'GRAVATAI',
  'NOVO HAMBURGO',
  'SAO LEOPOLDO',
  'GRAMADO',
  'CANELA',
  'BENTO GONCALVES',
  'PASSO FUNDO',
  // Centro-Oeste, Norte, Nordeste
  'APARECIDA DE GOIANIA',
  'ANAPOLIS',
  'TAGUATINGA',
  'CEILANDIA',
  'AGUAS CLARAS',
  'VARZEA GRANDE',
  'DOURADOS',
  'RONDONOPOLIS',
  'ANANINDEUA',
  'SANTAREM',
  'JABOATAO DOS GUARARAPES',
  'OLINDA',
  'CARUARU',
  'PETROLINA',
  'PAULISTA',
  'FEIRA DE SANTANA',
  'VITORIA DA CONQUISTA',
  'CAMACARI',
  'ILHEUS',
  'PORTO SEGURO',
  'LAURO DE FREITAS',
  'CAUCAIA',
  'JUAZEIRO DO NORTE',
  'CAMPINA GRANDE',
  'MOSSORO',
  'PARNAMIRIM',
  'IMPERATRIZ',
  'ARAPIRACA',
];

/** Cidades estrangeiras comuns em cobranças online (só tiradas com reforço: país, coluna, repetição). */
const FOREIGN_CITIES = [
  'SAN FRANCISCO',
  'SAN JOSE',
  'MOUNTAIN VIEW',
  'MENLO PARK',
  'PALO ALTO',
  'CUPERTINO',
  'SEATTLE',
  'REDMOND',
  'LOS ANGELES',
  'LOS GATOS',
  'NEW YORK',
  'MIAMI',
  'ORLANDO',
  'BOSTON',
  'CHICAGO',
  'AUSTIN',
  'DALLAS',
  'LONDON',
  'LONDRES',
  'DUBLIN',
  'AMSTERDAM',
  'LUXEMBOURG',
  'LUXEMBURGO',
  'PARIS',
  'BERLIN',
  'MADRID',
  'BARCELONA',
  'LISBOA',
  'LISBON',
  'ROMA',
  'ROME',
  'MILANO',
  'ZURICH',
  'GENEVA',
  'STOCKHOLM',
  'TORONTO',
  'VANCOUVER',
  'BUENOS AIRES',
  'SANTIAGO',
  'MONTEVIDEO',
  'LIMA',
  'BOGOTA',
  'CIDADE DO MEXICO',
  'MEXICO CITY',
  'TOKYO',
  'SINGAPORE',
  'SINGAPURA',
  'HONG KONG',
  'SHENZHEN',
  'SYDNEY',
];

/**
 * Nomes de cidade que também são palavras comuns ou nomes de lojas
 * ("NATAL", "SERRA", "PAULISTA"…): só contam como lugar com reforço.
 */
const AMBIGUOUS = new Set([
  'NATAL',
  'VITORIA',
  'PALMAS',
  'SERRA',
  'FRANCA',
  'SANTOS',
  'CANOAS',
  'COLOMBO',
  'PAULISTA',
  'SAO JOSE',
  'CANELA',
  'SANTA MARIA',
  'BOA VISTA',
  'CAMPO GRANDE',
  'ITU',
  'LIMA',
  'SANTIAGO',
  'PARIS',
  'ROMA',
  'SAN JOSE',
  'MAUA',
  'COTIA',
  'OLINDA',
  'GRAMADO',
  'PORTO SEGURO',
  'PARATY',
  'BUZIOS',
  'SAO VICENTE',
  'SAO SEBASTIAO',
]);

/** Siglas de estado. */
export const UF = new Set([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]);

/** Códigos de país que não se confundem com palavras ao fim do nome. */
const COUNTRY_SAFE = new Set([
  'BR',
  'BRA',
  'USA',
  'GBR',
  'IRL',
  'NLD',
  'LUX',
  'CAN',
  'ARG',
  'CHL',
  'URY',
  'MEX',
  'JPN',
  'SGP',
  'AUS',
  'DEU',
  'FRA',
  'ESP',
  'PRT',
  'ITA',
  'CHE',
  'SWE',
]);
/** Códigos de 2 letras que só valem depois de uma cidade ("SEATTLE US"). */
const COUNTRY_AFTER_CITY = new Set([
  'US',
  'GB',
  'IE',
  'NL',
  'LU',
  'CA',
  'AR',
  'CL',
  'UY',
  'MX',
  'JP',
  'SG',
  'AU',
  'DE',
  'FR',
  'ES',
  'PT',
  'IT',
  'CH',
  'SE',
  'CN',
  'HK',
]);

/**
 * Palavras genéricas de ramo: "DROGARIA SAO PAULO", "CHURRASCARIA PORTO
 * ALEGRE", "AUTO POSTO BRASILIA" são nomes de loja, não loja + cidade.
 */
const GENERIC_NAME_WORDS = new Set([
  'AUTO',
  'POSTO',
  'DROGARIA',
  'DROGARIAS',
  'FARMACIA',
  'FARMACIAS',
  'PADARIA',
  'PANIFICADORA',
  'CONFEITARIA',
  'MERCADO',
  'SUPERMERCADO',
  'SUPERMERCADOS',
  'MERCADINHO',
  'HIPERMERCADO',
  'ATACADO',
  'ATACADAO',
  'EMPORIO',
  'RESTAURANTE',
  'CHURRASCARIA',
  'PIZZARIA',
  'LANCHONETE',
  'BAR',
  'CAFE',
  'CAFETERIA',
  'SORVETERIA',
  'ACOUGUE',
  'HORTIFRUTI',
  'SACOLAO',
  'HOSPITAL',
  'CLINICA',
  'LABORATORIO',
  'COLEGIO',
  'ESCOLA',
  'FACULDADE',
  'UNIVERSIDADE',
  'LOJA',
  'LOJAS',
  'CASA',
  'CASAS',
  'HOTEL',
  'POUSADA',
  'ACADEMIA',
  'LIVRARIA',
  'PAPELARIA',
  'OTICA',
  'OTICAS',
  'PET',
  'SHOPPING',
  'ESTACIONAMENTO',
  'CONVENIENCIA',
  'BANCO',
  'CLUBE',
  'VIACAO',
  'EXPRESSO',
  'DISTRIBUIDORA',
  'COMERCIO',
  'BAZAR',
  'MATERIAIS',
  'TAXI',
  'CINEMA',
  'TEATRO',
  'MUSEU',
  'DO',
  'DA',
  'DE',
  'DOS',
  'DAS',
  'E',
]);

interface Place {
  tokens: string[];
  ambiguous: boolean;
  foreign: boolean;
}

const PLACES: Place[] = [
  ...BR_CITIES.map((c) => ({ tokens: c.split(' '), ambiguous: AMBIGUOUS.has(c), foreign: false })),
  ...FOREIGN_CITIES.map((c) => ({ tokens: c.split(' '), ambiguous: true, foreign: true })),
].sort((a, b) => b.tokens.join(' ').length - a.tokens.join(' ').length);

/** "SAO PAULO", "BELO HORIZONT" (cortado em 13), "S PAULO"… → nome canônico. */
function matchPlaceAtEnd(
  tokens: string[],
): { length: number; place: Place; truncated: boolean } | null {
  for (const place of PLACES) {
    const n = place.tokens.length;
    if (tokens.length < n) continue;
    const tail = tokens.slice(-n);
    if (tail.join(' ') === place.tokens.join(' ')) return { length: n, place, truncated: false };
    // Cortado pelo limite de 13 caracteres: últimos tokens são prefixo do nome.
    const joined = tail.join(' ');
    const full = place.tokens.join(' ');
    if (
      full.length > 13 &&
      joined.length >= 9 &&
      full.startsWith(joined) &&
      tail[0] === place.tokens[0]
    ) {
      return { length: n, place, truncated: true };
    }
  }
  // Também cortado com menos palavras: "SAO JOSE DOS" (de SAO JOSE DOS CAMPOS)
  for (const place of PLACES) {
    const full = place.tokens.join(' ');
    if (full.length <= 13) continue;
    for (let n = place.tokens.length - 1; n >= 2; n--) {
      if (tokens.length < n) continue;
      const tail = tokens.slice(-n).join(' ');
      if (tail.length >= 10 && full.startsWith(tail) && full.slice(0, 13).trim().startsWith(tail)) {
        return { length: n, place, truncated: true };
      }
    }
  }
  return null;
}

export interface LocationSplit {
  /** Texto sem a parte de lugar. */
  rest: string;
  /** Lugar encontrado (normalizado, ex.: "SAO PAULO SP BR"). */
  location?: string;
}

/**
 * Separa cidade/UF/país do fim de uma descrição. `strong` = há reforço
 * externo (veio de uma coluna de cidade, ou o sufixo se repete no documento),
 * o que permite tirar nomes ambíguos e estrangeiros.
 */
export function splitTrailingLocation(
  text: string,
  opts: { strong?: boolean } = {},
): LocationSplit {
  const norm = normalizeText(text);
  if (!norm) return { rest: text };
  let tokens = norm.split(' ');
  const removed: string[] = [];

  const take = (n: number) => {
    removed.unshift(...tokens.slice(-n));
    tokens = tokens.slice(0, -n);
  };

  // País no fim ("BR", "BRA", "USA").
  const last = tokens.at(-1);
  if (last && COUNTRY_SAFE.has(last) && tokens.length > 1) take(1);
  const countryFound = removed.length > 0;
  // "... SEATTLE US": código de 2 letras antes da cidade estrangeira.
  const maybeCC = tokens.at(-1);
  let ccPending = false;
  if (maybeCC && COUNTRY_AFTER_CITY.has(maybeCC) && tokens.length > 2) {
    const without = tokens.slice(0, -1);
    if (matchPlaceAtEnd(without)) {
      take(1);
      ccPending = true;
    }
  }
  // UF ("CAMPINAS SP").
  const maybeUf = tokens.at(-1);
  let ufFound = false;
  if (maybeUf && UF.has(maybeUf) && tokens.length > 2 && matchPlaceAtEnd(tokens.slice(0, -1))) {
    take(1);
    ufFound = true;
  }
  const place = matchPlaceAtEnd(tokens);
  if (place && tokens.slice(0, -place.length).every((t) => GENERIC_NAME_WORDS.has(t))) {
    // "DROGARIA SAO PAULO": a cidade faz parte do nome; só sai o país/UF, se houver.
    if (removed.length === 0) return { rest: text };
    return { rest: cutOriginal(text, tokens.join(' ')), location: removed.join(' ') };
  }
  if (place && tokens.length - place.length >= 1) {
    const reinforced = opts.strong || countryFound || ccPending || ufFound;
    if ((!place.place.ambiguous && !place.place.foreign) || reinforced) take(place.length);
  }

  // Nada de lugar encontrado além do país: só tira o país se for inequívoco.
  if (removed.length === 0) return { rest: text };
  if (tokens.length === 0 || tokens.join(' ').replace(/[^A-Z]/g, '').length < 2)
    return { rest: text };

  const restNorm = tokens.join(' ');
  return { rest: cutOriginal(text, restNorm), location: removed.join(' ') };
}

/**
 * Corta o texto original (com acentos e pontuação) no ponto equivalente ao
 * texto normalizado restante: mantém "Padaria Real Ltda." em vez de "PADARIA REAL LTDA".
 */
function cutOriginal(original: string, restNorm: string): string {
  const restTokens = restNorm.split(' ');
  let i = 0;
  let matched = 0;
  const words = [...original.matchAll(/[^\s]+/g)];
  for (const w of words) {
    const n = normalizeText(w[0]);
    if (!n) continue;
    const parts = n.split(' ');
    matched += parts.length;
    i = (w.index ?? 0) + w[0].length;
    if (matched >= restTokens.length) break;
  }
  return (
    original
      .slice(0, i)
      .replace(/[\s\-–|,;:]+$/, '')
      .trim() || original
  );
}

/** O texto inteiro é um lugar (ex.: célula da coluna "Cidade", ou "SAO PAULO BR" sozinho)? */
export function isLocationText(text: string, opts: { strong?: boolean } = {}): boolean {
  const norm = normalizeText(text);
  if (!norm) return false;
  let tokens = norm.split(' ');
  if (
    tokens.length === 1 &&
    (COUNTRY_SAFE.has(tokens[0] ?? '') || UF.has(tokens[0] ?? '') || tokens[0] === 'BRASIL')
  ) {
    return true;
  }
  while (
    tokens.length > 1 &&
    (COUNTRY_SAFE.has(tokens.at(-1) ?? '') ||
      COUNTRY_AFTER_CITY.has(tokens.at(-1) ?? '') ||
      UF.has(tokens.at(-1) ?? ''))
  ) {
    tokens = tokens.slice(0, -1);
  }
  const m = matchPlaceAtEnd(tokens);
  if (!m || m.length !== tokens.length) return false;
  return opts.strong || !m.place.ambiguous || tokens.length < norm.split(' ').length;
}

/**
 * Cidade grudada no nome pelo limite de colunas do DE43, com país no fim:
 * "UBER *TRIP HELP.UBER.COSAO PAULO BR" → "UBER *TRIP HELP.UBER.CO" + "SAO PAULO BR".
 */
export function splitGluedLocation(text: string): LocationSplit {
  const base = text.normalize('NFC').replace(/\s+/g, ' ').trim();
  const upper = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const m = /^(.{12,30}?)([A-Z]+(?: [A-Z]+){0,3}) (BR|BRA|USA|US|GB|IE|NL|LU)$/.exec(upper);
  if (!m || !m[1] || !m[2]) return { rest: text };
  // O pedaço grudado precisa terminar com um nome de cidade conhecido.
  const glued = m[2];
  for (const place of PLACES) {
    const full = place.tokens.join(' ');
    const idx = glued.lastIndexOf(full);
    if (idx > 0 && idx + full.length === glued.length) {
      const cut = m[1].length + idx;
      const name = base.slice(0, cut).trim();
      if (name.replace(/[^A-Za-z]/g, '').length >= 3)
        return { rest: name, location: `${full} ${m[3]}` };
    }
  }
  return { rest: text };
}

const COUNTRY_NAMES: Record<string, string> = {
  BR: 'Brasil',
  BRA: 'Brasil',
  US: 'EUA',
  USA: 'EUA',
  GB: 'Reino Unido',
  GBR: 'Reino Unido',
  IE: 'Irlanda',
  IRL: 'Irlanda',
  NL: 'Holanda',
  NLD: 'Holanda',
  LU: 'Luxemburgo',
  LUX: 'Luxemburgo',
  CA: 'Canadá',
  CAN: 'Canadá',
  AR: 'Argentina',
  ARG: 'Argentina',
  CL: 'Chile',
  CHL: 'Chile',
  UY: 'Uruguai',
  URY: 'Uruguai',
  MX: 'México',
  MEX: 'México',
  JP: 'Japão',
  JPN: 'Japão',
  SG: 'Singapura',
  SGP: 'Singapura',
  AU: 'Austrália',
  AUS: 'Austrália',
  DE: 'Alemanha',
  DEU: 'Alemanha',
  FR: 'França',
  FRA: 'França',
  ES: 'Espanha',
  ESP: 'Espanha',
  PT: 'Portugal',
  PRT: 'Portugal',
  IT: 'Itália',
  ITA: 'Itália',
  CH: 'Suíça',
  CHE: 'Suíça',
  SE: 'Suécia',
  SWE: 'Suécia',
  CN: 'China',
  HK: 'Hong Kong',
};

/** Acentos das palavras mais comuns em nomes de cidade (a fatura vem sem acento). */
const ACCENTS: Record<string, string> = {
  SAO: 'São',
  JOSE: 'José',
  JOAO: 'João',
  GONCALO: 'Gonçalo',
  BRASILIA: 'Brasília',
  BELEM: 'Belém',
  GOIANIA: 'Goiânia',
  VITORIA: 'Vitória',
  MACEIO: 'Maceió',
  CUIABA: 'Cuiabá',
  FLORIANOPOLIS: 'Florianópolis',
  MACAPA: 'Macapá',
  LUIS: 'Luís',
  JUNDIAI: 'Jundiaí',
  RIBEIRAO: 'Ribeirão',
  MARILIA: 'Marília',
  ARACATUBA: 'Araçatuba',
  TAUBATE: 'Taubaté',
  GUARUJA: 'Guarujá',
  SUMARE: 'Sumaré',
  TABOAO: 'Taboão',
  PARNAIBA: 'Parnaíba',
  HORTOLANDIA: 'Hortolândia',
  BRAGANCA: 'Bragança',
  JACAREI: 'Jacareí',
  BAURU: 'Bauru',
  CARAGUATATUBA: 'Caraguatatuba',
  NITEROI: 'Niterói',
  PETROPOLIS: 'Petrópolis',
  MACAE: 'Macaé',
  TERESOPOLIS: 'Teresópolis',
  UBERLANDIA: 'Uberlândia',
  DIVINOPOLIS: 'Divinópolis',
  POCOS: 'Poços',
  LONDRINA: 'Londrina',
  MARINGA: 'Maringá',
  IGUACU: 'Iguaçu',
  CHAPECO: 'Chapecó',
  ITAJAI: 'Itajaí',
  CRICIUMA: 'Criciúma',
  BALNEARIO: 'Balneário',
  CAMBORIU: 'Camboriú',
  PALHOCA: 'Palhoça',
  GRAVATAI: 'Gravataí',
  GONCALVES: 'Gonçalves',
  ANAPOLIS: 'Anápolis',
  VARZEA: 'Várzea',
  AGUAS: 'Águas',
  RONDONOPOLIS: 'Rondonópolis',
  SANTAREM: 'Santarém',
  JABOATAO: 'Jaboatão',
  CAMACARI: 'Camaçari',
  ILHEUS: 'Ilhéus',
  MOSSORO: 'Mossoró',
  TERESINA: 'Teresina',
  ARACAJU: 'Aracaju',
  ANANINDEUA: 'Ananindeua',
  MEXICO: 'México',
  BOGOTA: 'Bogotá',
};

function splitCountry(tokens: string[]): { tokens: string[]; country?: string } {
  const last = tokens.at(-1);
  if (!last) return { tokens };
  const isCode = COUNTRY_SAFE.has(last) || (tokens.length > 1 && COUNTRY_AFTER_CITY.has(last));
  if (isCode || last === 'BRASIL')
    return { tokens: tokens.slice(0, -1), country: last === 'BRASIL' ? 'BR' : last };
  return { tokens };
}

/** Lugar estrangeiro (país diferente do Brasil ou cidade de fora)? */
export function isForeignLocation(norm: string): boolean {
  const { tokens, country } = splitCountry(normalizeText(norm).split(' ').filter(Boolean));
  if (country) return COUNTRY_NAMES[country] !== 'Brasil';
  const m = matchPlaceAtEnd(tokens.filter((t) => !UF.has(t)));
  return Boolean(m?.place.foreign && m.length === tokens.length);
}

/** "SAO PAULO SP BR" → "São Paulo - SP"; "BELO HORIZONT" → "Belo Horizonte"; "SEATTLE US" → "Seattle, EUA". */
export function prettyLocation(norm: string): string {
  const split = splitCountry(normalizeText(norm).split(' ').filter(Boolean));
  let tokens = split.tokens;
  const ufs: string[] = [];
  while (tokens.length > 1 && UF.has(tokens.at(-1) ?? '')) {
    ufs.unshift(tokens.at(-1) ?? '');
    tokens = tokens.slice(0, -1);
  }
  if (tokens.length === 1 && UF.has(tokens[0] ?? '')) {
    ufs.unshift(tokens[0] ?? '');
    tokens = [];
  }
  // Nome cortado em 13 caracteres: mostra o nome inteiro, se só houver uma cidade possível.
  const m = matchPlaceAtEnd(tokens);
  if (m && m.length === tokens.length && m.truncated) {
    const cut = tokens.join(' ');
    const options = PLACES.filter((p) => p.tokens.join(' ').startsWith(cut));
    if (options.length === 1) tokens = m.place.tokens;
  }
  const cap = (w: string, i: number) =>
    i > 0 && ['DE', 'DA', 'DO', 'DOS', 'DAS', 'E'].includes(w)
      ? w.toLowerCase()
      : (ACCENTS[w] ?? w.charAt(0) + w.slice(1).toLowerCase());
  const city = tokens.map(cap).join(' ');
  const place = [city, ...ufs].filter(Boolean).join(' - ');
  const countryName = split.country ? COUNTRY_NAMES[split.country] : undefined;
  if (!place) return countryName ?? norm;
  return countryName && countryName !== 'Brasil' ? `${place}, ${countryName}` : place;
}
