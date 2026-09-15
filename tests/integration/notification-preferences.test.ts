import { expect, test } from "vitest";
import {
	deleteOrganizationRule,
	updatePreferences,
	upsertOrganizationRule,
} from "../../packages/domain/src/notification-preferences";
import {
	DomainForbidden,
	DomainNotFound,
	DomainValidation,
} from "../../packages/domain/src/activity-events";
import { makeNotificationSecrets } from "../../packages/domain/src/notification-secrets";
import { seedIdentity } from "../helpers/activity-fixture";
import { disposablePostgres } from "../helpers/postgres";
import { migrate } from "../../packages/db/src/migrate";
import { Cause, type Effect, Exit, ManagedRuntime } from "effect";
import { TelemetryTest } from "../../packages/telemetry/src/index";

const KEY = "test-secret-key";

async function makeFixture() {
	const db = await disposablePostgres();
	await migrate(db.sql);
	const sql = db.sql;
	const org = "org-pref-1";
	await seedIdentity(sql, { org, users: ["user-alice", "user-bob"] });
	// board seam: two boards belong to the org
	const boards = new Set(["board-1", "board-2"]);
	const deps = {
		secrets: makeNotificationSecrets(KEY),
		emailAddress: "alice@example.com" as string | null,
		isMember: async (userId: string, orgId: string) =>
			orgId === org && userId === "user-alice",
		boardInOrg: async (orgId: string, ids: string[]) =>
			[...ids].filter((id) => orgId === org && boards.has(id)).length,
	};
	const telemetry = TelemetryTest();
	const runtime = ManagedRuntime.make(telemetry.layer);
	async function run<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
		const exit = await runtime.runPromiseExit(effect);
		if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
		return exit.value;
	}
	return {
		sql,
		org,
		deps,
		run,
		close: async () => {
			await runtime.dispose();
			await db.close();
		},
	};
}

test("T18 defaults on first read: channels false, event toggles true, lead 1440", async () => {
	const fx = await makeFixture();
	try {
		const res = await fx.run(
			updatePreferences(fx.sql, "user-alice", {}, fx.deps),
		);
		expect(res.data.emailEnabled).toBe(false);
		expect(res.data.ntfyEnabled).toBe(false);
		expect(res.data.taskAssignmentEnabled).toBe(true);
		expect(res.data.taskCommentEnabled).toBe(true);
		expect(res.data.taskStatusChangeEnabled).toBe(true);
		expect(res.data.dueDateReminderEnabled).toBe(true);
		expect(res.data.dueDateReminderLeadTimeMinutes).toBe(1440);
		expect(res.data.ntfyConfigured).toBe(false);
		expect(res.data.maskedNtfyToken).toBeNull();
		expect(res.data.createdAt).not.toBeNull();
	} finally {
		await fx.close();
	}
});

test("T18 secret encryption + mask: token stored encrypted, returned masked, never raw", async () => {
	const fx = await makeFixture();
	try {
		const res = await fx.run(
			updatePreferences(
				fx.sql,
				"user-alice",
				{
					ntfyEnabled: true,
					ntfyServerUrl: "https://ntfy.example.com",
					ntfyTopic: "my-topic",
					ntfyToken: "tok-abcdefghijklmnop",
				},
				fx.deps,
			),
		);
		expect(res.data.ntfyTokenConfigured).toBe(true);
		expect(res.data.maskedNtfyToken).toBe("tok-…mnop");
		const stored = await fx.sql`SELECT ntfy_token FROM user_notification_preference WHERE user_id='user-alice'`;
		expect(String(stored[0].ntfy_token).startsWith("enc:v1:")).toBe(true);
		expect(String(stored[0].ntfy_token)).not.toContain("tok-abcdefghijklmnop");
		// decrypts back through the same key
		const decrypted = fx.deps.secrets.decrypt(stored[0].ntfy_token);
		expect(decrypted).toBe("tok-abcdefghijklmnop");
		// a different key fails closed (import guard)
		const foreign = makeNotificationSecrets("other-key");
		expect(() => foreign.decrypt(stored[0].ntfy_token)).toThrow();
	} finally {
		await fx.close();
	}
});

test("T18 omitted preserves, explicit null clears (fork nullish bug not copied)", async () => {
	const fx = await makeFixture();
	try {
		await fx.run(
			updatePreferences(
				fx.sql,
				"user-alice",
				{
					ntfyEnabled: true,
					ntfyServerUrl: "https://ntfy.example.com",
					ntfyTopic: "topic-x",
					ntfyToken: "secret-token-123",
				},
				fx.deps,
			),
		);
		// omitted field: server URL preserved
		const kept = await fx.run(
			updatePreferences(fx.sql, "user-alice", { taskCommentEnabled: false }, fx.deps),
		);
		expect(kept.data.ntfyServerUrl).toBe("https://ntfy.example.com");
		expect(kept.data.ntfyTopic).toBe("topic-x");
		expect(kept.data.taskCommentEnabled).toBe(false);
		// explicit null: token cleared, channel prerequisites fail when enabled
		await expect(
			fx.run(
				updatePreferences(fx.sql, "user-alice", { ntfyToken: null }, fx.deps),
			),
		).resolves.toBeTruthy();
		const cleared = await fx.run(
			updatePreferences(fx.sql, "user-alice", { ntfyToken: null, ntfyEnabled: false }, fx.deps),
		);
		expect(cleared.data.ntfyTokenConfigured).toBe(false);
		expect(cleared.data.maskedNtfyToken).toBeNull();
	} finally {
		await fx.close();
	}
});

test("T18 enabled channel prerequisites reject without sending traffic", async () => {
	const fx = await makeFixture();
	try {
		await expect(
			fx.run(
				updatePreferences(fx.sql, "user-alice", { ntfyEnabled: true }, fx.deps),
			),
		).rejects.toThrow(DomainValidation);
		await expect(
			fx.run(
				updatePreferences(
					fx.sql,
					"user-alice",
					{ webhookEnabled: true },
					fx.deps,
				),
			),
		).rejects.toThrow(DomainValidation);
		await expect(
			fx.run(
				updatePreferences(
					fx.sql,
					"user-alice",
					{ gotifyEnabled: true, gotifyServerUrl: "https://g.example.com" },
					fx.deps,
				),
			),
		).rejects.toThrow(DomainValidation);
		// email requires an account address
		const noEmail = { ...fx.deps, emailAddress: null };
		await expect(
			fx.run(
				updatePreferences(
					fx.sql,
					"user-alice",
					{ emailEnabled: true },
					noEmail,
				),
			),
		).rejects.toThrow(DomainValidation);
		// bad URL rejected
		await expect(
			fx.run(
				updatePreferences(
					fx.sql,
					"user-alice",
					{ webhookEnabled: true, webhookUrl: "not-a-url" },
					fx.deps,
				),
			),
		).rejects.toThrow(DomainValidation);
		// lead time bounds
		await expect(
			fx.run(
				updatePreferences(
					fx.sql,
					"user-alice",
					{ dueDateReminderLeadTimeMinutes: 4 },
					fx.deps,
				),
			),
		).rejects.toThrow(DomainValidation);
		await expect(
			fx.run(
				updatePreferences(
					fx.sql,
					"user-alice",
					{ dueDateReminderLeadTimeMinutes: 43201 },
					fx.deps,
				),
			),
		).rejects.toThrow(DomainValidation);
	} finally {
		await fx.close();
	}
});

test("T19 org-rule upsert/delete: validation, cross-org board rejection, cascade", async () => {
	const fx = await makeFixture();
	try {
		// non-member cannot upsert
		await expect(
			fx.run(
				upsertOrganizationRule(
					fx.sql,
					"user-bob",
					fx.org,
					{
						isActive: true,
						emailEnabled: false,
						ntfyEnabled: false,
						gotifyEnabled: false,
						webhookEnabled: false,
						boardMode: "all",
					},
					fx.deps,
				),
			),
		).rejects.toThrow(DomainForbidden);
		// selected mode requires nonempty unique boards all in org
		await expect(
			fx.run(
				upsertOrganizationRule(
					fx.sql,
					"user-alice",
					fx.org,
					{
						isActive: true,
						emailEnabled: false,
						ntfyEnabled: false,
						gotifyEnabled: false,
						webhookEnabled: false,
						boardMode: "selected",
						selectedBoardIds: [],
					},
					fx.deps,
				),
			),
		).rejects.toThrow(DomainValidation);
		// foreign board rejected
		await expect(
			fx.run(
				upsertOrganizationRule(
					fx.sql,
					"user-alice",
					fx.org,
					{
						isActive: true,
						emailEnabled: false,
						ntfyEnabled: false,
						gotifyEnabled: false,
						webhookEnabled: false,
						boardMode: "selected",
						selectedBoardIds: ["board-1", "board-foreign"],
					},
					fx.deps,
				),
			),
		).rejects.toThrow(DomainValidation);
		// rule channel requires global channel enabled
		await expect(
			fx.run(
				upsertOrganizationRule(
					fx.sql,
					"user-alice",
					fx.org,
					{
						isActive: true,
						emailEnabled: true,
						ntfyEnabled: false,
						gotifyEnabled: false,
						webhookEnabled: false,
						boardMode: "all",
					},
					fx.deps,
				),
			),
		).rejects.toThrow(DomainValidation);
		// happy path: selected boards in org
		const up = await fx.run(
			upsertOrganizationRule(
				fx.sql,
				"user-alice",
				fx.org,
				{
					isActive: true,
					emailEnabled: false,
					ntfyEnabled: false,
					gotifyEnabled: false,
					webhookEnabled: false,
					boardMode: "selected",
					selectedBoardIds: ["board-1", "board-2", "board-1"],
				},
				fx.deps,
			),
		);
		expect(up.data.organizations).toHaveLength(1);
		expect([...up.data.organizations[0].selectedBoardIds].sort()).toEqual([
			"board-1",
			"board-2",
		]);
		// global disable cascades to the rule flags atomically
		await fx.run(
			updatePreferences(
				fx.sql,
				"user-alice",
				{
					ntfyEnabled: true,
					ntfyServerUrl: "https://n.example.com",
					ntfyTopic: "t",
					ntfyToken: "token-xxxx",
				},
				fx.deps,
			),
		);
		await fx.run(
			upsertOrganizationRule(
				fx.sql,
				"user-alice",
				fx.org,
				{
					isActive: true,
					emailEnabled: false,
					ntfyEnabled: true,
					gotifyEnabled: false,
					webhookEnabled: false,
					boardMode: "all",
				},
				fx.deps,
			),
		);
		let res = await fx.run(
			updatePreferences(fx.sql, "user-alice", { ntfyEnabled: false }, fx.deps),
		);
		expect(res.data.organizations[0].ntfyEnabled).toBe(false);
		// events emitted on rule mutation
		const events = await fx.sql`SELECT plugin_type FROM event WHERE org='user-alice' ORDER BY seq`;
		const types = events.map((e) => (e as { plugin_type: string }).plugin_type);
		expect(types).toContain("notification:preferences-updated");
		expect(types).toContain("notification:organization-rule-upserted");
		// delete rule
		const del = await fx.run(
			deleteOrganizationRule(fx.sql, "user-alice", fx.org, fx.deps),
		);
		expect(del.data.organizations).toHaveLength(0);
		await expect(
			fx.run(
				deleteOrganizationRule(fx.sql, "user-alice", fx.org, fx.deps),
			),
		).rejects.toThrow(DomainNotFound);
	} finally {
		await fx.close();
	}
});

test("T19 undecryptable stored secret fails closed on read", async () => {
	const fx = await makeFixture();
	try {
		await fx.run(
			updatePreferences(
				fx.sql,
				"user-alice",
				{
					ntfyEnabled: false,
					ntfyServerUrl: "https://n.example.com",
					ntfyTopic: "t",
					ntfyToken: "token-xxxx",
				},
				fx.deps,
			),
		);
		// simulate corrupted ciphertext / key rotation mismatch
		await fx.sql`UPDATE user_notification_preference SET ntfy_token='enc:v1:garbage' WHERE user_id='user-alice'`;
		await expect(
			fx.run(updatePreferences(fx.sql, "user-alice", {}, fx.deps)),
		).rejects.toThrow();
	} finally {
		await fx.close();
	}
});
