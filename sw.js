// Service worker: lets the app open with no internet after the first visit.
// Bump VERSION whenever you deploy changes so phones get the new files.
const VERSION = 'split2track-v1';

const FILES = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/main.js',
  './js/models/index.js',
  './js/models/Entity.js',
  './js/models/Person.js',
  './js/models/Group.js',
  './js/models/Category.js',
  './js/models/Expense.js',
  './js/models/Settlement.js',
  './js/services/Money.js',
  './js/services/SplitStrategy.js',
  './js/services/BalanceService.js',
  './js/services/SampleData.js',
  './js/storage/StorageAdapter.js',
  './js/storage/AppStore.js',
  './js/ui/App.js',
  './js/ui/Router.js',
  './js/ui/View.js',
  './js/ui/dom.js',
  './js/ui/forms.js',
  './js/ui/components.js',
  './js/ui/views/OnboardingView.js',
  './js/ui/views/GroupsView.js',
  './js/ui/views/GroupFormView.js',
  './js/ui/views/GroupDetailView.js',
  './js/ui/views/FriendsView.js',
  './js/ui/views/FriendDetailView.js',
  './js/ui/views/ExpenseFormView.js',
  './js/ui/views/ExpenseDetailView.js',
  './js/ui/views/SettleUpView.js',
  './js/ui/views/ActivityView.js',
  './js/ui/views/AccountView.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

// Network first (so updates show up), fall back to cache when offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('./index.html'))),
  );
});
