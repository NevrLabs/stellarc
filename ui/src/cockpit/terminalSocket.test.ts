import { afterEach, describe, expect, it, vi } from "vitest";
import { openTerminalSocket } from "./terminalSocket";

class FakeSocket {
  static sockets: FakeSocket[] = []; readyState = WebSocket.CONNECTING;
  onopen: ((e: Event) => void) | null = null; onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null; onclose: ((e: CloseEvent) => void) | null = null;
  sent: unknown[] = []; closed: number[] = [];
  constructor(readonly url: string) { FakeSocket.sockets.push(this); }
  send(value: unknown) { this.sent.push(value); }
  close(code?: number) { this.closed.push(code ?? 1000); }
}
afterEach(() => { vi.useRealTimers(); FakeSocket.sockets = []; });

describe("terminal socket scope", () => {
  it("closes once and cancels a pending reconnect", async () => {
    vi.useFakeTimers(); const states: string[] = [];
    const connection = openTerminalSocket({ url: () => "ws://terminal", socket: (u) => new FakeSocket(u) as never, random: () => 0, frame: () => {}, state: (s) => states.push(s) });
    expect(FakeSocket.sockets).toHaveLength(1); FakeSocket.sockets[0].onclose?.({ code: 1006 } as CloseEvent);
    connection.close(); await vi.runAllTimersAsync();
    expect(FakeSocket.sockets).toHaveLength(1); expect(states.at(-1)).toBe("disconnected");
  });
  it("reconnects after bounded jitter and stops after an exit", async () => {
    vi.useFakeTimers();
    const connection = openTerminalSocket({ url: () => "ws://terminal", socket: (u) => new FakeSocket(u) as never, random: () => 0, frame: (f) => { if (f.kind === "exited") connection.stopReconnect(); }, state: () => {} });
    FakeSocket.sockets[0].onclose?.({ code: 1006 } as CloseEvent); await vi.advanceTimersByTimeAsync(750);
    expect(FakeSocket.sockets).toHaveLength(2); FakeSocket.sockets[1].onmessage?.({ data: JSON.stringify({ kind: "exited", exitCode: 0 }) } as MessageEvent);
    FakeSocket.sockets[1].onclose?.({ code: 1006 } as CloseEvent); await vi.advanceTimersByTimeAsync(30_000); expect(FakeSocket.sockets).toHaveLength(2);
  });
  it("reports malformed frames", () => {
    const errors: Error[] = []; openTerminalSocket({ url: () => "ws://terminal", socket: (u) => new FakeSocket(u) as never, frame: () => {}, state: () => {}, error: (e) => errors.push(e) });
    FakeSocket.sockets[0].onmessage?.({ data: "{}" } as MessageEvent); expect(errors).toHaveLength(1);
  });
});
