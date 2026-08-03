import { afterEach, describe, expect, it, vi } from "vitest";
import { openVaultCollab } from "./vaultCollab";
class FakeSocket {
  static sockets: FakeSocket[] = []; readyState = WebSocket.CONNECTING; binaryType: BinaryType = "blob";
  onopen: ((e: Event) => void) | null = null; onmessage: ((e: MessageEvent) => void) | null = null; onerror: ((e: Event) => void) | null = null; onclose: ((e: CloseEvent) => void) | null = null;
  sent: unknown[] = []; closed = 0; constructor(readonly url: string) { FakeSocket.sockets.push(this); } send(v: unknown) { this.sent.push(v); } close() { this.closed++; }
}
const persistence = () => ({ whenSynced: Promise.resolve(), destroy: vi.fn() });
const flush = () => Promise.resolve().then(() => Promise.resolve());
afterEach(() => { vi.useRealTimers(); FakeSocket.sockets = []; });
describe("Vault collaboration scope", () => {
  it("sends initial Yjs state and reconnects with bounded jitter", async () => {
    vi.useFakeTimers(); const collab = openVaultCollab("v", "p", "hello", () => {}, { socket: (u) => new FakeSocket(u) as never, random: () => 0, persistence });
    await flush(); expect(FakeSocket.sockets).toHaveLength(1); FakeSocket.sockets[0].onopen?.({} as Event); expect(FakeSocket.sockets[0].sent[0]).toBeInstanceOf(Uint8Array);
    FakeSocket.sockets[0].onclose?.({} as CloseEvent); await vi.advanceTimersByTimeAsync(750); expect(FakeSocket.sockets).toHaveLength(2); collab.destroy();
  });
  it("cancels pending reconnect and disposes persistence on destroy", async () => {
    vi.useFakeTimers(); const store = persistence(); const collab = openVaultCollab("v", "p", "", () => {}, { socket: (u) => new FakeSocket(u) as never, random: () => 0, persistence: () => store });
    await flush(); FakeSocket.sockets[0].onclose?.({} as CloseEvent); collab.destroy(); await flush(); await vi.runAllTimersAsync();
    expect(FakeSocket.sockets).toHaveLength(1); expect(store.destroy).toHaveBeenCalledOnce();
  });
  it("rejects non-ArrayBuffer payloads", async () => {
    const errors: Error[] = []; const collab = openVaultCollab("v", "p", "", () => {}, { socket: (u) => new FakeSocket(u) as never, persistence, error: (e) => errors.push(e) });
    await flush(); FakeSocket.sockets[0].onmessage?.({ data: "bad" } as MessageEvent); expect(errors).toHaveLength(1); collab.destroy();
  });
});
