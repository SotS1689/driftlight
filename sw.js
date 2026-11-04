// Offline support: keep the whole game on the device. Analytics is never cached.
const CACHE = "driftlight-v1";
const SHELL = [
    "./", "index.html", "css/style.css", "manifest.webmanifest",
    "js/main.js", "js/game.js", "js/art.js", "js/world.js", "js/audio.js", "js/util.js",
    "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url);
    if (e.request.method !== "GET") return;
    if (url.hostname.includes("googletagmanager.com") || url.hostname.includes("google-analytics.com")) return;
    const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
    if (url.origin !== location.origin && !isFont) return;
    // Cache first, refresh in the background
    e.respondWith(
        caches.match(e.request).then((hit) => {
            const fresh = fetch(e.request)
                .then((res) => {
                    if (res.ok || res.type === "opaque") {
                        const copy = res.clone();
                        caches.open(CACHE).then((c) => c.put(e.request, copy));
                    }
                    return res;
                })
                .catch(() => hit || new Response("Driftlight is offline and this file isn't saved on the device yet.", { status: 503, headers: { "Content-Type": "text/plain" } }));
            return hit || fresh;
        })
    );
});
