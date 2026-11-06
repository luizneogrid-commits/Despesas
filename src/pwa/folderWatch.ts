/**
 * Pasta monitorada: o usuário escolhe uma pasta (ex.: Downloads/Faturas) e,
 * enquanto o app estiver aberto, cada PDF/OFX/CSV novo salvo nela é lido e
 * importado automaticamente.
 *
 * Usa a File System Access API (Chrome/Edge no computador). O acesso à pasta
 * fica guardado no IndexedDB; o navegador pode pedir a permissão de novo a
 * cada visita. Detecta arquivos novos com FileSystemObserver quando existe e,
 * senão, verificando a pasta a cada poucos segundos. Só lê: nunca altera nem
 * apaga arquivos.
 */
import { create } from 'zustand';
import { formatYearMonth } from '../domain/dates';
import { kvDelete, kvGet, kvSet } from '../storage/db';
import { navigate } from '../ui/route';
import { useUiStore } from '../ui/uiStore';
import {
  addFiles,
  autoListeners,
  setAutoMode,
  setFolderPassword,
  type AutoEvent,
  type AutoMode,
} from '../ui/importQueue';

const ACCEPT = /\.(pdf|ofx|qfx|csv)$/i;
const POLL_MS = 5000;
const POLL_WITH_OBSERVER_MS = 30000;
const MAX_SEEN = 3000;

interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}
interface DirHandleLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileHandleLike | { kind: 'directory'; name: string }>;
  queryPermission?(o: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'read' }): Promise<PermissionState>;
}

export type FolderStatus = 'desligado' | 'precisa-permissao' | 'monitorando' | 'erro';

export interface LogEntry {
  time: string;
  fileName: string;
  type: AutoEvent['type'] | 'encontrado';
  detail?: string;
}

interface Config {
  mode: AutoMode;
  notify: boolean;
  password?: string;
}

interface FolderState {
  supported: boolean;
  status: FolderStatus;
  folderName?: string;
  lastScan?: string;
  error?: string;
  log: LogEntry[];
  mode: AutoMode;
  notify: boolean;
  hasPassword: boolean;
  /** Arquivos que já estavam na pasta ao conectar: importar ou ignorar? */
  initial?: { count: number };
}

export const useFolder = create<FolderState>()(() => ({
  // Dentro de iframes restritos (ex.: Artifact do Claude) o seletor de pasta é bloqueado.
  supported:
    typeof window !== 'undefined' && 'showDirectoryPicker' in window && window.top === window,
  status: 'desligado',
  log: [],
  mode: 'quando-confere',
  notify: false,
  hasPassword: false,
}));

let handle: DirHandleLike | null = null;
let seen = new Set<string>();
let timer: ReturnType<typeof setInterval> | undefined;
let observer: { disconnect(): void } | undefined;
let scanning = false;
let initialFiles: Array<{ key: string; file: File }> = [];

const keyOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

async function save<T>(key: string, value: T) {
  try {
    await kvSet(key, value);
  } catch {
    // Sem IndexedDB (ou handle não clonável): segue em memória.
  }
}

function pushLog(entry: Omit<LogEntry, 'time'>) {
  const log = [{ ...entry, time: new Date().toISOString() }, ...useFolder.getState().log].slice(
    0,
    30,
  );
  useFolder.setState({ log });
  void save('pasta:log', log);
}

async function listFiles(dir: DirHandleLike): Promise<Array<{ key: string; file: File }>> {
  const out: Array<{ key: string; file: File }> = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file' || !ACCEPT.test(entry.name) || entry.name.startsWith('.')) continue;
    const file = await (entry as FileHandleLike).getFile();
    // Arquivo ainda sendo salvo (download em andamento): pega na próxima volta.
    if (file.size === 0 || Date.now() - file.lastModified < 1500) continue;
    out.push({ key: keyOf(file), file });
  }
  return out.sort((a, b) => a.file.lastModified - b.file.lastModified);
}

function remember(keys: string[]) {
  for (const k of keys) seen.add(k);
  if (seen.size > MAX_SEEN) seen = new Set([...seen].slice(-MAX_SEEN));
  void save('pasta:vistos', [...seen]);
}

/** Verifica a pasta agora e importa o que for novo. Retorna quantos arquivos novos. */
export async function scanNow(): Promise<number> {
  if (!handle || scanning || useFolder.getState().status !== 'monitorando') return 0;
  scanning = true;
  try {
    const files = await listFiles(handle);
    // Os que já estavam na pasta esperam a decisão do usuário (importar ou ignorar).
    const waiting = new Set(initialFiles.map((f) => f.key));
    const fresh = files.filter((f) => !seen.has(f.key) && !waiting.has(f.key));
    useFolder.setState({ lastScan: new Date().toISOString(), error: undefined });
    if (fresh.length === 0) return 0;
    remember(fresh.map((f) => f.key));
    addFiles(
      fresh.map((f) => f.file),
      { origin: 'pasta', autoCommit: true },
    );
    return fresh.length;
  } catch (err) {
    // Permissão revogada ou pasta removida.
    useFolder.setState({
      status: 'precisa-permissao',
      error: err instanceof Error ? err.message : 'Não foi possível ler a pasta.',
    });
    stopLoop();
    return 0;
  } finally {
    scanning = false;
  }
}

function stopLoop() {
  if (timer) clearInterval(timer);
  timer = undefined;
  observer?.disconnect();
  observer = undefined;
}

function setPoll(ms: number) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void scanNow();
  }, ms);
}

function startLoop() {
  stopLoop();
  // Verificação periódica sempre; com o observador nativo funcionando, fica só como reserva.
  setPoll(POLL_MS);
  const Observer = (
    window as unknown as {
      FileSystemObserver?: new (cb: () => void) => {
        observe(h: unknown): Promise<void>;
        disconnect(): void;
      };
    }
  ).FileSystemObserver;
  if (!Observer || !handle) return;
  try {
    const obs = new Observer(() => {
      // Espera o arquivo terminar de ser gravado antes de ler.
      setTimeout(() => void scanNow(), 1800);
    });
    obs
      .observe(handle)
      .then(() => {
        observer = obs;
        setPoll(POLL_WITH_OBSERVER_MS);
      })
      .catch(() => obs.disconnect());
  } catch {
    // Sem observador: segue verificando a cada poucos segundos.
  }
}

async function begin(dir: DirHandleLike, opts: { fresh: boolean }) {
  handle = dir;
  useFolder.setState({ status: 'monitorando', folderName: dir.name, error: undefined });
  if (opts.fresh) {
    // Primeira conexão: pergunta o que fazer com o que já está na pasta.
    initialFiles = (await listFiles(dir)).filter((f) => !seen.has(f.key));
    if (initialFiles.length > 0) useFolder.setState({ initial: { count: initialFiles.length } });
  } else {
    void scanNow();
  }
  startLoop();
}

/** Escolher a pasta (precisa de um clique do usuário). */
export async function connectFolder(): Promise<void> {
  const picker = (
    window as unknown as { showDirectoryPicker?: (o: object) => Promise<DirHandleLike> }
  ).showDirectoryPicker;
  if (!picker) return;
  try {
    const dir = await picker({ id: 'raio-x-faturas', mode: 'read' });
    seen = new Set();
    void save('pasta:handle', dir);
    void save('pasta:vistos', []);
    pushLog({ fileName: dir.name, type: 'encontrado', detail: 'pasta conectada' });
    await begin(dir, { fresh: true });
  } catch (err) {
    if ((err as { name?: string })?.name !== 'AbortError') {
      useFolder.setState({ status: 'erro', error: 'Não foi possível abrir a pasta.' });
    }
  }
}

/** O que fazer com os arquivos que já estavam na pasta ao conectar. */
export function handleInitial(choice: 'importar' | 'ignorar') {
  const files = initialFiles;
  initialFiles = [];
  useFolder.setState({ initial: undefined });
  remember(files.map((f) => f.key));
  if (choice === 'importar' && files.length) {
    addFiles(
      files.map((f) => f.file),
      { origin: 'pasta', autoCommit: true },
    );
  }
}

/** Retoma após recarregar a página (o navegador pode exigir um clique para reautorizar). */
export async function resumeFolder(): Promise<void> {
  if (!handle) return;
  try {
    const state = (await handle.requestPermission?.({ mode: 'read' })) ?? 'granted';
    if (state === 'granted') await begin(handle, { fresh: false });
  } catch {
    useFolder.setState({ status: 'precisa-permissao' });
  }
}

export async function disconnectFolder(): Promise<void> {
  stopLoop();
  handle = null;
  initialFiles = [];
  useFolder.setState({
    status: 'desligado',
    folderName: undefined,
    initial: undefined,
    lastScan: undefined,
  });
  try {
    await kvDelete('pasta:handle');
  } catch {
    // ignore
  }
}

export function setMode(mode: AutoMode) {
  setAutoMode(mode);
  useFolder.setState({ mode });
  void persistConfig();
}

export async function setNotify(on: boolean) {
  if (on && 'Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission().catch(() => 'denied');
  }
  const granted = 'Notification' in window && Notification.permission === 'granted';
  useFolder.setState({ notify: on && granted });
  void persistConfig();
}

let storedPassword: string | undefined;
/** Senha dos PDFs da pasta. Guardada no aparelho só se o usuário pedir. */
export function setPassword(password: string, rememberIt: boolean) {
  storedPassword = rememberIt ? password || undefined : undefined;
  setFolderPassword(password);
  useFolder.setState({ hasPassword: Boolean(password) });
  void persistConfig();
}

async function persistConfig() {
  const { mode, notify } = useFolder.getState();
  const config: Config = { mode, notify, ...(storedPassword ? { password: storedPassword } : {}) };
  await save('pasta:config', config);
}

function describeEvent(e: AutoEvent): string {
  if (e.type === 'importado') {
    const st = e.draft.statement;
    const what =
      st.accountType === 'conta'
        ? `extrato: ${e.draft.transactions.length} movimentações novas`
        : `fatura de ${formatYearMonth(st.referenceMonth)}: ${e.draft.transactions.length} lançamentos`;
    return what;
  }
  if (e.type === 'duplicado') return 'já tinha sido importado';
  return e.reason;
}

function onAutoEvent(e: AutoEvent) {
  pushLog({ fileName: e.fileName, type: e.type, detail: describeEvent(e) });
  if (document.visibilityState === 'visible' && (e.type === 'importado' || e.type === 'revisar')) {
    useUiStore.getState().toast(
      e.type === 'importado'
        ? { message: `Importado da pasta: ${describeEvent(e)}.` }
        : {
            message: `${e.fileName} precisa de revisão (${describeEvent(e)}).`,
            action: { label: 'Revisar', run: () => navigate('importar') },
          },
      6000,
    );
  }
  const { notify } = useFolder.getState();
  if (
    notify &&
    document.visibilityState !== 'visible' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    const title =
      e.type === 'importado'
        ? 'Importado automaticamente'
        : e.type === 'revisar'
          ? 'Arquivo precisa de revisão'
          : 'Raio-X da Fatura';
    try {
      new Notification(title, { body: `${e.fileName}: ${describeEvent(e)}`, tag: 'raio-x-pasta' });
    } catch {
      // ignore
    }
  }
}

/** Restaura a pasta e as preferências salvas (chamado na abertura do app). */
export async function restoreFolder(): Promise<void> {
  autoListeners.add(onAutoEvent);
  try {
    const [saved, vistos, config, log] = await Promise.all([
      kvGet<DirHandleLike>('pasta:handle'),
      kvGet<string[]>('pasta:vistos'),
      kvGet<Config>('pasta:config'),
      kvGet<LogEntry[]>('pasta:log'),
    ]);
    if (config) {
      setAutoMode(config.mode);
      if (config.password) {
        storedPassword = config.password;
        setFolderPassword(config.password);
      }
      useFolder.setState({
        mode: config.mode,
        notify: config.notify,
        hasPassword: Boolean(config.password),
      });
    }
    if (log) useFolder.setState({ log });
    if (vistos) seen = new Set(vistos);
    if (!saved || !useFolder.getState().supported) return;
    handle = saved;
    useFolder.setState({ folderName: saved.name });
    const state = (await saved.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (state === 'granted') await begin(saved, { fresh: false });
    else useFolder.setState({ status: 'precisa-permissao' });
  } catch {
    // Sem armazenamento: nada a restaurar.
  }
}
