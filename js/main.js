import { AppStore } from './storage/AppStore.js';
import { LocalStorageAdapter } from './storage/StorageAdapter.js';
import { App } from './ui/App.js';

// Entry point: wire the pieces together and start.
const store = new AppStore(new LocalStorageAdapter());
const app = new App(document.getElementById('app'), store);
app.start();

// Offline support + "Add to Home Screen".
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker failed', error));
  });
}
