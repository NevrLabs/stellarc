import { Effect, Fiber } from "effect";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

export function replaceText(text: Y.Text, next: string): void {
  const prev = text.toString(); let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let oldEnd = prev.length, newEnd = next.length;
  while (oldEnd > start && newEnd > start && prev[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
  text.doc?.transact(() => { if (oldEnd > start) text.delete(start, oldEnd - start); if (newEnd > start) text.insert(start, next.slice(start, newEnd)); }, "local");
}

type Socket = Pick<WebSocket, "readyState" | "binaryType" | "send" | "close" | "onopen" | "onmessage" | "onerror" | "onclose">;
export class VaultCollabError extends Error {}
export function openVaultCollab(vaultId: string, path: string, initial: string, changed: (markdown: string) => void, options: {
  socket?: (url: string) => Socket; random?: () => number; error?: (error: VaultCollabError) => void;
  persistence?: (name: string, doc: Y.Doc) => { whenSynced: Promise<unknown>; destroy(): void };
} = {}) {
  const doc = new Y.Doc(), text = doc.getText("markdown");
  const persistence = (options.persistence ?? ((name, value) => new IndexeddbPersistence(name, value)))(`stellarc:vault:${vaultId}:${path}`, doc);
  const make = options.socket ?? ((url: string) => new WebSocket(url)); const random = options.random ?? Math.random;
  let socket: Socket | null = null, timer: ReturnType<typeof setTimeout> | null = null, stopped = false, attempt = 0;
  const connect = () => {
    if (stopped) return;
    const u = new URL(window.location.href), proto = u.protocol === "https:" ? "wss" : "ws";
    const next = make(`${proto}://${u.host}/ws/vaults/${encodeURIComponent(vaultId)}?path=${encodeURIComponent(path)}`); socket = next; next.binaryType = "arraybuffer";
    next.onopen = () => { if (socket === next) { attempt = 0; next.send(Y.encodeStateAsUpdate(doc)); } };
    next.onmessage = (event) => {
      if (socket !== next) return;
      if (!(event.data instanceof ArrayBuffer)) { options.error?.(new VaultCollabError("Vault update must be an ArrayBuffer")); return; }
      try { Y.applyUpdate(doc, new Uint8Array(event.data), "remote"); } catch (cause) { options.error?.(new VaultCollabError(`Malformed Vault update: ${String(cause)}`)); }
    };
    next.onerror = () => options.error?.(new VaultCollabError("Vault socket error"));
    next.onclose = () => { if (socket !== next) return; socket = null; if (!stopped) timer = setTimeout(connect, Math.min(10_000, 1_000 * 2 ** attempt++) * (0.75 + random() * 0.5)); };
  };
  const update = (bytes: Uint8Array, origin: unknown) => { if (origin !== "remote" && socket?.readyState === WebSocket.OPEN) socket.send(bytes); changed(text.toString()); };
  const resource = Effect.acquireRelease(Effect.sync(() => doc.on("update", update)), () => Effect.sync(() => {
    stopped = true; if (timer) clearTimeout(timer); timer = null; const current = socket; socket = null;
    if (current) { current.onclose = null; current.close(); } doc.off("update", update); persistence.destroy(); doc.destroy();
  }));
  const fiber = Effect.runFork(Effect.scoped(resource.pipe(Effect.zipRight(Effect.never))));
  void persistence.whenSynced.then(() => { if (stopped) return; if (text.length === 0) text.insert(0, initial); else changed(text.toString()); connect(); });
  return { text, replace: (markdown: string) => replaceText(text, markdown), destroy: () => { Effect.runFork(Fiber.interrupt(fiber)); } };
}
