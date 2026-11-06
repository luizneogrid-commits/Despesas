/**
 * Decodifica arquivos de texto de bancos: UTF-8 quando válido; senão
 * Windows-1252 (padrão de muitos OFX/CSV brasileiros, com acentos em Latin-1).
 */
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder('ascii').decode(bytes.slice(0, 400));
  if (
    /CHARSET:\s*(1252|ISO-8859-1|8859)/i.test(head) ||
    /encoding="(windows-1252|iso-8859-1)"/i.test(head)
  ) {
    return new TextDecoder('windows-1252').decode(bytes);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
