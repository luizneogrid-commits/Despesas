/**
 * Normalização de descrições de fatura. Faturas brasileiras trazem prefixos
 * de adquirentes/subcredenciadores (PAG*, MP*, EC *, PICPAY*), números de
 * loja, cidade e códigos. Para categorizar e agrupar, reduzimos a descrição a
 * uma forma canônica: maiúsculas, sem acentos e sem pontuação.
 */

/** Prefixos de intermediadores de pagamento que não identificam o estabelecimento. */
const ACQUIRER_PREFIX =
  /^(?:PAG\s?\*|PAGSEGURO\s?\*?|PAGSEG\s?\*|MP\s?\*|MERCADOPAGO\s?\*?|MERCPAGO\s?\*?|PICPAY\s?\*|PP\s?\*|PAYPAL\s?\*|EBANX\s?\*?|EBN\s?\*|DLOCAL\s?\*?|DL\s?\*|SUMUP\s?\*?|SUM\s?UP\s?\*|STONE\s?\*|PG\s?\*|EC\s?\*|IZ\s?\*|HNA\s?\*|ASAAS\s?\*?|PAGARME\s?\*?|ZP\s?\*|CIELO\s?\*|GETNET\s?\*|INFINITEPAY\s?\*?|TON\s?\*)\s*/i;

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Maiúsculas, sem acentos, só letras/dígitos separados por um espaço. */
export function normalizeText(s: string): string {
  return stripAccents(s)
    .toUpperCase()
    .replace(/&/g, ' E ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripAcquirer(description: string): string {
  let out = description.trim();
  // Alguns lançamentos têm dois prefixos (ex.: "PAYPAL *EBANX *SPOTIFY").
  for (let i = 0; i < 2; i++) {
    const next = out.replace(ACQUIRER_PREFIX, '');
    if (next === out || next.length < 2) break;
    out = next;
  }
  return out;
}

const NOISE_TOKENS = new Set([
  'BR',
  'BRA',
  'BRASIL',
  'COM',
  'WWW',
  'LTDA',
  'ME',
  'EIRELI',
  'EPP',
  'S',
  'A',
  'SA',
  'CIA',
  'HELP',
  'TRIP',
  'PENDING',
  'PAGAMENTO',
  'COMPRA',
  'ONLINE',
  'APP',
  'DO',
  'DA',
  'DE',
]);

/**
 * Chave do estabelecimento usada para agrupar e para aprender regras do
 * usuário. Remove intermediadores, parcelas, números e ruídos comuns.
 */
export function merchantKey(description: string): string {
  const base = normalizeText(stripAcquirer(description))
    .replace(/\bPARC(?:ELA)?\s*\d{1,2}\s*(?:DE)?\s*\d{1,2}\b/g, ' ')
    .split(' ')
    .filter((t) => t.length > 0 && !/^\d+$/.test(t));
  const meaningful = base.filter((t) => !NOISE_TOKENS.has(t));
  const tokens = (meaningful.length > 0 ? meaningful : base).slice(0, 4);
  return tokens.join(' ');
}

const LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'br', 'www', 'net']);
const ACRONYMS = new Set([
  'IOF',
  'IFD',
  'UBR',
  'CEA',
  'KFC',
  'AWS',
  'UCI',
  'CVC',
  'TAP',
  'EDP',
  'PSN',
  'GNV',
  'BRT',
  'VLT',
  'CET',
  'SA',
  'ME',
  'SP',
  'RJ',
  'MG',
  'BH',
  'PR',
  'RS',
  'SC',
  'DF',
  'BA',
  'PE',
  'CE',
  'USD',
  'EUR',
  'BRL',
]);

/**
 * Deixa descrições em CAIXA ALTA mais legíveis: "UBER *TRIP HELP.UBER.COM"
 * vira "Uber *Trip Help.Uber.com". Siglas (IOF, SP, IFD) são mantidas.
 */
export function prettifyDescription(description: string): string {
  const clean = description.replace(/\s+/g, ' ').trim();
  const letters = clean.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const upperRatio = letters.length ? letters.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length : 0;
  if (upperRatio < 0.8) return clean; // já está em caixa mista
  return clean.replace(/[A-Za-zÀ-ÿ]+/g, (word) => {
    const lower = word.toLowerCase();
    if (LOWER_WORDS.has(lower)) return lower;
    const upper = word.toUpperCase();
    // Siglas: conhecidas ou sem vogal (IFD, PG, MP).
    if (word.length <= 3 && (ACRONYMS.has(upper) || !/[AEIOUÁÉÍÓÚÂÊÔÃÕ]/.test(upper))) return upper;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

/** Nome de exibição de um estabelecimento sem marca conhecida. */
export function displayMerchant(description: string): string {
  const base = stripAcquirer(description)
    .replace(/\bPARC(?:ELA)?\.?\s*\d{1,2}\s*(?:\/|DE)\s*\d{1,2}\b/gi, ' ')
    .replace(/[\s*#-]+\d[\d\s./-]*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return prettifyDescription(base || description);
}
