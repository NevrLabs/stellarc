import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import postgres from "postgres";
import { gatewayAuth } from "./auth";
import { bindIdentity } from "./database";
import { gatewaySchema, gatewayStore } from "./store";

// Owner-only CLI. Runtime never migrates or bootstraps authority.
const ownerUrl = process.env.GATEWAY_OWNER_DATABASE_URL;
const env = (name: string): string => {
	const value = process.env[name];
	if (typeof value !== "string" || !value) throw new Error(`${name} required`);
	return value;
};
if (!ownerUrl || !process.env.GATEWAY_BOOTSTRAP_SUBJECT)
	throw new Error("Owner DSN and explicit bootstrap subject required");
const sql = postgres(ownerUrl, { max: 2, onnotice: () => {} });
const pool = new Pool({ connectionString: ownerUrl, max: 2 });
try {
	await sql.unsafe(gatewaySchema);
	await bindIdentity(
		sql,
		env("GATEWAY_OIDC_ISSUER"),
		env("GATEWAY_OIDC_CLIENT"),
		true,
	);
	const auth = gatewayAuth({
		origin: env("GATEWAY_ORIGIN"),
		issuer: env("GATEWAY_OIDC_ISSUER"),
		clientId: env("GATEWAY_OIDC_CLIENT"),
		clientSecret: env("GATEWAY_OIDC_SECRET"),
		secret: env("GATEWAY_AUTH_SECRET"),
		database: pool,
		authorizationEndpoint: env("GATEWAY_OIDC_AUTHORIZE"),
		tokenEndpoint: env("GATEWAY_OIDC_TOKEN"),
		jwksUri: env("GATEWAY_OIDC_JWKS"),
		approved: gatewayStore(sql).human,
		audit: gatewayStore(sql).securityEvent,
	});
	await (await getMigrations(auth.auth.options)).runMigrations();
	const store = gatewayStore(sql);
	await store.bootstrap(
		"human-operator",
		process.env.GATEWAY_BOOTSTRAP_SUBJECT,
		"personal",
	);
	// Prelink by verified issuer/sub; no registration or email account linking.
	await sql`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES ('human-operator','Stellarc operator','human-operator@identity.invalid',true,now(),now()) ON CONFLICT(id) DO NOTHING`;
	await sql`INSERT INTO account(id,"userId","accountId","providerId","createdAt","updatedAt") VALUES ('zitadel-operator','human-operator',${process.env.GATEWAY_BOOTSTRAP_SUBJECT},'zitadel',now(),now()) ON CONFLICT(id) DO NOTHING`;
	const role = process.env.GATEWAY_RUNTIME_ROLE;
	if (!role || !/^stellarc_gateway_runtime$/.test(role))
		throw new Error("Exact candidate runtime role required");
	await sql.unsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
	await sql.unsafe(
		`GRANT SELECT,INSERT,UPDATE ON gw_principal,gw_credential,gw_delegation,gw_run,gw_audit_state TO "${role}"`,
	);
	await sql.unsafe(
		`GRANT SELECT ON gw_installation,gw_identity_binding TO "${role}"`,
	);
	await sql.unsafe(`GRANT SELECT,INSERT ON gw_audit TO "${role}"`);
	await sql.unsafe(
		`GRANT SELECT,INSERT,UPDATE,DELETE ON "user",account,session,verification TO "${role}"`,
	);
	console.log("MIGRATION_AND_RUNTIME_GRANTS_VERIFIED");
} finally {
	await sql.end();
	await pool.end();
}
