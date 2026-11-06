// Reescreve caracteres de controle literais dentro de strings JS como \xNN,
// sem mudar o significado do código (verificado comparando as ASTs). Alguns
// hosts recusam arquivos de texto com bytes de controle (ex.: ESC no worker do pdf.js).
import { parse, tokenizer } from 'acorn';

const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u2028\u2029]/;
const opts = { ecmaVersion: 'latest', sourceType: 'module' };

function escapeChar(c) {
  const code = c.charCodeAt(0);
  return code > 0xff
    ? `\\u${code.toString(16).padStart(4, '0')}`
    : `\\x${code.toString(16).padStart(2, '0')}`;
}

function escapeLiteral(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '\\') {
      const next = raw[i + 1];
      // "\<controle>" (escape de identidade) vira só "\xNN".
      if (next !== undefined && CONTROL.test(next)) {
        out += escapeChar(next);
      } else {
        out += c + (next ?? '');
      }
      i++;
      continue;
    }
    out += CONTROL.test(c) ? escapeChar(c) : c;
  }
  return out;
}

function strip(ast) {
  return JSON.stringify(ast, (k, v) =>
    k === 'start' || k === 'end' || k === 'raw' ? undefined : v,
  );
}

export function escapeControlChars(src) {
  const ast = parse(src, opts);
  // Templates com tag podem ler o texto "cru": não mexemos se houver controle neles.
  let unsafe = false;
  (function walk(n) {
    if (!n || typeof n !== 'object' || unsafe) return;
    if (
      n.type === 'TaggedTemplateExpression' &&
      n.quasi.quasis.some((q) => CONTROL.test(q.value.raw))
    )
      unsafe = true;
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
    }
  })(ast);
  if (unsafe) throw new Error('Template com tag contém caracteres de controle; abortando.');

  let out = '';
  let last = 0;
  for (const tok of tokenizer(src, opts)) {
    const label = tok.type.label;
    if (label !== 'string' && label !== 'template' && label !== 'regexp') continue;
    const raw = src.slice(tok.start, tok.end);
    if (!CONTROL.test(raw)) continue;
    out += src.slice(last, tok.start) + escapeLiteral(raw);
    last = tok.end;
  }
  out += src.slice(last);

  if (CONTROL.test(out.replace(/[\t\n\r]/g, '')))
    throw new Error('Restaram caracteres de controle fora de literais.');
  if (strip(parse(out, opts)) !== strip(ast))
    throw new Error('A AST mudou após o escape; abortando.');
  return out;
}
