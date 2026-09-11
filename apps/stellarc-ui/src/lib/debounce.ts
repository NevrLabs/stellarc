export type DebouncedFunction<Args extends unknown[], R> = {
  (...args: Args): void;
  /** Run the latest pending call immediately. */
  flush: () => Promise<R | undefined>;
  /** Drop the latest pending call. */
  cancel: () => void;
  /** Whether a call is currently waiting for the delay. */
  pending: () => boolean;
};

/**
 * Debounce a function without losing the final value on navigation/unmount.
 * Consumers that persist user input should call `flush()` from their cleanup.
 */
function debounce<Args extends unknown[], R>(
  func: (...args: Args) => Promise<R> | R,
  delay: number,
): DebouncedFunction<Args, R> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let latestArgs: Args | undefined;

  const run = async () => {
    if (!latestArgs) return undefined;
    const args = latestArgs;
    latestArgs = undefined;
    if (timeout !== undefined) {
      clearTimeout(timeout);
      timeout = undefined;
    }
    return func(...args);
  };

  const debounced = ((...args: Args) => {
    latestArgs = args;
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = setTimeout(() => {
      void run();
    }, delay);
  }) as DebouncedFunction<Args, R>;

  debounced.flush = run;
  debounced.cancel = () => {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
    latestArgs = undefined;
  };
  debounced.pending = () => latestArgs !== undefined;

  return debounced;
}

export default debounce;
