import assert from "node:assert/strict";
import postgres from "postgres";
import { assertRuntimeDatabase, bindIdentity } from "./database";
import { gatewaySchema } from "./store";

// Fresh disposable database. Deliberately contaminate and restore one role.
const owner = postgres(process.env.SPIKE_OWNER_DSN!, {
	max: 2,
	onnotice: () => {},
});
await owner.unsafe(gatewaySchema);
await owner`CREATE ROLE gateway_runtime LOGIN PASSWORD 'disposable-only'`;
await owner`GRANT USAGE ON SCHEMA public TO gateway_runtime`;
await owner`GRANT SELECT,INSERT ON gw_audit TO gateway_runtime`;
const runtime = postgres(process.env.SPIKE_RUNTIME_DSN!, {
	max: 2,
	onnotice: () => {},
});
try {
	await bindIdentity(owner, "https://issuer.invalid", "fixture", true);
	await owner`GRANT SELECT ON gw_identity_binding TO gateway_runtime`;
	await bindIdentity(runtime, "https://issuer.invalid", "fixture");
	await assert.rejects(
		bindIdentity(runtime, "https://foreign.invalid", "fixture"),
	);
	await assert.rejects(
		bindIdentity(runtime, "https://issuer.invalid", "foreign"),
	);
	await assert.rejects(
		bindIdentity(owner, "https://foreign.invalid", "fixture", true),
	);
	await assert.rejects(
		runtime`UPDATE gw_identity_binding SET issuer='https://foreign.invalid'`,
	);
	console.log("PASS immutable-installation-issuer-client-binding");
	await assertRuntimeDatabase(runtime);
	for (const table of ["gw_identity_binding", "gw_installation"] as const) {
		for (const permission of [
			"INSERT",
			"UPDATE",
			"DELETE",
			"TRUNCATE",
			"TRIGGER",
		] as const) {
			await owner.unsafe(`GRANT ${permission} ON ${table} TO gateway_runtime`);
			try {
				await assert.rejects(
					assertRuntimeDatabase(runtime),
					`${table} ${permission} must reject startup`,
				);
			} finally {
				await owner.unsafe(
					`REVOKE ${permission} ON ${table} FROM gateway_runtime`,
				);
			}
		}
	}
	console.log(
		"PASS immutable-identity-and-installation-effective-mutation-denied",
	);
	await owner`CREATE SCHEMA gateway_runtime`;
	await owner`GRANT USAGE ON SCHEMA gateway_runtime TO gateway_runtime`;
	try {
		await assert.rejects(
			assertRuntimeDatabase(runtime),
			"runtime search path must not include a shadow schema",
		);
	} finally {
		await owner`DROP SCHEMA gateway_runtime`;
	}
	console.log("PASS runtime-search-path-rejects-shadow-schema");
	for (const permission of ["UPDATE", "DELETE", "TRUNCATE"] as const) {
		await owner.unsafe(`GRANT ${permission} ON gw_audit TO gateway_runtime`);
		try {
			await assert.rejects(assertRuntimeDatabase(runtime));
		} finally {
			await owner.unsafe(
				`REVOKE ${permission} ON gw_audit FROM gateway_runtime`,
			);
		}
	}
	await owner`CREATE ROLE gateway_evidence_writer`;
	await owner`GRANT UPDATE ON gw_audit TO gateway_evidence_writer`;
	await owner`GRANT gateway_evidence_writer TO gateway_runtime`;
	try {
		await assert.rejects(assertRuntimeDatabase(runtime));
	} finally {
		await owner`REVOKE gateway_evidence_writer FROM gateway_runtime`;
	}
	await owner`GRANT CREATE ON SCHEMA public TO gateway_runtime`;
	try {
		await assert.rejects(assertRuntimeDatabase(runtime));
	} finally {
		await owner`REVOKE CREATE ON SCHEMA public FROM gateway_runtime`;
	}
	await owner`GRANT CREATE ON DATABASE postgres TO gateway_runtime`;
	try {
		await assert.rejects(assertRuntimeDatabase(runtime));
	} finally {
		await owner`REVOKE CREATE ON DATABASE postgres FROM gateway_runtime`;
	}
	await owner`CREATE ROLE gateway_owner`;
	await owner`ALTER TABLE gw_audit OWNER TO gateway_owner`;
	await owner`GRANT gateway_owner TO gateway_runtime`;
	try {
		await assert.rejects(assertRuntimeDatabase(runtime));
	} finally {
		await owner`REVOKE gateway_owner FROM gateway_runtime`;
	}
	await assertRuntimeDatabase(runtime);
	console.log(
		"PASS effective-runtime-privileges-direct-inherited-owner-and-schema-create",
	);
} finally {
	await runtime.end();
	await owner.end();
}
