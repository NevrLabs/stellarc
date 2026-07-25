import { describe, expect, it, vi } from "vitest";
import { LatestProjectLayoutWriter, ProjectLayoutJournal, stableJson } from "./projectLayoutPersistence";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("LatestProjectLayoutWriter", () => {
  it("fingerprints equivalent layouts independently of object key order", () => {
    expect(stableJson({ panels: { b: { id: 2 }, a: { id: 1 } }, grid: [2, 1] })).toBe(
      stableJson({ grid: [2, 1], panels: { a: { id: 1 }, b: { id: 2 } } }),
    );
  });

  it("does not resave an unchanged semantic layout", async () => {
    const save = vi.fn(async () => {});
    const writer = new LatestProjectLayoutWriter<Record<string, unknown>>(save);

    writer.enqueue("project-a", { panels: { a: 1 }, grid: [1, 2] });
    await vi.waitFor(() => expect(writer.isBusy("project-a")).toBe(false));
    writer.enqueue("project-a", { grid: [1, 2], panels: { a: 1 } });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("adopts authoritative state without writing it back", async () => {
    const save = vi.fn(async () => {});
    const writer = new LatestProjectLayoutWriter<Record<string, unknown>>(save);

    expect(writer.adopt("project-a", { panels: {}, grid: [] })).toBe(true);
    writer.enqueue("project-a", { grid: [], panels: {} });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(save).not.toHaveBeenCalled();

    writer.enqueue("project-a", { grid: [], panels: { a: 1 } });
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it("drops an obsolete pending layout when the in-flight layout becomes latest again", async () => {
    const first = deferred();
    const saved: number[] = [];
    const writer = new LatestProjectLayoutWriter<number>(async (_projectId, layout) => {
      saved.push(layout);
      if (saved.length === 1) await first.promise;
    });

    writer.enqueue("project-a", 1);
    writer.enqueue("project-a", 2);
    writer.enqueue("project-a", 1);
    first.resolve();

    await vi.waitFor(() => expect(writer.isBusy("project-a")).toBe(false));
    expect(saved).toEqual([1]);
  });

  it("serializes requests and coalesces a burst to the newest layout", async () => {
    const first = deferred();
    const saved: Array<[string, number]> = [];
    const save = vi.fn(async (projectId: string, layout: number) => {
      saved.push([projectId, layout]);
      if (layout === 1) await first.promise;
    });
    const onIdle = vi.fn();
    const writer = new LatestProjectLayoutWriter(save, undefined, onIdle);

    writer.enqueue("project-a", 1);
    writer.enqueue("project-a", 2);
    writer.enqueue("project-a", 3);

    expect(writer.isBusy("project-a")).toBe(true);
    expect(saved).toEqual([["project-a", 1]]);
    first.resolve();
    await vi.waitFor(() => expect(saved).toEqual([
      ["project-a", 1],
      ["project-a", 3],
    ]));
    await vi.waitFor(() => expect(onIdle).toHaveBeenCalledWith("project-a"));
    expect(writer.isBusy("project-a")).toBe(false);
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

  it("reports failed saves and accepts a later replacement", async () => {
    const saved: number[] = [];
    const onError = vi.fn();
    const writer = new LatestProjectLayoutWriter<number>(async (_projectId, layout) => {
      saved.push(layout);
      if (layout === 1) throw new Error("Axis unavailable");
    }, onError);

    writer.enqueue("project-a", 1);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(
      "project-a",
      expect.objectContaining({ message: "Axis unavailable" }),
    ));

    writer.enqueue("project-a", 2);
    await vi.waitFor(() => expect(saved).toEqual([1, 2]));
  });
});

describe("ProjectLayoutJournal", () => {
  function storage() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
  }

  it("recovers a failed snapshot across remount and clears it only after matching acknowledgement", () => {
    const backing = storage();
    const firstMount = new ProjectLayoutJournal<Record<string, unknown>>(() => backing);
    const layoutA = { panels: { a: 1 } };
    const layoutB = { panels: { b: 2 } };

    firstMount.record("project-a", layoutA);
    firstMount.acknowledge("project-a", layoutA);
    firstMount.record("project-a", layoutB);

    const remount = new ProjectLayoutJournal<Record<string, unknown>>(() => backing);
    expect(remount.pending("project-a")).toEqual(layoutB);
    remount.acknowledge("project-a", layoutA);
    expect(remount.pending("project-a")).toEqual(layoutB);
    remount.acknowledge("project-a", layoutB);
    expect(remount.pending("project-a")).toBeNull();
  });

  it("does not clear a newer pending snapshot when an older save completes", () => {
    const backing = storage();
    const journal = new ProjectLayoutJournal<Record<string, unknown>>(() => backing);
    const older = { panels: { a: 1 } };
    const newer = { panels: { b: 2 } };

    journal.record("project-a", older);
    journal.record("project-a", newer);
    journal.acknowledge("project-a", older);

    expect(journal.pending("project-a")).toEqual(newer);
  });
});
