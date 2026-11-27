/*
 * Loam's service worker: keeps the app itself on the device so it opens without a connection.
 * Books, notes and audio already live in the browser's database; this only covers the app's code,
 * pages, fonts and icons. Other sites (Wikipedia, Google) are never touched.
 *
 * Updates: a new version installs in the background and takes over the next time Loam is opened,
 * never in the middle of reading.
 */
const CACHE = "loam-v1";
const SHELL = [
  "/",
  "/fonts/literata.css",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
});

/** Files whose names change when their content does: safe to serve from cache first. */
const immutable = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/fonts/") ||
  url.pathname.startsWith("/icons/");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    req.headers.has("range")
  )
    return;

  if (immutable(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone(); // clone now, before the page reads the body
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Pages and data: fresh when online, last copy when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone(); // clone now, before the page reads the body
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(
        async () =>
          (await caches.match(req)) ||
          (req.mode === "navigate" ? caches.match("/") : Response.error()),
      ),
  );
});
