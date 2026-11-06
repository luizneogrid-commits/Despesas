/** SHA-256 do arquivo (detecção de importação duplicada). */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Contexto não seguro (http): FNV-1a de 32 bits como reserva.
  let h = 0x811c9dc5;
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return `fnv-${(h >>> 0).toString(16)}-${bytes.length}`;
}
