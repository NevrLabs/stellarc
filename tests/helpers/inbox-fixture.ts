import type { Sql } from "postgres";
import { migrate } from "../../packages/db/src/migrate";
import { seedIdentity } from "./activity-fixture";
import { disposablePostgres } from "./postgres";

/**
 * T15/T16 inbox fixture: one org, two members. Notifications are planted
 * directly (delivery semantics are covered by notification-worker.test.ts).
 */
export interface InboxFixture {
	run<A>(effect: import("effect").Effect.Effect<A, unknown>): Promise<A>;
	org: string;
	alice: string;
	bob: string;
	sql: Sql;
	close(): Promise<void>;
	plant(args: {
		userId: string;
		orgId?: string | null;
		isRead?: boolean;
		type?: string;
	}): Promise<string>;
}

export async function makeInboxFixture(): Promise<InboxFixture> {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const sql: Sql = db.sql;
	const org = "org-ifx-1";
	const alice = "user-alice";
	const bob = "user-bob";
	await seedIdentity(sql, { org, users: [alice, bob] });

	async function plant(args: {
		userId: string;
		orgId?: string | null;
		isRead?: boolean;
		type?: string;
	}): Promise<string> {
		const id = crypto.randomUUID();
		await sql`
      INSERT INTO notification (id, org_id, user_id, title, content, type, is_read)
      VALUES (${id}, ${args.orgId ?? null}, ${args.userId}, 't', 'c',
              ${args.type ?? "info"}, ${args.isRead ?? false})`;
		return id;
	}

	const { ManagedRuntime } = await import("effect");
	const { Layer } = await import("effect");
	const runtime = ManagedRuntime.make(Layer.empty);
	const { Exit, Cause } = await import("effect");
	async function run<A>(
		effect: import("effect").Effect.Effect<A, unknown>,
	): Promise<A> {
		const exit = await runtime.runPromiseExit(effect);
		if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
		return exit.value;
	}

	return {
		org,
		alice,
		bob,
		sql,
		run,
		close: async () => {
			await runtime.dispose();
			await db.close();
		},
		plant,
	};
}
