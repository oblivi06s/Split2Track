import { RemoteMapper } from './RemoteMapper.js';
import { isNetworkError } from './CloudService.js';

/**
 * Keeps the app and the server in step.
 *  - Local change  -> upload only what changed (diff against the baseline).
 *  - Server change -> download everything again (data is small) and redraw.
 *  - No internet   -> keep changes on the device and upload when back online.
 */
export class CloudSync {
  /**
   * @param {{service: import('./CloudService.js').CloudService,
   *          store: import('../storage/AppStore.js').AppStore,
   *          adapter: import('./CloudStorageAdapter.js').CloudStorageAdapter,
   *          userId: string,
   *          onError?: (message: string) => void,
   *          debounceMs?: number}} options
   */
  constructor({ service, store, adapter, userId, onError = () => {}, debounceMs = 300 }) {
    this.service = service;
    this.store = store;
    this.adapter = adapter;
    this.userId = userId;
    this.onError = onError;
    this.debounceMs = debounceMs;

    this.status = 'idle'; // idle | syncing | synced | offline | error
    this.ready = false; // true after the first successful download
    this.listeners = new Set();
    this.version = 0; // bumps on every local change
    this.pushQueue = Promise.resolve(); // uploads run one at a time
    this.pendingPushes = 0;
    this.refreshing = null; // promise while downloading
    this.refreshTimer = null;
    this.cleanups = [];
  }

  /** True when there are local changes the server hasn't confirmed yet. */
  get dirty() {
    return !RemoteMapper.diff(this.adapter.baseline ?? {}, this.store.toJSON(), this.userId).empty;
  }

  onStatus(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start() {
    this.adapter.onLocalChange = () => {
      this.version += 1;
      this.push();
    };
    this.cleanups.push(this.service.subscribe(() => this.scheduleRefresh()));

    if (typeof window !== 'undefined') {
      const online = () => this.sync();
      const visible = () => document.visibilityState === 'visible' && this.scheduleRefresh();
      window.addEventListener('online', online);
      document.addEventListener('visibilitychange', visible);
      this.cleanups.push(() => window.removeEventListener('online', online));
      this.cleanups.push(() => document.removeEventListener('visibilitychange', visible));
    }
    await this.sync();
  }

  stop() {
    clearTimeout(this.refreshTimer);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.adapter.onLocalChange = null;
  }

  /** Upload anything pending, then download the latest. */
  async sync() {
    await this.push();
    await this.refresh();
  }

  scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), this.debounceMs);
  }

  /** Uploads local changes. Safe to call many times; runs one at a time. */
  push() {
    // Uploads wait in line, one after another. Each one sends whatever is
    // still different from the server, so extra calls cost nothing.
    this.pendingPushes += 1;
    this.pushQueue = this.pushQueue.then(() => this.#pushOnce()).finally(() => {
      this.pendingPushes -= 1;
    });
    return this.pushQueue;
  }

  get pushing() {
    return this.pendingPushes > 0;
  }

  async #pushOnce() {
    const snapshot = this.store.toJSON();
    const diff = RemoteMapper.diff(this.adapter.baseline ?? {}, snapshot, this.userId);
    if (diff.empty) return;

    this.#setStatus('syncing');
    try {
      await this.service.apply(diff);
      this.adapter.setBaseline(snapshot);
      this.#setStatus('synced');
      this.scheduleRefresh(); // pick up server-made values like invite codes
    } catch (error) {
      if (isNetworkError(error)) {
        this.#setStatus('offline');
        return;
      }
      // The server refused (for example, a security rule). Show why, then
      // reload the server's version so the app matches reality.
      this.onError(CloudSync.friendlyMessage(error));
      this.#setStatus('error');
      await this.refresh({ force: true });
    }
  }

  /** Downloads everything and replaces the local copy. */
  refresh({ force = false } = {}) {
    if (this.refreshing) {
      // A forced refresh must really run, even if a normal one is already going.
      return force ? this.refreshing.then(() => this.refresh({ force: true })) : this.refreshing;
    }
    this.refreshing = this.#refreshOnce(force).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async #refreshOnce(force) {
    // Never overwrite changes that haven't been uploaded yet.
    if (!force && (this.pushing || this.dirty)) {
      if (this.pushing) await this.pushQueue;
      if (this.dirty) return;
    }

    const versionAtStart = this.version;
    this.#setStatus('syncing');
    try {
      // Pick up groups friends added us to by email (cheap when there are none).
      await this.service.claimInvites?.();
      const rows = await this.service.fetchAll();
      if (this.version !== versionAtStart && !force) {
        // The user changed something while we were downloading. Upload first.
        this.push();
        return;
      }
      this.store.applyRemote(RemoteMapper.fromRows(rows, this.userId));
      this.ready = true;
      this.#setStatus('synced');
    } catch (error) {
      if (isNetworkError(error)) {
        this.#setStatus('offline');
      } else {
        this.onError(CloudSync.friendlyMessage(error));
        this.#setStatus('error');
      }
    }
  }

  #setStatus(status) {
    this.status = status;
    for (const listener of this.listeners) listener(status, this);
  }

  static friendlyMessage(error) {
    const message = String(error?.message ?? error ?? 'Something went wrong');
    if (/row-level security|permission denied/i.test(message)) return 'You don’t have permission to change that.';
    if (/add up to the total/i.test(message)) return 'The shares must add up to the total.';
    if (/JWT|token/i.test(message)) return 'Your login expired. Please sign in again.';
    return message;
  }
}
