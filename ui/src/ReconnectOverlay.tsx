import { useEffect, useState } from "react";

/**
 * When the dev server goes down (redeploy/restart), the browser loses its
 * WebSocket connection to Vite. Instead of showing Cloudflare's 502 page,
 * this component polls the server and auto-reloads when it's back.
 */
export function ReconnectOverlay() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    function check() {
      if (stopped) return;
      fetch(window.location.href, { method: "HEAD", cache: "no-store" })
        .then(() => {
          if (down) window.location.reload();
          setDown(false);
        })
        .catch(() => {
          setDown(true);
          timer = setTimeout(check, 2000);
        });
    }

    window.addEventListener("offline", () => setDown(true));
    window.addEventListener("online", check);

    // Also listen for Vite's own HMR disconnect
    if (import.meta.hot) {
      import.meta.hot.on("vite:ws:disconnect", () => setDown(true));
      import.meta.hot.on("vite:ws:connect", () => setDown(false));
    }

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [down]);

  if (!down) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.85)", color: "#999",
      fontFamily: "system-ui, sans-serif", fontSize: 14,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ marginBottom: 8 }}>Reconnecting…</div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>Will auto-reload when server is back</div>
      </div>
    </div>
  );
}
