import { AppStore } from './storage/AppStore.js';
import { LocalStorageAdapter, MemoryStorageAdapter } from './storage/StorageAdapter.js';
import { CloudService } from './cloud/CloudService.js';
import { CloudStorageAdapter } from './cloud/CloudStorageAdapter.js';
import { CloudSync } from './cloud/CloudSync.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { App } from './ui/App.js';
import { MODE_KEY } from './ui/views/AuthView.js';
import { toast } from './ui/components.js';

// Entry point: pick the mode, wire the pieces together, and start.
//   local = data on this device only
//   cloud = signed in, data synced with Supabase
//   auth  = cloud is set up but nobody is signed in yet
async function boot() {
  const root = document.getElementById('app');

  // Tests can provide a fake server instead of Supabase.
  const testService = window.__split2trackTestServiceFactory ? await window.__split2trackTestServiceFactory() : null;
  const cloudAvailable = Boolean(testService || (SUPABASE_URL && SUPABASE_KEY && window.supabase?.createClient));

  if (!cloudAvailable || readMode() === 'local') {
    const store = new AppStore(new LocalStorageAdapter());
    new App(root, store, { mode: 'local', cloudAvailable }).start();
    return;
  }

  const service = testService ?? new CloudService(window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY));
  let session = null;
  try {
    session = await service.getSession();
  } catch (error) {
    console.warn('Could not read session', error);
  }

  if (!session) {
    const store = new AppStore(new MemoryStorageAdapter());
    new App(root, store, { mode: 'auth', service, cloudAvailable }).start();
    return;
  }

  const userId = session.user.id;
  const adapter = new CloudStorageAdapter(userId);
  const store = new AppStore(adapter);
  const sync = new CloudSync({ service, store, adapter, userId, onError: (message) => toast(message) });
  const app = new App(root, store, { mode: 'cloud', service, sync, user: session.user, cloudAvailable });
  app.start();
  sync.start();
  service.onAuthChange((event) => {
    if (event === 'SIGNED_OUT') location.reload();
  });
}

function readMode() {
  try {
    return localStorage.getItem(MODE_KEY);
  } catch {
    return null;
  }
}

boot().catch((error) => {
  console.error(error);
  document.getElementById('app').textContent = `Split2Track could not start: ${error.message}`;
});

// Offline support + "Add to Home Screen".
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker failed', error));
  });
}
