import { afterEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import { AxisEvents, AxisEventsError } from "./axis-events";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState: number = WebSocket.CONNECTING;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) { FakeSocket.all.push(this); }
  open() { this.readyState = WebSocket.OPEN; this.onopen?.(); }
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; this.readyState = WebSocket.CLOSED; this.onclose?.(); }
  drop() { this.readyState = WebSocket.CLOSED; this.onclose?.(); }
  message(data: string) { this.onmessage?.({ data } as MessageEvent); }
}

const make = (report = vi.fn()) => ({ events: new AxisEvents((url) => new FakeSocket(url) as unknown as WebSocket, () => 0, report), report });
afterEach(() => { vi.useRealTimers(); FakeSocket.all = []; });

describe("AxisEvents", () => {
  it("owns one socket and closes it on org switch and stop", () => {
    const { events } = make();
    events.start("a"); events.start("a");
    expect(FakeSocket.all).toHaveLength(1);
    events.start("b");
    expect(FakeSocket.all).toHaveLength(2);
    expect(FakeSocket.all[0].closed).toBe(true);
    events.stop(); expect(FakeSocket.all[1].closed).toBe(true);
  });

  it("replays desired subscriptions exactly once after reconnect", () => {
    vi.useFakeTimers();
    const { events } = make(); events.start("a");
    events.subscribe("s1"); events.subscribe("s1");
    FakeSocket.all[0].open();
    expect(FakeSocket.all[0].sent).toEqual([JSON.stringify({ kind: "subscribe", sessionIds: ["s1"] })]);
    FakeSocket.all[0].drop(); vi.advanceTimersByTime(750); FakeSocket.all[1].open();
    expect(FakeSocket.all[1].sent).toEqual([JSON.stringify({ kind: "subscribe", sessionIds: ["s1"] })]);
  });

  it("reports malformed frames and multicasts valid frames", () => {
    const { events, report } = make(); const a = vi.fn(), b = vi.fn();
    events.onFrame(a); events.onFrame(b); events.start("a"); FakeSocket.all[0].open();
    FakeSocket.all[0].message("nope"); expect(report).toHaveBeenCalledOnce();
    FakeSocket.all[0].message(JSON.stringify({ kind: "cards.changed" }));
    expect(a).toHaveBeenCalledOnce(); expect(b).toHaveBeenCalledOnce();
  });

  it("returns typed failure when sending while disconnected", async () => {
    const { events } = make();
    const error = await Effect.runPromise(Effect.flip(events.send({ kind: "typing", sessionId: "s" })));
    expect(error).toBeInstanceOf(AxisEventsError);
    expect(error.reason).toBe("not-connected");
  });
});
