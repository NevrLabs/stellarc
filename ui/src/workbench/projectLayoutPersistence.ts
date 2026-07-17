export type ProjectLayoutSaver<T> = (projectId: string, layout: T) => Promise<unknown>;
export type ProjectLayoutSaveErrorHandler = (projectId: string, error: unknown) => void;
export type ProjectLayoutIdleHandler = (projectId: string) => void;

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

interface SaveState<T> {
  inFlight: boolean;
  inFlightKey: string | null;
  pending: T | null;
  pendingKey: string | null;
  lastSavedKey: string | null;
}

/** Serializes saves per project while coalescing bursts to the newest snapshot. */
export class LatestProjectLayoutWriter<T> {
  private readonly queues = new Map<string, SaveState<T>>();

  constructor(
    private readonly save: ProjectLayoutSaver<T>,
    private readonly onError: ProjectLayoutSaveErrorHandler = () => {},
    private readonly onIdle: ProjectLayoutIdleHandler = () => {},
    private readonly fingerprint: (layout: T) => string = (layout) => stableJson(layout),
  ) {}

  enqueue(projectId: string, layout: T): void {
    let queue = this.queues.get(projectId);
    if (!queue) {
      queue = {
        inFlight: false,
        inFlightKey: null,
        pending: null,
        pendingKey: null,
        lastSavedKey: null,
      };
      this.queues.set(projectId, queue);
    }
    const key = this.fingerprint(layout);
    if (key === queue.pendingKey) return;
    if (queue.pending === null) {
      if (queue.inFlight && key === queue.inFlightKey) return;
      if (!queue.inFlight && key === queue.lastSavedKey) return;
    }
    queue.pending = layout;
    queue.pendingKey = key;
    if (queue.inFlight) return;
    queue.inFlight = true;
    void this.drain(projectId, queue);
  }

  isBusy(projectId: string): boolean {
    const queue = this.queues.get(projectId);
    return !!queue && (queue.inFlight || queue.pending !== null);
  }

  adopt(projectId: string, layout: T): boolean {
    let queue = this.queues.get(projectId);
    if (!queue) {
      queue = {
        inFlight: false,
        inFlightKey: null,
        pending: null,
        pendingKey: null,
        lastSavedKey: null,
      };
      this.queues.set(projectId, queue);
    }
    if (queue.inFlight || queue.pending !== null) return false;
    queue.lastSavedKey = this.fingerprint(layout);
    return true;
  }

  private async drain(projectId: string, queue: SaveState<T>): Promise<void> {
    while (queue.pending !== null) {
      const next = queue.pending;
      const nextKey = queue.pendingKey!;
      queue.pending = null;
      queue.pendingKey = null;
      if (nextKey === queue.lastSavedKey) continue;
      queue.inFlightKey = nextKey;
      try {
        await this.save(projectId, next);
        queue.lastSavedKey = nextKey;
      } catch (error) {
        this.onError(projectId, error);
        // If another snapshot arrived during the failed request, continue with
        // that newer value. Otherwise a later enqueue starts a fresh drain.
      }
    }
    queue.inFlightKey = null;
    queue.inFlight = false;
    this.onIdle(projectId);
  }
}

interface ProjectLayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Browser-side write journal for layouts not yet acknowledged by Hall. */
export class ProjectLayoutJournal<T> {
  constructor(
    private readonly storage: () => ProjectLayoutStorage,
    private readonly fingerprint: (layout: T) => string = (layout) => stableJson(layout),
  ) {}

  record(projectId: string, layout: T): void {
    try {
      const encoded = JSON.stringify(layout);
      this.storage().setItem(this.cacheKey(projectId), encoded);
      this.storage().setItem(this.pendingKey(projectId), encoded);
    } catch {
      // Hall persistence still runs; callers surface its failures separately.
    }
  }

  acknowledge(projectId: string, layout: T): void {
    try {
      const storage = this.storage();
      const pending = storage.getItem(this.pendingKey(projectId));
      if (pending === null) return;
      if (this.fingerprint(JSON.parse(pending) as T) === this.fingerprint(layout)) {
        storage.removeItem(this.pendingKey(projectId));
      }
    } catch {
      // A corrupt marker is handled by pending() on the next authority restore.
    }
  }

  pending(projectId: string): T | null {
    try {
      const storage = this.storage();
      const raw = storage.getItem(this.pendingKey(projectId));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      try { this.storage().removeItem(this.pendingKey(projectId)); } catch { /* unavailable */ }
      return null;
    }
  }

  cacheAuthority(projectId: string, layout: T | null): void {
    try { this.storage().setItem(this.cacheKey(projectId), JSON.stringify(layout)); } catch { /* unavailable */ }
  }

  cached(projectId: string): T | null {
    try {
      const raw = this.storage().getItem(this.cacheKey(projectId));
      return raw === null ? null : JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  clear(projectId: string): void {
    try {
      const storage = this.storage();
      storage.removeItem(this.cacheKey(projectId));
      storage.removeItem(this.pendingKey(projectId));
    } catch {
      // Best effort after authoritative project rejection.
    }
  }

  private cacheKey(projectId: string): string {
    return `olympus-project-layout:${projectId}`;
  }

  private pendingKey(projectId: string): string {
    return `olympus-project-layout-pending:${projectId}`;
  }
}
