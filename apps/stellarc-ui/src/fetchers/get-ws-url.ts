import { getApiUrl } from "@/fetchers/get-api-url";

/**
 * Absolute ws:// or wss:// URL for an API websocket path.
 *
 * VITE_API_URL is relative in dev ("/api") so requests go through the Vite proxy
 * on the page's own origin. That means the protocol isn't known statically:
 * resolving against `window.location` picks ws:// for an http page and wss:// for
 * an https one. Hardcoding either breaks the other — and an https page is not
 * allowed to open a plain ws:// socket at all.
 */
export function apiWebSocketUrl(path: string) {
  const base = getApiUrl("ws");
  const absolute = base.startsWith("/")
    ? new URL(base, window.location.href).toString()
    : base;
  const wsBase = absolute.replace(/^http/, "ws");
  return `${wsBase}/${path.replace(/^\/+/, "")}`;
}
