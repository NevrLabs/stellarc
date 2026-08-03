import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("query cancellation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("aborts the AxisHttp fetch when TanStack Query cancels", async () => {
    let fetchSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        fetchSignal = init?.signal ?? undefined;
        fetchSignal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    vi.resetModules();
    const { fetchSession } = await import("./api");
    const client = new QueryClient();
    const promise = client.fetchQuery({
      queryKey: ["session", "cancel-me"],
      queryFn: ({ signal }) => fetchSession("cancel-me", signal),
    });

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await client.cancelQueries({ queryKey: ["session", "cancel-me"] });

    await expect(promise).rejects.toBeDefined();
    expect(fetchSignal?.aborted).toBe(true);
  });
});
