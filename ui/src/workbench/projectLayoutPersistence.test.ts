import { describe, expect, it, vi } from "vitest";
import { LatestProjectLayoutWriter } from "./projectLayoutPersistence";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("LatestProjectLayoutWriter", () => {
  it("serializes requests and coalesces a burst to the newest layout", async () => {
    const first = deferred();
    const saved: Array<[string, number]> = [];
    const save = vi.fn(async (projectId: string, layout: number) => {
      saved.push([projectId, layout]);
      if (layout === 1) await first.promise;
    });
    const writer = new LatestProjectLayoutWriter(save);

    writer.enqueue("project-a", 1);
    writer.enqueue("project-a", 2);
    writer.enqueue("project-a", 3);

    expect(saved).toEqual([["project-a", 1]]);
    first.resolve();
    await vi.waitFor(() => expect(saved).toEqual([
      ["project-a", 1],
      ["project-a", 3],
    ]));
  });

  it("keeps independent projects from blocking each other", async () => {
    const first = deferred();
    const saved: Array<[string, number]> = [];
    const writer = new LatestProjectLayoutWriter<number>(async (projectId, layout) => {
      saved.push([projectId, layout]);
      if (projectId === "project-a") await first.promise;
    });

    writer.enqueue("project-a", 1);
    writer.enqueue("project-b", 2);

    await vi.waitFor(() => expect(saved).toContainEqual(["project-b", 2]));
    first.resolve();
  });
});
