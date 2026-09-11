import { useTranslation } from "react-i18next";

import useBulkSelectionStore from "@/store/bulk-selection";

/**
 * Bulk Actions toggle for List view, rendered in BoardToolbar immediately left
 * of Create ticket. It previously lived in a second toolbar row below the main
 * one, which existed only to hold this button and the nest hint.
 *
 * State comes from the bulk-selection store, so it works from the toolbar
 * without threading props through the view.
 */
function ListBulkActionsToggle() {
  const { t } = useTranslation();
  const isSelectMode = useBulkSelectionStore((state) => state.isSelectMode);
  const setSelectMode = useBulkSelectionStore((state) => state.setSelectMode);

  return (
    <button
      aria-pressed={isSelectMode}
      className="inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent/60"
      data-testid="list-bulk-actions"
      onClick={() => setSelectMode(!isSelectMode)}
      type="button"
    >
      {isSelectMode ? t("common:actions.cancel") : t("tasks:bulkActions.label")}
    </button>
  );
}

export default ListBulkActionsToggle;
