import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

export function replaceText(text: Y.Text, next: string): void {
  const prev = text.toString();
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let oldEnd = prev.length, newEnd = next.length;
  while (oldEnd > start && newEnd > start && prev[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
  text.doc?.transact(() => { if (oldEnd > start) text.delete(start, oldEnd - start); if (newEnd > start) text.insert(start, next.slice(start, newEnd)); }, "local");
}

export function openVaultCollab(vaultId: string, path: string, initial: string, changed: (markdown: string) => void) {
  const doc = new Y.Doc(); const text = doc.getText("markdown");
  const persistence = new IndexeddbPersistence(`stellarc:vault:${vaultId}:${path}`, doc);
  let socket: WebSocket | null = null; let closed = false;
  const connect = () => {
    const u = new URL(window.location.href); const proto = u.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${proto}://${u.host}/ws/vaults/${encodeURIComponent(vaultId)}?path=${encodeURIComponent(path)}`);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => socket?.send(Y.encodeStateAsUpdate(doc));
    socket.onmessage = (event) => { if (event.data instanceof ArrayBuffer) Y.applyUpdate(doc, new Uint8Array(event.data), "remote"); };
    socket.onclose = () => { socket = null; if (!closed) setTimeout(connect, 1500); };
  };
  const update = (bytes: Uint8Array, origin: unknown) => { if (origin !== "remote" && socket?.readyState === WebSocket.OPEN) socket.send(bytes); changed(text.toString()); };
  doc.on("update", update);
  void persistence.whenSynced.then(() => { if (text.length === 0) text.insert(0, initial); else changed(text.toString()); connect(); });
  return { text, replace: (markdown: string) => replaceText(text, markdown), destroy: () => { closed = true; socket?.close(); doc.off("update", update); persistence.destroy(); doc.destroy(); } };
}
