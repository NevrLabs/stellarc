/**
 * STL-17 import entrypoint (§5 manifest): restored fork snapshot → stellarc
 * destination. Thin CLI/test wrapper around the domain importer; the source
 * connection is opened read-only via `default_transaction_read_only`.
 */

import type { Sql } from "postgres";
import postgres from "postgres";
import { runImport } from "../packages/domain/src/activity-import";

export { runImport } from "../packages/domain/src/activity-import";

export interface CliOptions {
	sourceUrl: string;
	destinationUrl: string;
	sourceId: string;
	defaultOrg: string;
	secretsKey?: string;
}

/** Open a strictly read-only source connection (§7: source never written). */
export function openReadOnlySource(url: string): Sql {
	return postgres(url, {
		prepare: false,
		onnotice: () => {},
		// postgres.js read-only session: any accidental write fails server-side.
		connection: { default_transaction_read_only: "true" },
	} as never);
}

async function main() {
	const args = process.argv.slice(2);
	const flag = (name: string): string | undefined => {
		const i = args.indexOf(`--${name}`);
		return i >= 0 ? args[i + 1] : undefined;
	};
	const sourceUrl = flag("source");
	const destinationUrl = flag("destination");
	const sourceId = flag("source-id");
	const defaultOrg = flag("default-org");
	const secretsKey = flag("secrets-key");
	if (!sourceUrl || !destinationUrl || !sourceId || !defaultOrg) {
		console.error(
			"usage: import-activity-notifications --source URL --destination URL --source-id ID --default-org ORG [--secrets-key KEY]",
		);
		process.exit(2);
	}
	const source = openReadOnlySource(sourceUrl);
	const destination = postgres(destinationUrl, {
		prepare: false,
		onnotice: () => {},
	});
	try {
		const report = await runImport({
			source,
			destination,
			sourceId,
			defaultOrg,
			secrets: secretsKey
				? { mode: "verify", key: secretsKey }
				: { mode: "raw" },
		});
		console.log(JSON.stringify(report));
	} finally {
		await source.end();
		await destination.end();
	}
}

if (import.meta.main) await main();
