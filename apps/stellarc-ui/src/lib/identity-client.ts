// STL-15 §3/§5 (rework c13, D10): typed transport for the first-party
// /api/identity/* domain API. The Better Auth client (lib/auth-client.ts)
// keeps the sign-in/session surfaces it owns (/api/auth/*); everything the
// fork consumed through organization-plugin client calls flows through here
// so the frozen JSX keeps its exact envelopes and error toasts.
export class IdentityApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "IdentityApiError";
    this.status = status;
    this.code = code;
  }
}

function identityUrl(path: string) {
  const trimmedBase = (
    import.meta.env.VITE_API_URL || "http://localhost:1337"
  ).replace(/\/+$/, "");
  const base = trimmedBase.endsWith("/api")
    ? trimmedBase
    : `${trimmedBase}/api`;
  return `${base}/identity${path}`;
}

async function identityRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(identityUrl(path), {
    method: init.method ?? "GET",
    credentials: "include",
    headers:
      init.body === undefined
        ? undefined
        : {
            "content-type": "application/json",
          },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!response.ok) {
    let message = `Identity request failed (${response.status})`;
    let code: string | undefined;
    try {
      const parsed = (await response.json()) as {
        message?: string;
        code?: string;
      };
      message = parsed.message ?? message;
      code = parsed.code;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new IdentityApiError(response.status, message, code);
  }

  return (await response.json()) as T;
}

export function identityGet<T>(path: string): Promise<T> {
  return identityRequest<T>(path);
}

export function identitySend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown = {},
): Promise<T> {
  return identityRequest<T>(path, { method, body });
}

export type IdentityMutation<T> = { data: T; txid: number };

export function orgPath(org: string, ...rest: string[]): string {
  return `/orgs/${encodeURIComponent(org)}/${rest.map(encodeURIComponent).join("/")}`;
}
