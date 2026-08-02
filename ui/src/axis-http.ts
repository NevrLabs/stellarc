import { Data, Effect, Exit, Runtime, Schema } from "effect";

const BASE = import.meta.env.DEV ? ((import.meta.env.VITE_API_BASE as string | undefined) ?? "") : "";
const runtime = Runtime.defaultRuntime;
let organizationId: string | null = null;
const globalPaths = ["/api/auth/", "/api/health", "/api/metrics", "/api/agents/", "/api/nodes/"];
const globalExact = new Set(["/api/organizations", "/api/models", "/api/agents", "/api/agents/catalog", "/api/enroll", "/api/nodes", "/api/terminal/targets"]);

export class NetworkError extends Data.TaggedError("NetworkError")<{ cause: unknown }> {}
export class HttpError extends Data.TaggedError("HttpError")<{ status: number; message: string }> {}
export class DecodeError extends Data.TaggedError("DecodeError")<{ cause: unknown }> {}
export class AuthRequired extends Data.TaggedError("AuthRequired")<{ status: 401; message: string }> {}
export class Conflict extends Data.TaggedError("Conflict")<{ status: 409; message: string }> {}
export class RateLimited extends Data.TaggedError("RateLimited")<{ status: 429; message: string }> {}

export function setAxisOrganization(id: string | null): void { organizationId = id; }
function scopedPath(path: string): string {
  const bare = BASE && path.startsWith(BASE) ? path.slice(BASE.length) : path;
  if (!organizationId || !bare.startsWith("/api/") || globalExact.has(bare) || globalPaths.some((p) => bare.startsWith(p))) return path;
  return `${BASE}/api/organizations/${encodeURIComponent(organizationId)}${bare.slice(4)}`;
}
function run<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
  return Runtime.runPromise(runtime)(effect) as Promise<A>;
}
function request(path: string, init: RequestInit, signal: AbortSignal | undefined, fetcher: typeof window.fetch) {
  return Effect.async<Response, NetworkError>((resume) => {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    fetcher(scopedPath(path), { ...init, credentials: "include", signal: controller.signal }).then(
      (response) => resume(Effect.succeed(response)),
      (cause) => resume(Effect.fail(new NetworkError({ cause }))),
    );
    return Effect.sync(() => { signal?.removeEventListener("abort", abort); controller.abort(); });
  });
}
async function message(response: Response): Promise<string> {
  const text = await response.clone().text();
  try { const body = JSON.parse(text); return body.message ?? body.error ?? `${response.status}`; } catch { return text || `${response.status}`; }
}
async function statusError(response: Response) {
  const detail = await message(response);
  if (response.status === 401) return new AuthRequired({ status: 401, message: detail });
  if (response.status === 409) return new Conflict({ status: 409, message: detail });
  if (response.status === 429) return new RateLimited({ status: 429, message: detail });
  return new HttpError({ status: response.status, message: detail });
}

export const axisHttp = {
  fetch(path: string, init: RequestInit = {}, signal?: AbortSignal, fetcher: typeof window.fetch = window.fetch.bind(window)): Promise<Response> {
    return run(request(path, init, signal, fetcher));
  },
  async json<A, I>(path: string, schema: Schema.Schema<A, I>, init: RequestInit = {}, signal?: AbortSignal, fetcher: typeof window.fetch = window.fetch.bind(window)): Promise<A> {
    const response = await this.fetch(path, init, signal, fetcher);
    if (!response.ok) throw await statusError(response);
    let value: unknown;
    try { value = await response.json(); } catch (cause) { throw new DecodeError({ cause }); }
    try { return Schema.decodeUnknownSync(schema)(value); } catch (cause) { throw new DecodeError({ cause }); }
  },
};
export const UnknownJson = Schema.Unknown;
