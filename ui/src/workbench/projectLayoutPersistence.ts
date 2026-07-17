export type ProjectLayoutSaver<T> = (projectId: string, layout: T) => Promise<unknown>;

interface SaveState<T> {
  inFlight: boolean;
  pending: T | null;
}

/** Serializes saves per project while coalescing bursts to the newest snapshot. */
export class LatestProjectLayoutWriter<T> {
  private readonly queues = new Map<string, SaveState<T>>();

  constructor(private readonly save: ProjectLayoutSaver<T>) {}

  enqueue(projectId: string, layout: T): void {
    let queue = this.queues.get(projectId);
    if (!queue) {
      queue = { inFlight: false, pending: null };
      this.queues.set(projectId, queue);
    }
    queue.pending = layout;
    if (queue.inFlight) return;
    queue.inFlight = true;
    void this.drain(projectId, queue);
  }

  private async drain(projectId: string, queue: SaveState<T>): Promise<void> {
    while (queue.pending !== null) {
      const next = queue.pending;
      queue.pending = null;
      try {
        await this.save(projectId, next);
      } catch {
        // If another snapshot arrived during the failed request, continue with
        // that newer value. Otherwise a later enqueue starts a fresh drain.
      }
    }
    queue.inFlight = false;
  }
}
