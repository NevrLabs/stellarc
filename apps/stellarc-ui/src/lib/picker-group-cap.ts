/**
 * Cap the rendered rows per group in linking pickers.
 *
 * The Command palette (Base UI Autocomplete) mounts EVERY item as a DOM node —
 * with 1400+ tickets in an org the palette mounted thousands of rows, which is
 * the reported "the whole modal feels laggy". The search input filters
 * server-side data in memory anyway, so rendering more than a screenful per
 * group buys nothing: type to narrow. This is dumb-but-effective
 * virtualization; a windowing library would fight the Autocomplete's
 * keyboard-highlight model.
 */
export type CappedGroup<T> = {
  value: string;
  label: string;
  items: T[];
  hiddenCount: number;
};

export function capGroupItems<T>(
  groups: Array<{ value: string; label: string; items: T[] }>,
  cap: number,
): CappedGroup<T>[] {
  return groups.map((group) => ({
    value: group.value,
    label: group.label,
    items: group.items.slice(0, cap),
    hiddenCount: Math.max(0, group.items.length - cap),
  }));
}

/**
 * Query-filter groups BEFORE capping so the cap never hides a search match:
 * the cap only bounds the unsearched view. `haystack` mirrors the string the
 * palette row exposes as its Autocomplete value.
 */
export function filterThenCapGroups<T>(
  groups: Array<{ value: string; label: string; items: T[] }>,
  query: string,
  haystack: (item: T) => string,
  cap: number,
): CappedGroup<T>[] {
  const q = query.trim().toLocaleLowerCase();
  const filtered = q
    ? groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            haystack(item).toLocaleLowerCase().includes(q),
          ),
        }))
        .filter((group) => group.items.length > 0)
    : groups;
  return capGroupItems(filtered, cap);
}

/** Default per-group row cap shared by the linking pickers. */
export const PICKER_GROUP_CAP = 50;
