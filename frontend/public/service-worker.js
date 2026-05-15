const APP_BASE_PATH = new URL("./", self.location.href).pathname.replace(/\/$/, "");
const SHELL_CACHE = "gym-manager-shell-v2";
const ASSET_CACHE = "gym-manager-assets-v2";
const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
].map(resolveAppUrl);

function resolveAppUrl(pathname) {
  return `${APP_BASE_PATH}${pathname}`.replace(/\/{2,}/g, "/");
}

function isAppShellRequest(pathname) {
  return APP_SHELL_URLS.includes(pathname);
}

function isStaticAssetRequest(pathname) {
  return pathname.startsWith(resolveAppUrl("/static/"));
}

async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);

  if (response && response.status === 200 && response.type === "basic") {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }

  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const activeCaches = new Set([SHELL_CACHE, ASSET_CACHE]);

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (!activeCaches.has(cacheName)) {
              return caches.delete(cacheName);
            }

            return null;
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (requestUrl.pathname.startsWith(resolveAppUrl("/api/"))) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(resolveAppUrl("/index.html")))
    );
    return;
  }

  if (isAppShellRequest(requestUrl.pathname)) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
    return;
  }

  if (isStaticAssetRequest(requestUrl.pathname)) {
    event.respondWith(cacheFirst(event.request, ASSET_CACHE));
  }
});
