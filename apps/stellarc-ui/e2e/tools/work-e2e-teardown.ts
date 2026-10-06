/**
 * STL-16 e2e teardown: stops the preview server, disposes the API handlers
 * and reaps the disposable Postgres cluster (single-function export per
 * Playwright's globalSetup/globalTeardown contract).
 */
export default async function teardown() {
	const scoped = globalThis as { __workE2eClose?: () => Promise<void> };
	if (scoped.__workE2eClose) await scoped.__workE2eClose();
}
