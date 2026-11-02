/**
 * Interface for where data is saved. Swap the adapter to change storage
 * (browser now, a cloud database later) without touching the rest of the app.
 */
export class StorageAdapter {
  /** @returns {object|null} saved data, or null if nothing is saved */
  load() {
    throw new Error('Subclass must implement load()');
  }

  /** @param {object} data */
  // eslint-disable-next-line no-unused-vars
  save(data) {
    throw new Error('Subclass must implement save()');
  }
}

/** Saves to the browser's localStorage, so data stays on this device. */
export class LocalStorageAdapter extends StorageAdapter {
  constructor(key = 'split2track:v1', storage = globalThis.localStorage) {
    super();
    this.key = key;
    this.storage = storage;
  }

  load() {
    try {
      const raw = this.storage?.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('Could not read saved data', error);
      return null;
    }
  }

  save(data) {
    try {
      this.storage?.setItem(this.key, JSON.stringify(data));
    } catch (error) {
      console.warn('Could not save data', error);
    }
  }
}

/** Keeps data in memory only. Used by tests. */
export class MemoryStorageAdapter extends StorageAdapter {
  constructor(initial = null) {
    super();
    this.data = initial ? structuredClone(initial) : null;
  }

  load() {
    return this.data ? structuredClone(this.data) : null;
  }

  save(data) {
    this.data = structuredClone(data);
  }
}
