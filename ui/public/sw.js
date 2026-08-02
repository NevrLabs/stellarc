// Stellarc service worker — caches app shell, intercepts failed navigations
// so the user never sees Cloudflare's 502/error page during server restarts.
// Instead shows a reconnect overlay and auto-retries.

const CACHE = "stellarc-shell-v1";
const RETRY_PAGE = `
<!doctype html><html><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Reconnecting…</title>
<style>
  body { background:#0a0a0b; margin:0; height:100vh; display:flex;
    align-items:center; justify-content:center; font-family:system-ui,sans-serif; }
  .c { text-align:center; color:#6b7280; }
  .t { font-size:14px; margin-bottom:8px; }
  .s { font-size:12px; opacity:0.6; }
</style></head><body><div class="c">
  <div class="t">Reconnecting…</div>
  <div class="s">Will auto-reload when the server is back.</div>
</div>
<script>
  // Poll until the server responds, then reload.
  async function check() {
    try {
      const r = await fetch(location.href, { method:"HEAD", cache:"no-store" });
      if (r.ok || r.status < 500) { location.reload(); return; }
    } catch(e) {}
    setTimeout(check, 1500);
  }
  check();
</script>
</body></html>
`;

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Only intercept navigation (document) requests
  if (req.mode !== "navigate") return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        // Cache successful responses for the app shell
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => {
        // Server is down — return cached shell if available, else retry page
        return caches.match(req).then((cached) => {
          if (cached) {
            // Serve cached shell — the React ReconnectOverlay will handle polling
            return cached;
          }
          // No cache — return the retry page that polls until server is up
          return new Response(RETRY_PAGE, {
            headers: { "content-type": "text/html" },
          });
        });
      })
  );
});
