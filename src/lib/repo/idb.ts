import type { SyncState } from '../logic/sync';
import type { Draft, Snapshot } from '../model';
import { uid } from '../id';
import { OtherTabError, type Repo } from './types';

const DB_NAME = 'kratos';
const STORE = 'kv';
/** Key holding the id of the tab that saves (see Repo.claim). */
const WRITER = 'writer';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the on-device database.'));
  });
}

/** IndexedDB on this device. Keys: the snapshot, the workout in progress, Drive sync state and the saving tab. */
export class IdbRepo implements Repo {
  #db: Promise<IDBDatabase> | null = null;
  readonly #tab = uid();

  #tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    this.#db ??= open();
    return this.#db.then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(STORE, mode);
          const req = run(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req.result);
          tx.onerror = () => reject(tx.error ?? new Error('Saving on this device failed.'));
          tx.onabort = () => reject(tx.error ?? new Error('Saving on this device was aborted.'));
        }),
    );
  }

  /** Put (or delete, for null) a key in the same transaction that checks this tab still does the saving. */
  #write(key: string, value: unknown): Promise<void> {
    this.#db ??= open();
    return this.#db.then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          let other = false;
          const writer = store.get(WRITER);
          writer.onsuccess = () => {
            if (writer.result !== undefined && writer.result !== this.#tab) {
              other = true;
              tx.abort();
            } else if (value === null) store.delete(key);
            else store.put(value, key);
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('Saving on this device failed.'));
          tx.onabort = () => reject(other ? new OtherTabError() : tx.error ?? new Error('Saving on this device was aborted.'));
        }),
    );
  }

  async claim() {
    await this.#tx('readwrite', (s) => s.put(this.#tab, WRITER));
  }

  async isWriter() {
    const w = await this.#tx('readonly', (s) => s.get(WRITER));
    return w === undefined || w === this.#tab;
  }

  async load() {
    return ((await this.#tx('readonly', (s) => s.get('snapshot'))) as Snapshot | undefined) ?? null;
  }

  async save(snapshot: Snapshot) {
    await this.#write('snapshot', snapshot);
  }

  async loadDraft() {
    return ((await this.#tx('readonly', (s) => s.get('draft'))) as Draft | undefined) ?? null;
  }

  async saveDraft(draft: Draft | null) {
    await this.#write('draft', draft);
  }

  async loadSync() {
    return (await this.#tx('readonly', (s) => s.get('sync'))) ?? null;
  }

  async saveSync(state: SyncState | null) {
    await this.#write('sync', state);
  }
}
