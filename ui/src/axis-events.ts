import { Effect, Fiber, Schema } from "effect";
import type { ClientFrame, ServerFrame } from "./types";
import { getDisplayName } from "./api";

const SessionIds = Schema.Array(Schema.String);
export const ClientFrameSchema = Schema.Union(
  Schema.Struct({ kind: Schema.Literal("subscribe"), sessionIds: SessionIds }),
  Schema.Struct({ kind: Schema.Literal("unsubscribe"), sessionIds: SessionIds }),
  Schema.Struct({ kind: Schema.Literal("typing"), sessionId: Schema.String }),
);
// Server variants evolve independently; validate the common trust boundary here,
// then TypeScript narrows the protocol union for consumers.
export const ServerFrameSchema = Schema.Struct({ kind: Schema.String }, { key: Schema.String, value: Schema.Unknown });

export type AxisConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "closed";
export class AxisEventsError extends Error {
  constructor(readonly reason: "not-connected" | "invalid-frame" | "socket-error", message: string) { super(message); }
}
type Listener = (frame: ServerFrame) => void;
type StateListener = (state: AxisConnectionState) => void;
type SocketLike = Pick<WebSocket, "readyState" | "send" | "close" | "onopen" | "onmessage" | "onerror" | "onclose">;

export class AxisEvents {
  private socket: SocketLike | null = null;
  private org: string | null = null;
  private stopped = true;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly frames = new Set<Listener>();
  private readonly states = new Set<StateListener>();
  private readonly desired = new Set<string>();
  private state: AxisConnectionState = "idle";

  constructor(
    private readonly makeSocket: (url: string) => SocketLike = (url) => new WebSocket(url),
    private readonly random: () => number = Math.random,
    private readonly report: (error: AxisEventsError) => void = console.error,
  ) {}

  start(org: string): void {
    if (!org || (this.org === org && !this.stopped)) return;
    this.stop();
    this.org = org; this.stopped = false; this.attempt = 0;
    this.connect();
  }
  stop(): void {
    this.stopped = true; this.org = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const socket = this.socket; this.socket = null;
    if (socket) { socket.onclose = null; socket.close(); }
    this.setState("closed");
  }
  onFrame(listener: Listener): () => void { this.frames.add(listener); return () => this.frames.delete(listener); }
  onState(listener: StateListener): () => void { this.states.add(listener); listener(this.state); return () => this.states.delete(listener); }
  subscribe(sessionId: string): () => void {
    const fresh = !this.desired.has(sessionId);
    this.desired.add(sessionId);
    if (fresh && this.state === "connected") this.sendNow({ kind: "subscribe", sessionIds: [sessionId] });
    return () => { if (this.desired.delete(sessionId) && this.state === "connected") this.sendNow({ kind: "unsubscribe", sessionIds: [sessionId] }); };
  }
  send(frame: ClientFrame): Effect.Effect<void, AxisEventsError> {
    return Effect.try({
      try: () => {
        Schema.decodeUnknownSync(ClientFrameSchema)(frame);
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new AxisEventsError("not-connected", "Axis events socket is not connected");
        this.socket.send(JSON.stringify(frame));
      },
      catch: (cause) => cause instanceof AxisEventsError ? cause : new AxisEventsError("invalid-frame", String(cause)),
    });
  }
  private sendNow(frame: ClientFrame): void {
    try { Effect.runSync(this.send(frame)); } catch (cause) { this.report(cause as AxisEventsError); }
  }
  private connect(): void {
    if (this.stopped || !this.org) return;
    this.setState(this.attempt ? "reconnecting" : "connecting");
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const q = new URLSearchParams({ organization: this.org });
    const name = getDisplayName(); if (name) q.set("name", name);
    const socket = this.makeSocket(`${protocol}://${location.host}/ws?${q}`);
    this.socket = socket;
    socket.onopen = () => {
      if (socket !== this.socket) return;
      const reconnected = this.attempt > 0;
      this.attempt = 0; this.setState("connected");
      if (this.desired.size) this.sendNow({ kind: "subscribe", sessionIds: [...this.desired] });
      if (reconnected) this.emit({ kind: "ws.reconnected" });
    };
    socket.onmessage = (event) => {
      try {
        const value = JSON.parse(String(event.data));
        Schema.decodeUnknownSync(ServerFrameSchema)(value);
        this.emit(value as ServerFrame);
      } catch (cause) { this.report(new AxisEventsError("invalid-frame", `Malformed Axis frame: ${String(cause)}`)); }
    };
    socket.onerror = () => this.report(new AxisEventsError("socket-error", "Axis events socket error"));
    socket.onclose = () => {
      if (socket !== this.socket) return;
      this.socket = null;
      if (this.stopped) return;
      const delay = Math.min(30_000, 1_000 * 2 ** this.attempt++) * (0.75 + this.random() * 0.5);
      this.setState("reconnecting");
      this.timer = setTimeout(() => { this.timer = null; this.connect(); }, delay);
    };
  }
  private emit(frame: ServerFrame): void { for (const listener of this.frames) listener(frame); }
  private setState(state: AxisConnectionState): void { this.state = state; for (const listener of this.states) listener(state); }
}

export const axisEvents = new AxisEvents();
export const startAxisEvents = (org: string) => axisEvents.start(org);
export const closeAxisEvents = () => axisEvents.stop();
export const onAxisFrame = (fn: Listener) => axisEvents.onFrame(fn);
export const subscribeAxisSession = (id: string) => axisEvents.subscribe(id);
export const sendAxisFrame = (frame: ClientFrame) => Effect.runPromise(axisEvents.send(frame));
