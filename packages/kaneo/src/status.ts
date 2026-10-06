// Pure status taxonomy shared with the lifted Kaneo tree (no DB imports).
import {
	BACKLOG_STATUS_SLUGS,
	isClosedStatus,
	NON_COLUMN_STATUS_SLUGS,
	STATUS_DEFINITIONS,
} from "../../kaneo-legacy/src/task/status-taxonomy";

export { BACKLOG_STATUS_SLUGS, isClosedStatus };
export const VIRTUAL_STATUSES = NON_COLUMN_STATUS_SLUGS;
export const TASK_STATUS_ORDER_SLUGS = STATUS_DEFINITIONS.filter(
	(s) => !s.isBacklog,
).map((s) => s.slug);
