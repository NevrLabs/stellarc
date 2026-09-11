import { useRef, useState } from "react";

/**
 * Open state for a task detail section (subtasks, relations) whose default
 * depends on whether it has content: empty sections start collapsed, populated
 * ones start expanded.
 *
 * The list arrives asynchronously, so the default is latched from the FIRST
 * loaded payload only. Recomputing on every data change would slam the section
 * shut underneath a user who opened it to add the first item.
 */
export function useSectionOpenState(hasItems: boolean, isLoaded: boolean) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const initialOpen = useRef<boolean | null>(null);

  if (initialOpen.current === null && isLoaded) {
    initialOpen.current = hasItems;
  }

  const isOpen = userOpen ?? initialOpen.current ?? false;

  return [isOpen, setUserOpen] as const;
}

export default useSectionOpenState;
