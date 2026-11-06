/**
 * Oferece um arquivo para download. Dentro de um Artifact do Claude usa a
 * capacidade "downloads" (o sandbox bloqueia <a download>); fora dele, usa
 * o download padrão do navegador.
 */
interface DownloadsApi {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}
interface ClaudeHost {
  use?: (name: string) => Promise<unknown>;
}

export type SaveOutcome = 'salvo' | 'cancelado' | 'indisponivel';

export async function saveFile(
  filename: string,
  content: string,
  mime: string,
): Promise<SaveOutcome> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host?.use) {
    try {
      const downloads = (await host.use('downloads')) as DownloadsApi | null;
      if (downloads) {
        await downloads.save({ filename, data: content });
        return 'salvo';
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'declined') return 'cancelado';
    }
    return 'indisponivel';
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'salvo';
}
