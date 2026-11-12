/* 随手账 Service Worker (v1.3.4)
 * 策略：同源 GET → networkFirst（拿最新代码，失败回落缓存，离线仍可用）
 * 发版必须把 CACHE 常量 +1，否则旧缓存会一直兜住旧版 JS/CSS
 */
var CACHE = 'ssz-v1.3.4';

var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './libs/chart.umd.min.js',
  './js/store.js',
  './js/ui.js',
  './js/router.js',
  './js/tx.js',
  './js/voice.js',
  './js/extras.js',
  './js/ai.js',
  './js/transfer.js',
  './js/csv.js',
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
  './js/snapshot.js',
  './js/pages-about.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // 单个资源失败不拖垮整体安装
      return Promise.all(APP_SHELL.map(function (u) {
        return cache.add(u).catch(function () { return null; });
      }));
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
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (r) {
        if (r) return r;
        if (req.mode === 'navigate') return caches.match('./index.html') || caches.match('./');
        return r;
      });
    })
  );
});
