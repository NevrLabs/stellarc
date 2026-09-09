import debounce from "./debounce";

/**
 * How long typing must pause before a title edit is persisted.
 *
 * Every keystroke used to reach the API, which spammed the task update
 * endpoint and wrote a row into the activity history per character.
 */
export const TASK_TITLE_SAVE_DELAY_MS = 800;

export type TaskTitleSaver = {
  /** Record a keystroke. Persists once typing pauses for the delay. */
  change: (title: string) => void;
  /** Persist the pending edit right now (blur / unmount / navigation). */
  flush: () => Promise<void>;
  /** Drop the pending edit without saving it. */
  cancel: () => void;
  /** Whether an edit is waiting to be saved. */
  pending: () => boolean;
  /** Whether a write is currently in flight (#164: drives the spinner). */
  saving: () => boolean;
  /**
   * Subscribe to saving-state changes. Returns an unsubscribe function.
   *
   * The saver lives outside React so the timing rules stay unit-testable;
   * components need a push notification to re-render when a write starts or
   * finishes.
   */
  subscribe: (listener: () => void) => () => void;
  /** The value we believe is persisted. */
  saved: () => string;
  /**
   * Adopt a value that came from the server as the new baseline, so it is
   * not written back as if the user had typed it.
   */
  reset: (title: string) => void;
};

type CreateTaskTitleSaverOptions = {
  save: (title: string) => Promise<unknown> | unknown;
  initialTitle?: string;
  delay?: number;
  onError?: (error: unknown) => void;
};

/**
 * Debounced, no-op-suppressing writer for the task title.
 *
 * Kept free of React so the timing rules can be unit tested directly with
 * fake timers instead of through a rendered component.
 */
export function createTaskTitleSaver({
  save,
  initialTitle = "",
  delay = TASK_TITLE_SAVE_DELAY_MS,
  onError,
}: CreateTaskTitleSaverOptions): TaskTitleSaver {
  let savedTitle = initialTitle;
  let inFlight = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const persist = async (title: string) => {
    // A late timer can still fire for a value that already landed (or that
    // the user typed back to the original). Saving it again would add a
    // meaningless activity entry.
    if (title === savedTitle) return;

    const previous = savedTitle;
    savedTitle = title;
    inFlight += 1;
    notify();

    try {
      await save(title);
    } catch (error) {
      // Restore the baseline so the next keystroke retries this value
      // instead of treating the failed write as persisted.
      savedTitle = previous;
      if (onError) onError(error);
      else throw error;
    } finally {
      inFlight -= 1;
      notify();
    }
  };

  const debounced = debounce(persist, delay);

  return {
    change: (title: string) => {
      if (title === savedTitle) {
        // Typed back to the persisted value: nothing left to save.
        debounced.cancel();
        notify();
        return;
      }
      debounced(title);
      // #164: `pending` drives the "typing" indicator, so subscribers must be
      // told when a keystroke queues a write, not only when one starts.
      notify();
    },
    flush: async () => {
      await debounced.flush();
      notify();
    },
    cancel: () => {
      debounced.cancel();
      notify();
    },
    pending: () => debounced.pending(),
    saving: () => inFlight > 0,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    saved: () => savedTitle,
    reset: (title: string) => {
      debounced.cancel();
      savedTitle = title;
    },
  };
}

export default createTaskTitleSaver;
