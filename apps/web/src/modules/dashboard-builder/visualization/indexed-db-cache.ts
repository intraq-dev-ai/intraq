import type { VisualizationData } from '../types';
import type { VisualizationDataRequest } from './data';

const DB_NAME = 'DashboardCache';
const DB_VERSION = 1;
const STORE_NAME = 'sqlResults';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface VisualizationDataCacheMetadata {
  dataSourceId: string;
  request: VisualizationDataRequest;
  rowCount: number;
  tableName: string;
}

interface VisualizationDataCacheEntry {
  data: VisualizationData;
  key: string;
  metadata: VisualizationDataCacheMetadata;
  timestamp: number;
}

export class IndexedDBVisualizationDataCache {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  async get(key: string, options: { maxAgeMs?: number } = {}): Promise<VisualizationData | null> {
    const db = await this.open();
    if (!db) return null;
    const entry = await this.readEntry(db, key);
    if (!entry) return null;
    const maxAgeMs = Math.min(MAX_AGE_MS, options.maxAgeMs ?? MAX_AGE_MS);
    if (Date.now() - entry.timestamp > maxAgeMs) {
      await this.delete(key);
      return null;
    }
    return entry.data;
  }

  async set(key: string, data: VisualizationData, metadata: VisualizationDataCacheMetadata): Promise<void> {
    const db = await this.open();
    if (!db) return;
    const entry = plainCacheEntry({
      data,
      key,
      metadata,
      timestamp: Date.now()
    });
    await this.withStore(db, 'readwrite', store => {
      store.put(entry);
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.open();
    if (!db) return;
    await this.withStore(db, 'readwrite', store => {
      store.delete(key);
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.open();
    if (!db) return;
    await this.withStore(db, 'readwrite', store => {
      store.clear();
    });
  }

  async clearDataSource(dataSourceId: string): Promise<void> {
    const db = await this.open();
    if (!db) return;
    const entries = await this.readAll(db);
    const keys = entries
      .filter(entry => entry.metadata.dataSourceId === dataSourceId)
      .map(entry => entry.key);
    await Promise.all(keys.map(key => this.delete(key)));
  }

  async clearExpired(): Promise<void> {
    const db = await this.open();
    if (!db) return;
    const cutoff = Date.now() - MAX_AGE_MS;
    const entries = await this.readAll(db);
    const expiredKeys = entries.filter(entry => entry.timestamp < cutoff).map(entry => entry.key);
    await Promise.all(expiredKeys.map(key => this.delete(key)));
  }

  async getStats(): Promise<{ entries: number; oldestTimestamp: number | null; totalRows: number }> {
    const db = await this.open();
    if (!db) return { entries: 0, oldestTimestamp: null, totalRows: 0 };
    const entries = await this.readAll(db);
    return {
      entries: entries.length,
      oldestTimestamp: entries.length ? Math.min(...entries.map(entry => entry.timestamp)) : null,
      totalRows: entries.reduce((sum, entry) => sum + entry.metadata.rowCount, 0)
    };
  }

  private async open(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return null;
    this.dbPromise ??= new Promise(resolve => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => resolve(null);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(STORE_NAME)
          ? request.transaction?.objectStore(STORE_NAME)
          : db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        if (!store) return;
        if (!store.indexNames.contains('timestamp')) store.createIndex('timestamp', 'timestamp');
        if (!store.indexNames.contains('metadata.dataSourceId')) {
          store.createIndex('metadata.dataSourceId', 'metadata.dataSourceId');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onblocked = () => resolve(null);
    });
    return this.dbPromise;
  }

  private async readEntry(db: IDBDatabase, key: string): Promise<VisualizationDataCacheEntry | null> {
    return this.withStore(db, 'readonly', store => store.get(key) as IDBRequest<VisualizationDataCacheEntry | undefined>)
      .then(entry => entry ?? null);
  }

  private async readAll(db: IDBDatabase): Promise<VisualizationDataCacheEntry[]> {
    return this.withStore(db, 'readonly', store => store.getAll() as IDBRequest<VisualizationDataCacheEntry[]>);
  }

  private withStore<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T> | void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let requestResult: T | undefined;
      const request = operation(store);
      if (request) {
        request.onsuccess = () => {
          requestResult = request.result;
        };
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
      }
      transaction.oncomplete = () => resolve(requestResult as T);
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
  }
}

function plainCacheEntry(entry: VisualizationDataCacheEntry): VisualizationDataCacheEntry {
  return JSON.parse(JSON.stringify(entry)) as VisualizationDataCacheEntry;
}

export const indexedDBVisualizationDataCache = new IndexedDBVisualizationDataCache();
void indexedDBVisualizationDataCache.clearExpired().catch(() => {
  // Cache cleanup must not affect dashboard rendering.
});
