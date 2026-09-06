/* My Expenses service worker — bump CACHE_NAME on every deploy. */
const CACHE_NAME = 'my-expenses-v1-watermark';

const CORE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-192-maskable.png',
    './icons/icon-512-maskable.png',
    './icons/apple-touch-icon.png',
    './src/app.js',
    './src/storage.js',
    './src/months.js',
    './src/money.js',
    './src/model.js',
    './src/budget.js',
    './src/subscriptions.js',
    './src/csv.js',
    './src/backup.js',
    './src/files.js',
    './src/donut.js',
    './src/views/add.js',
    './src/views/month.js',
    './src/views/monthNav.js',
    './src/views/chartView.js',
    './src/views/more.js',
    './src/views/setup.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)),
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys
                .filter((key) => key !== CACHE_NAME)
                .map((key) => caches.delete(key)),
        )),
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached !== undefined) {
                return cached;
            }
            return fetch(request).then((response) => {
                if (!response || response.status !== 200 || response.type === 'opaque') {
                    return response;
                }
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, copy);
                });
                return response;
            }).catch(() => caches.match('./index.html'));
        }),
    );
});
