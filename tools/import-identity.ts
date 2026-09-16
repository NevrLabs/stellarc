#!/usr/bin/env bun
// STL-15 §5 manifest: maintenance importer CLI over importIdentity (§2).
// Ten-table, ledger-backed, idempotent. Report output is sanitized by the
// domain layer (no emails/hashes/bytes); this tool adds no secrets either.
//
// Connection strings follow the postgres.js URL form. Unix-socket sources
// (e.g. disposable fixtures) can pass ?host=<dir> with an empty authority
// or rely on PG* environment variables — both are handled by postgres.js.

import postgres from "postgres";
import {
	fixtureSourceId,
	importIdentity,
} from "../packages/domain/src/identity/import";

const args = process.argv.slice(2);
if (args.length < 2 || args.length > 3) {
	console.error(
		"usage: bun tools/import-identity.ts <source-database-url> <destination-database-url> [source-id]",
	);
	process.exit(2);
}
const [sourceUrl, destUrl, sourceIdArg] = args;
const sourceId = sourceIdArg ?? fixtureSourceId("manual");

function connect(url: string) {
	// postgres.js URL parsing: an explicit ?host= query wins over the
	// authority for the socket directory, so both TCP URLs and disposable
	// socket fixtures connect. (Verified: options.host overrides authority.)
	// "user@/db?host=<dir>" (empty authority) is invalid for new URL() —
	// inside postgres.js too. Insert localhost as the authority; the socket
	// dir from ?host= then flows through options.host (which overrides).
	let normalized = url;
	const m = url.match(/^[a-z]+:\/\/([^@/]+)@\//);
	if (m) normalized = url.replace(`${m[1]}@/`, `${m[1]}@localhost/`);
	const hm = normalized.match(/[?&]host=([^&]+)/);
	const socketHost = hm ? decodeURIComponent(hm[1] ?? "") : undefined;
	if (socketHost) {
		// strip ?host= so postgres.js doesn't forward it as a server GUC
		normalized = normalized.replace(/[?&]host=[^&]*/, "");
		normalized = normalized.replace(/\?$/, "");
		return postgres(normalized, { max: 1, host: socketHost });
	}
	return postgres(normalized, { max: 1 });
}

const source = connect(sourceUrl);
const destination = connect(destUrl);
try {
	const report = await importIdentity(source, destination, sourceId);
	console.log(
		JSON.stringify(
			{
				status: report.status,
				changed: report.changed,
				identical: report.identical,
				eventCount: report.eventCount,
			},
			null,
			2,
		),
	);
} finally {
	await source.end();
	await destination.end();
}
