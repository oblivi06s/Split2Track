import { StorageAdapter } from '../storage/StorageAdapter.js';

/**
 * Cloud mode storage. Keeps a copy on the device (so the app opens fast
 * and works offline) plus the "baseline": the last version the server
 * confirmed. The difference between the two is what still needs uploading.
 */
export class CloudStorageAdapter extends StorageAdapter {
  constructor(userId, storage = globalThis.localStorage) {
    super();
    this.key = `split2track:cloud:${userId}`;
    this.storage = storage;
    this.data = null;
    this.baseline = null;
    /** Set by CloudSync. Called after every local change. */
    this.onLocalChange = null;
  }

  load() {
    try {
      const cache = JSON.parse(this.storage?.getItem(this.key) ?? 'null');
      this.data = cache?.data ?? null;
      this.baseline = cache?.baseline ?? null;
    } catch {
      this.data = null;
      this.baseline = null;
    }
    return this.data;
  }

  /** A change made in the app. */
  save(data) {
    this.data = data;
    this.#persist();
    this.onLocalChange?.(data);
  }

  /** Fresh data from the server: device copy and baseline are the same. */
  acceptRemote(data) {
    this.data = data;
    this.baseline = data;
    this.#persist();
  }

  /** The server confirmed this version. */
  setBaseline(data) {
    this.baseline = data;
    this.#persist();
  }

  clear() {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      /* ignore */
    }
  }

  #persist() {
    try {
      this.storage?.setItem(this.key, JSON.stringify({ data: this.data, baseline: this.baseline }));
    } catch (error) {
      console.warn('Could not save offline copy', error);
    }
  }
}
