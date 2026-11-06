/**
 * Armazenamento local em IndexedDB (chave-valor). Os dados ficam só neste
 * navegador. Se o IndexedDB não estiver disponível (janela anônima, iframe
 * restrito), o app continua funcionando em memória.
 */
const DB_NAME = 'raio-x-fatura';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponível'));
      req.onblocked = () => reject(new Error('IndexedDB bloqueado'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error('Falha no IndexedDB'));
      }),
  );
}

export function kvGet<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>('readonly', (s) => s.get(key));
}

export function kvSet(key: string, value: unknown): Promise<void> {
  return run<void>('readwrite', (s) => s.put(value, key));
}

export function kvDelete(key: string): Promise<void> {
  return run<void>('readwrite', (s) => s.delete(key));
}
