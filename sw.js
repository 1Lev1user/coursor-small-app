/*
 * My Expenses service worker.
 * VERSION must match package.json; a test checks it. Changing it renames
 * the cache, which makes installed apps fetch the new files.
 */
const VERSION = '2.0.0';
const CACHE_NAME = `my-expenses-${VERSION}`;

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
    './fonts/onest-latin-wght-normal.woff2',
    './fonts/onest-latin-ext-wght-normal.woff2',
    './fonts/onest-cyrillic-wght-normal.woff2',
    './fonts/onest-cyrillic-ext-wght-normal.woff2',
    './fonts/unbounded-latin-wght-normal.woff2',
    './fonts/unbounded-latin-ext-wght-normal.woff2',
    './fonts/unbounded-cyrillic-wght-normal.woff2',
    './fonts/unbounded-cyrillic-ext-wght-normal.woff2',
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
    './src/monthReview.js',
    './src/limits.js',
    './src/import/types.js',
    './src/views/add.js',
    './src/views/month.js',
    './src/views/monthNav.js',
    './src/views/chartView.js',
    './src/views/more.js',
    './src/views/setup.js',
];

// Versions before 2.0 cannot show the "Update" bar, so replace them at once.
const LEGACY_CACHE = /^my-expenses-(v1-|1\.)/;

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(CORE_ASSETS);
        const keys = await caches.keys();
        if (keys.some((key) => LEGACY_CACHE.test(key))) {
            await self.skipWaiting();
        }
    })());
});

// A newer version waits until the page asks for it, so one page never
// mixes files from two versions.
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
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
