import { migrate } from "../../packages/db/src/migrate";
import { writeProbe } from "../../packages/domain/src/index";
import { ShapeEngine } from "../../packages/sync/src/index";
import { disposablePostgres } from "../helpers/postgres";
export async function startTestServer() {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const engine = new ShapeEngine(db.sql);
	const { foundationHandler } = await import(
		"../../apps/stellarc-api/src/http"
	);
	const http = foundationHandler(
		db.sql,
		engine,
		(org, headers) => headers.authorization === `Bearer ${org}`,
	);
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		idleTimeout: 30,
		fetch: (request) => http.handler(request),
	});
	return {
		url: server.url.origin,
		get afterProjectionRead() {
			return engine.afterProjectionRead;
		},
		set afterProjectionRead(value: (() => Promise<void>) | undefined) {
			engine.afterProjectionRead = value;
		},
		write: (org: string, id: string, value: string) =>
			writeProbe(db.sql, org, "test-actor", id, value),
		async close() {
			server.stop(true);
			await http.dispose();
			await db.close();
		},
	};
}
