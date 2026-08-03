import { Effect, Fiber } from "effect";
import { Schema } from "effect";

export type TerminalConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";
export const TerminalFrame = Schema.Union(
  Schema.Struct({ kind: Schema.Literal("output"), dataB64: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("attached"), persistent: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("exited"), exitCode: Schema.optional(Schema.Number), error: Schema.optional(Schema.String) }),
);
export type TerminalServerFrame = Schema.Schema.Type<typeof TerminalFrame>;
export class TerminalSocketError extends Error {}
type Socket = Pick<WebSocket, "readyState" | "send" | "close" | "onopen" | "onmessage" | "onerror" | "onclose">;

export function openTerminalSocket(options: {
  url: () => string; socket?: (url: string) => Socket; random?: () => number;
  frame: (frame: TerminalServerFrame) => void; state: (state: TerminalConnectionState) => void;
  error?: (error: TerminalSocketError) => void;
}) {
  const make = options.socket ?? ((url: string) => new WebSocket(url));
  const random = options.random ?? Math.random;
  let current: Socket | null = null, timer: ReturnType<typeof setTimeout> | null = null, stopped = false, attempt = 0;
  const connect = () => {
    if (stopped) return;
    options.state(attempt ? "reconnecting" : "connecting");
    const socket = make(options.url()); current = socket;
    socket.onopen = () => { if (current === socket) { attempt = 0; options.state("connected"); } };
    socket.onmessage = (event) => {
      if (current !== socket) return;
      try { options.frame(Schema.decodeUnknownSync(TerminalFrame)(JSON.parse(String(event.data)))); }
      catch (cause) { options.error?.(new TerminalSocketError(`Malformed terminal frame: ${String(cause)}`)); }
    };
    socket.onerror = () => options.error?.(new TerminalSocketError("Terminal socket error"));
    socket.onclose = (event) => {
      if (current !== socket) return; current = null;
      if (stopped || event.code === 4000) { stopped = true; options.state("disconnected"); return; }
      const delay = Math.min(10_000, 1_000 * 2 ** attempt++) * (0.75 + random() * 0.5);
      options.state("reconnecting"); timer = setTimeout(connect, delay);
    };
  };
  const resource = Effect.acquireRelease(Effect.sync(connect), () => Effect.sync(() => {
    stopped = true; if (timer) clearTimeout(timer); timer = null;
    const socket = current; current = null; if (socket) { socket.onclose = null; socket.close(4000, "tab-closed"); }
    options.state("disconnected");
  }));
  const fiber = Effect.runFork(Effect.scoped(resource.pipe(Effect.zipRight(Effect.never))));
  return {
    send: (value: string | ArrayBufferLike | Blob | ArrayBufferView) => { if (current?.readyState === WebSocket.OPEN) current.send(value); },
    stopReconnect: () => { stopped = true; if (timer) clearTimeout(timer); timer = null; options.state("disconnected"); },
    close: () => { Effect.runFork(Fiber.interrupt(fiber)); },
  };
}
