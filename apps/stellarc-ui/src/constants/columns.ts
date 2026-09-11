/**
 * Backward-compatible export for the four Kanban lanes.
 *
 * #226 moved the full persisted vocabulary (including Triage, Canceled and
 * Duplicate) to `task-statuses.ts`. Existing callers that only need the board
 * lanes can keep importing DEFAULT_COLUMNS from here.
 */
export { DEFAULT_COLUMNS } from "./task-statuses";
