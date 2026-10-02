// Attached files live in the browser's IndexedDB (room for large files),
// not with the records: a bill or customer keeps only each file's name,
// type and size, and its id here. Keys carry the Company ID, so a company
// only ever reaches its own files.
import { COMPANY_ID } from './account';

const DB = 'runtruck-files';
const STORE = 'files';
const key = (id: string) => `${COMPANY_ID}:${id}`;

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? new Error('Saving the file was stopped'));
  }));
}

export const putFile = (id: string, blob: Blob) => run('readwrite', (s) => s.put(blob, key(id))).then(() => undefined);
export const getFile = (id: string) => run<Blob | undefined>('readonly', (s) => s.get(key(id)) as IDBRequest<Blob | undefined>);

// Remove this company's files that no record points to any more (files of
// deleted bills or customers, or attached in a form that was cancelled).
export async function pruneFiles(keep: string[]): Promise<void> {
  const keys = (await run('readonly', (s) => s.getAllKeys())) as string[];
  const mine = keys.filter((k) => typeof k === 'string' && k.startsWith(`${COMPANY_ID}:`));
  const wanted = new Set(keep.map(key));
  const gone = mine.filter((k) => !wanted.has(k));
  if (gone.length) await run('readwrite', (s) => { gone.forEach((k) => s.delete(k)); return s.count(); });
}
