/* Офлайн-режим для версии «на экран Домой». В Android/iOS-приложениях не используется. */
var VERSION = "dev";
var CACHE = "kumyk-" + VERSION;
var CORE = [
  "./", "./index.html", "./app.css", "./app.js", "./data.js", "./audio-list.js",
  "./manifest.webmanifest",
  "./fonts/Lora.ttf", "./fonts/FiraSans-Regular.ttf", "./fonts/FiraSans-Medium.ttf", "./fonts/FiraSans-SemiBold.ttf",
  "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Сначала кэш, затем сеть; новые файлы (например, аудио) докладываются в кэш
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        if (e.request.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});
