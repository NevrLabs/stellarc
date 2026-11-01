/** Error thrown by the node's plane client for a non-2xx response. Lives in
 * its own module (NEVR-230 defect 5) so the runner can detect lease loss
 * structurally — `error instanceof PlaneError && error.status === 409` —
 * instead of string-matching error text, where any "409" (a port, an id)
 * would read as a lost lease. */
export class PlaneError extends Error {
	constructor(
		readonly status: number,
		readonly body: string,
	) {
		super(`plane ${status}: ${body.slice(0, 300)}`);
	}
}
