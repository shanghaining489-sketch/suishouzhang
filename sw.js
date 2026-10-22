/* 随手账 Service Worker
 * 策略：同源 GET → cacheFirst（命中即返，后台静默更新）；导航请求 → networkFirst，失败回落缓存 index.html
 * 发版时把 CACHE 常量 +1（如 'ssz-v2'），旧缓存会自动清理
 */
var CACHE = 'ssz-v1';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './libs/chart.umd.min.js',
  './js/store.js',
  './js/ui.js',
  './js/router.js',
  './js/tx.js',
  './js/pages-home.js',
  './js/pages-txlist.js',
  './js/pages-stats.js',
  './js/pages-accounts.js',
  './js/budget.js',
  './js/goals.js',
  './js/recurring.js',
  './js/pages-categories.js',
  './js/pages-mine.js',
  './js/backup.js',
  './js/pages-about.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; // 只处理同源

  // 导航请求：networkFirst，失败回落缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }

  // 其他同源 GET：cacheFirst，后台静默更新
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
