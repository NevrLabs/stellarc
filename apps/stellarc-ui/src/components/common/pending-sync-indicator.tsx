import { useEffect, useRef } from "react";
import { toast } from "@/lib/toast";

/**
 * Background-save indicator, rendered as a loading TOAST.
 *
 * This used to be an element in (or over) the view: a fixed pill in the
 * corner for board/list/backlog, and a sticky "Saving move…" pill INSIDE the
 * gantt scroll container. The sticky variant occupied layout space, so every
 * save pushed the rows down and snapped them back — visible jitter on each
 * drag. A toast lives in the toast viewport, entirely outside the view's
 * layout, so saving cannot move anything.
 *
 * Renders nothing; the component form (rather than a hook) keeps the existing
 * `<PendingSyncIndicator pending={…} />` call sites unchanged.
 */
export function PendingSyncIndicator({
  pending,
  label = "Saving changes…",
}: {
  pending: boolean;
  label?: string;
}) {
  const toastIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (pending && !toastIdRef.current) {
      toastIdRef.current = toast.loading(label);
    } else if (!pending && toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = undefined;
    }
  }, [pending, label]);

  // Unmount while a save is in flight must not strand a spinner toast.
  useEffect(
    () => () => {
      if (toastIdRef.current) toast.dismiss(toastIdRef.current);
    },
    [],
  );

  return null;
}
