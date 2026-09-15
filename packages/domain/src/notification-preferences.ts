import { Effect } from "effect";
import type { Sql } from "postgres";
import type {
	PreferencePublic,
	PreferenceResponse,
	PreferenceRulePublic,
} from "../../contracts/src/activity-notifications";
import {
	appendEventInTx,
	DomainForbidden,
	DomainNotFound,
	DomainValidation,
	NOTIFICATION_EVENT_TYPES,
} from "./activity-events";
import {
	makeNotificationSecrets,
	maskSecret,
	type NotificationSecrets,
	normalizeOptionalString,
} from "./notification-secrets";
import { safeTxid } from "./activity";

/**
 * T18/T19: global notification preferences + per-org rules (§2/§3).
 * Fork semantics preserved: masking, defaults (event toggles true, channels
 * false, lead time 1440), selected-board validation, global-channel disable
 * cascade; the fork's nullish-coalescing clearing bug is NOT copied — omitted
 * field preserves, explicit null clears.
 */

export interface PreferenceUpdateInput {
	emailEnabled?: boolean;
	ntfyEnabled?: boolean;
	ntfyServerUrl?: string | null;
	ntfyTopic?: string | null;
	ntfyToken?: string | null;
	gotifyEnabled?: boolean;
	gotifyServerUrl?: string | null;
	gotifyToken?: string | null;
	webhookEnabled?: boolean;
	webhookUrl?: string | null;
	webhookSecret?: string | null;
	taskAssignmentEnabled?: boolean;
	taskCommentEnabled?: boolean;
	taskStatusChangeEnabled?: boolean;
	dueDateReminderEnabled?: boolean;
	dueDateReminderLeadTimeMinutes?: number;
}

export interface OrgRuleUpsertInput {
	isActive: boolean;
	emailEnabled: boolean;
	ntfyEnabled: boolean;
	gotifyEnabled: boolean;
	webhookEnabled: boolean;
	boardMode: "all" | "selected";
	selectedBoardIds?: string[];
}

export interface PreferenceDeps {
	readonly secrets: NotificationSecrets;
	/** Account email (identity seam); email channel requires it. */
	readonly emailAddress: string | null;
	/** Organization membership check (STL-15 seam). */
	readonly isMember: (userId: string, orgId: string) => Promise<boolean>;
	/** Board-existence-in-org check (STL-16 seam). */
	readonly boardInOrg: (
		orgId: string,
		boardIds: string[],
	) => Promise<number>;
}

export const LEAD_TIME_MIN = 5;
export const LEAD_TIME_MAX = 43200;

interface PreferenceRowDb {
	user_id: string;
	email_enabled: boolean;
	ntfy_enabled: boolean;
	ntfy_server_url: string | null;
	ntfy_topic: string | null;
	ntfy_token: string | null;
	gotify_enabled: boolean;
	gotify_server_url: string | null;
	gotify_token: string | null;
	webhook_enabled: boolean;
	webhook_url: string | null;
	webhook_secret: string | null;
	task_assignment_enabled: boolean;
	task_comment_enabled: boolean;
	task_status_change_enabled: boolean;
	due_date_reminder_enabled: boolean;
	due_date_reminder_lead_time_minutes: number;
	created_at: Date | string | null;
	updated_at: Date | string | null;
}

interface OrgRuleRowDb {
	id: string;
	user_id: string;
	organization_id: string;
	is_active: boolean;
	email_enabled: boolean;
	ntfy_enabled: boolean;
	gotify_enabled: boolean;
	webhook_enabled: boolean;
	board_mode: string;
	created_at: Date | string;
	updated_at: Date | string;
}

function toPreferencePublic(
	row: PreferenceRowDb | undefined,
	secrets: NotificationSecrets,
): PreferencePublic {
	return {
		id: row?.user_id ?? "",
		userId: row?.user_id ?? "",
		emailEnabled: row?.email_enabled ?? false,
		ntfyEnabled: row?.ntfy_enabled ?? false,
		ntfyConfigured: Boolean(row?.ntfy_server_url && row?.ntfy_topic),
		ntfyTokenConfigured: row ? secrets.decrypt(row.ntfy_token) !== null : false,
		gotifyEnabled: row?.gotify_enabled ?? false,
		gotifyConfigured: Boolean(row?.gotify_server_url && row?.gotify_token),
		gotifyTokenConfigured: row ? secrets.decrypt(row.gotify_token) !== null : false,
		webhookEnabled: row?.webhook_enabled ?? false,
		webhookConfigured: Boolean(row?.webhook_url),
		webhookSecretConfigured: row
			? secrets.decrypt(row.webhook_secret) !== null
			: false,
		taskAssignmentEnabled: row?.task_assignment_enabled ?? true,
		taskCommentEnabled: row?.task_comment_enabled ?? true,
		taskStatusChangeEnabled: row?.task_status_change_enabled ?? true,
		dueDateReminderEnabled: row?.due_date_reminder_enabled ?? true,
		dueDateReminderLeadTimeMinutes:
			row?.due_date_reminder_lead_time_minutes ?? 1440,
		createdAt: row?.created_at ? new Date(row.created_at) : null,
		updatedAt: row?.updated_at ? new Date(row.updated_at) : null,
	};
}

async function readOrgRules(
	sql: Sql,
	userId: string,
): Promise<PreferenceRulePublic[]> {
	const rules = await sql<OrgRuleRowDb[]>`
    SELECT r.id, r.user_id, r.organization_id, r.is_active, r.email_enabled,
           r.ntfy_enabled, r.gotify_enabled, r.webhook_enabled, r.board_mode,
           r.created_at, r.updated_at
    FROM user_notification_org_rule r
    WHERE r.user_id = ${userId}
    ORDER BY r.created_at, r.id`;
	const boards = await sql<{ org_rule_id: string; board_id: string }[]>`
    SELECT org_rule_id, board_id FROM user_notification_org_board`;
	const byRule = new Map<string, string[]>();
	for (const b of boards) {
		const list = byRule.get(b.org_rule_id) ?? [];
		list.push(b.board_id);
		byRule.set(b.org_rule_id, list);
	}
	return rules.map((r) => ({
		id: r.id,
		userId: r.user_id,
		organizationId: r.organization_id,
		organizationName: "",
		isActive: r.is_active,
		emailEnabled: r.email_enabled,
		ntfyEnabled: r.ntfy_enabled,
		gotifyEnabled: r.gotify_enabled,
		webhookEnabled: r.webhook_enabled,
		boardMode: r.board_mode === "selected" ? "selected" : "all",
		selectedBoardIds: byRule.get(r.id) ?? [],
		createdAt: new Date(r.created_at),
		updatedAt: new Date(r.updated_at),
	}));
}

async function readResponse(
	sql: Sql,
	userId: string,
	deps: PreferenceDeps,
): Promise<PreferenceResponse> {
	const prefRows = await sql<PreferenceRowDb[]>`
    SELECT * FROM user_notification_preference WHERE user_id = ${userId}`;
	const row = prefRows[0];
	const rules = await readOrgRules(sql, userId);
	return {
		...toPreferencePublic(row, deps.secrets),
		emailAddress: deps.emailAddress,
		ntfyServerUrl: row?.ntfy_server_url ?? null,
		ntfyTopic: row?.ntfy_topic ?? null,
		gotifyServerUrl: row?.gotify_server_url ?? null,
		webhookUrl: row?.webhook_url ?? null,
		maskedNtfyToken: maskSecret(row ? deps.secrets.decrypt(row.ntfy_token) : null),
		maskedGotifyToken: maskSecret(
			row ? deps.secrets.decrypt(row.gotify_token) : null,
		),
		maskedWebhookSecret: maskSecret(
			row ? deps.secrets.decrypt(row.webhook_secret) : null,
		),
		organizations: rules,
	};
}

function validateLeadTime(minutes: number): void {
	if (!Number.isInteger(minutes) || minutes < LEAD_TIME_MIN || minutes > LEAD_TIME_MAX)
		throw new DomainValidation("dueDateReminderLeadTimeMinutes");
}

function validateUrl(value: string, code: string): void {
	try {
		new URL(value);
	} catch {
		throw new DomainValidation(code);
	}
}

export const getPreferences = (
	sql: Sql,
	userId: string,
	deps: PreferenceDeps,
): Effect.Effect<PreferenceResponse, unknown> =>
	Effect.fn("Domain.notificationPreferences.get")(function* () {
		return yield* Effect.tryPromise(() => readResponse(sql, userId, deps));
	})();

export const updatePreferences = (
	sql: Sql,
	userId: string,
	input: PreferenceUpdateInput,
	deps: PreferenceDeps,
): Effect.Effect<
	{ data: PreferenceResponse; txid: number },
	unknown
> =>
	Effect.fn("Domain.notificationPreferences.update")(function* () {
		if (input.dueDateReminderLeadTimeMinutes !== undefined)
			validateLeadTime(input.dueDateReminderLeadTimeMinutes);
		const result = yield* Effect.tryPromise({
			try: () =>
				sql.begin(
					async (
						tx,
					): Promise<{ data: PreferenceResponse; txid: number }> => {
						const rows = await tx<PreferenceRowDb[]>`
              SELECT * FROM user_notification_preference WHERE user_id = ${userId} FOR UPDATE`;
						const existing = rows[0];
						// Resolve each field: omitted preserves, explicit null clears,
						// explicit string sets (fork's ?? clearing bug not copied).
						const next = {
							emailEnabled:
								input.emailEnabled ?? existing?.email_enabled ?? false,
							ntfyEnabled:
								input.ntfyEnabled ?? existing?.ntfy_enabled ?? false,
							ntfyServerUrl:
								input.ntfyServerUrl !== undefined
									? normalizeOptionalString(input.ntfyServerUrl)
									: (existing?.ntfy_server_url ?? null),
							ntfyTopic:
								input.ntfyTopic !== undefined
									? normalizeOptionalString(input.ntfyTopic)
									: (existing?.ntfy_topic ?? null),
							ntfyToken:
								input.ntfyToken !== undefined
									? deps.secrets.encrypt(normalizeOptionalString(input.ntfyToken))
									: (existing?.ntfy_token ?? null),
							gotifyEnabled:
								input.gotifyEnabled ?? existing?.gotify_enabled ?? false,
							gotifyServerUrl:
								input.gotifyServerUrl !== undefined
									? normalizeOptionalString(input.gotifyServerUrl)
									: (existing?.gotify_server_url ?? null),
							gotifyToken:
								input.gotifyToken !== undefined
									? deps.secrets.encrypt(normalizeOptionalString(input.gotifyToken))
									: (existing?.gotify_token ?? null),
							webhookEnabled:
								input.webhookEnabled ?? existing?.webhook_enabled ?? false,
							webhookUrl:
								input.webhookUrl !== undefined
									? normalizeOptionalString(input.webhookUrl)
									: (existing?.webhook_url ?? null),
							webhookSecret:
								input.webhookSecret !== undefined
									? deps.secrets.encrypt(
											normalizeOptionalString(input.webhookSecret),
										)
									: (existing?.webhook_secret ?? null),
							taskAssignmentEnabled:
								input.taskAssignmentEnabled ??
								existing?.task_assignment_enabled ??
								true,
							taskCommentEnabled:
								input.taskCommentEnabled ??
								existing?.task_comment_enabled ??
								true,
							taskStatusChangeEnabled:
								input.taskStatusChangeEnabled ??
								existing?.task_status_change_enabled ??
								true,
							dueDateReminderEnabled:
								input.dueDateReminderEnabled ??
								existing?.due_date_reminder_enabled ??
								true,
							dueDateReminderLeadTimeMinutes:
								input.dueDateReminderLeadTimeMinutes ??
								existing?.due_date_reminder_lead_time_minutes ??
								1440,
						};
						// Enabled channel prerequisites (no traffic sent — §3).
						if (next.ntfyEnabled && (!next.ntfyServerUrl || !next.ntfyTopic))
							throw new DomainValidation("ntfy requires server URL and topic");
						if (next.gotifyEnabled && (!next.gotifyServerUrl || next.gotifyToken === null))
							throw new DomainValidation("gotify requires server URL and token");
						if (next.webhookEnabled && !next.webhookUrl)
							throw new DomainValidation("webhook requires endpoint URL");
						if (next.emailEnabled && !deps.emailAddress)
							throw new DomainValidation("email requires account address");
						if (next.ntfyServerUrl) validateUrl(next.ntfyServerUrl, "ntfyServerUrl");
						if (next.gotifyServerUrl)
							validateUrl(next.gotifyServerUrl, "gotifyServerUrl");
						if (next.webhookUrl) validateUrl(next.webhookUrl, "webhookUrl");
						const now = new Date();
						if (existing) {
							await tx`UPDATE user_notification_preference SET
                email_enabled=${next.emailEnabled}, ntfy_enabled=${next.ntfyEnabled},
                ntfy_server_url=${next.ntfyServerUrl}, ntfy_topic=${next.ntfyTopic},
                ntfy_token=${next.ntfyToken}, gotify_enabled=${next.gotifyEnabled},
                gotify_server_url=${next.gotifyServerUrl}, gotify_token=${next.gotifyToken},
                webhook_enabled=${next.webhookEnabled}, webhook_url=${next.webhookUrl},
                webhook_secret=${next.webhookSecret},
                task_assignment_enabled=${next.taskAssignmentEnabled},
                task_comment_enabled=${next.taskCommentEnabled},
                task_status_change_enabled=${next.taskStatusChangeEnabled},
                due_date_reminder_enabled=${next.dueDateReminderEnabled},
                due_date_reminder_lead_time_minutes=${next.dueDateReminderLeadTimeMinutes},
                updated_at=${now}
              WHERE user_id=${userId}`;
						} else {
							await tx`INSERT INTO user_notification_preference
                (user_id, email_enabled, ntfy_enabled, ntfy_server_url, ntfy_topic,
                 ntfy_token, gotify_enabled, gotify_server_url, gotify_token,
                 webhook_enabled, webhook_url, webhook_secret,
                 task_assignment_enabled, task_comment_enabled,
                 task_status_change_enabled, due_date_reminder_enabled,
                 due_date_reminder_lead_time_minutes, created_at, updated_at)
              VALUES (${userId}, ${next.emailEnabled}, ${next.ntfyEnabled},
                ${next.ntfyServerUrl}, ${next.ntfyTopic}, ${next.ntfyToken},
                ${next.gotifyEnabled}, ${next.gotifyServerUrl}, ${next.gotifyToken},
                ${next.webhookEnabled}, ${next.webhookUrl}, ${next.webhookSecret},
                ${next.taskAssignmentEnabled}, ${next.taskCommentEnabled},
                ${next.taskStatusChangeEnabled}, ${next.dueDateReminderEnabled},
                ${next.dueDateReminderLeadTimeMinutes}, ${now}, ${now})`;
						}
						// Global-channel disable cascade (§3, mirrors fork): turning a
						// channel off (or losing its config) clears the flag on active
						// org rules that had it on.
						const cascade: Record<string, boolean> = {};
						if (!next.emailEnabled) cascade.email_enabled = false;
						if (!next.ntfyEnabled || !next.ntfyServerUrl || !next.ntfyTopic)
							cascade.ntfy_enabled = false;
						if (!next.gotifyEnabled || next.gotifyToken === null)
							cascade.gotify_enabled = false;
						if (!next.webhookEnabled || !next.webhookUrl)
							cascade.webhook_enabled = false;
						if (Object.keys(cascade).length > 0) {
							const sets = Object.entries(cascade)
								.map(([col, val]) => `${col}=${val}`)
								.join(", ");
							await tx`UPDATE user_notification_org_rule SET ${sql.raw(sets)}, updated_at=${now}
                WHERE user_id=${userId} AND is_active=true AND (
                  email_enabled=true OR ntfy_enabled=true OR gotify_enabled=true OR webhook_enabled=true)`;
						}
						const { txidText } = await appendEventInTx(
							tx,
							userId,
							userId,
							NOTIFICATION_EVENT_TYPES.preferencesUpdated,
							JSON.stringify({
								id: userId,
								userId,
								row: {
									emailEnabled: next.emailEnabled,
									ntfyEnabled: next.ntfyEnabled,
									gotifyEnabled: next.gotifyEnabled,
									webhookEnabled: next.webhookEnabled,
									taskAssignmentEnabled: next.taskAssignmentEnabled,
									taskCommentEnabled: next.taskCommentEnabled,
									taskStatusChangeEnabled: next.taskStatusChangeEnabled,
									dueDateReminderEnabled: next.dueDateReminderEnabled,
									dueDateReminderLeadTimeMinutes:
										next.dueDateReminderLeadTimeMinutes,
								},
							}),
						);
						return {
							data: await readResponse(tx as unknown as Sql, userId, deps),
							txid: safeTxid(txidText),
						};
					},
				),
			catch: (cause) => cause,
		});
		return result;
	})();

export const upsertOrganizationRule = (
	sql: Sql,
	userId: string,
	organizationId: string,
	input: OrgRuleUpsertInput,
	deps: PreferenceDeps,
): Effect.Effect<{ data: PreferenceResponse; txid: number }, unknown> =>
	Effect.fn("Domain.notificationPreferences.upsertOrgRule")(function* () {
		if (!(yield* Effect.tryPromise(() =>
			deps.isMember(userId, organizationId),
		)))
			throw new DomainForbidden();
		const result = yield* Effect.tryPromise({
			try: () =>
				sql.begin(
					async (
						tx,
					): Promise<{ data: PreferenceResponse; txid: number }> => {
						if (input.boardMode === "selected") {
							const ids = [...new Set(input.selectedBoardIds ?? [])];
							if (ids.length === 0)
								throw new DomainValidation("selected mode requires boards");
							const found = await deps.boardInOrg(organizationId, ids);
							if (found !== ids.length)
								throw new DomainValidation("board not in organization");
						}
						const prefRows = await tx<PreferenceRowDb[]>`
              SELECT * FROM user_notification_preference WHERE user_id = ${userId}`;
						const pref = prefRows[0];
						// Rule channel enable requires the global channel enabled+configured.
						if (
							input.emailEnabled &&
							(!pref?.email_enabled || !deps.emailAddress)
						)
							throw new DomainValidation("enable email globally first");
						if (
							input.ntfyEnabled &&
							(!pref?.ntfy_enabled || !pref?.ntfy_server_url || !pref?.ntfy_topic)
						)
							throw new DomainValidation("enable ntfy globally first");
						if (
							input.gotifyEnabled &&
							(!pref?.gotify_enabled ||
								!pref?.gotify_server_url ||
								pref?.gotify_token === null)
						)
							throw new DomainValidation("enable gotify globally first");
						if (
							input.webhookEnabled &&
							(!pref?.webhook_enabled || !pref?.webhook_url)
						)
							throw new DomainValidation("enable webhook globally first");
						const now = new Date();
						const rows = await tx<{ id: string }[]>`
              INSERT INTO user_notification_org_rule
                (user_id, organization_id, is_active, email_enabled, ntfy_enabled,
                 gotify_enabled, webhook_enabled, board_mode, created_at, updated_at)
              VALUES (${userId}, ${organizationId}, ${input.isActive},
                ${input.emailEnabled}, ${input.ntfyEnabled}, ${input.gotifyEnabled},
                ${input.webhookEnabled}, ${input.boardMode}, ${now}, ${now})
              ON CONFLICT (user_id, organization_id) DO UPDATE SET
                is_active=EXCLUDED.is_active, email_enabled=EXCLUDED.email_enabled,
                ntfy_enabled=EXCLUDED.ntfy_enabled, gotify_enabled=EXCLUDED.gotify_enabled,
                webhook_enabled=EXCLUDED.webhook_enabled, board_mode=EXCLUDED.board_mode,
                updated_at=EXCLUDED.updated_at
              RETURNING id`;
						const ruleId = rows[0].id;
						await tx`DELETE FROM user_notification_org_board WHERE org_rule_id=${ruleId}`;
						if (input.boardMode === "selected") {
							for (const boardId of new Set(input.selectedBoardIds ?? [])) {
								await tx`INSERT INTO user_notification_org_board
                  (organization_id, org_rule_id, board_id, created_at, updated_at)
                VALUES (${organizationId}, ${ruleId}, ${boardId}, ${now}, ${now})
                ON CONFLICT (org_rule_id, board_id) DO NOTHING`;
							}
						}
						const { txidText } = await appendEventInTx(
							tx,
							userId,
							userId,
							NOTIFICATION_EVENT_TYPES.organizationRuleUpserted,
							JSON.stringify({ id: ruleId, userId, organizationId }),
						);
						return {
							data: await readResponse(tx as unknown as Sql, userId, deps),
							txid: safeTxid(txidText),
						};
					},
				),
			catch: (cause) => cause,
		});
		return result;
	})();

export const deleteOrganizationRule = (
	sql: Sql,
	userId: string,
	organizationId: string,
	deps: PreferenceDeps,
): Effect.Effect<{ data: PreferenceResponse; txid: number }, unknown> =>
	Effect.fn("Domain.notificationPreferences.deleteOrgRule")(function* () {
		if (!(yield* Effect.tryPromise(() =>
			deps.isMember(userId, organizationId),
		)))
			throw new DomainForbidden();
		const result = yield* Effect.tryPromise({
			try: () =>
				sql.begin(
					async (
						tx,
					): Promise<{ data: PreferenceResponse; txid: number }> => {
						const rows = await tx<{ id: string }[]>`
              SELECT id FROM user_notification_org_rule
              WHERE user_id = ${userId} AND organization_id = ${organizationId}
              FOR UPDATE`;
						const row = rows[0];
						if (!row) throw new DomainNotFound();
						await tx`DELETE FROM user_notification_org_board WHERE org_rule_id=${row.id}`;
						await tx`DELETE FROM user_notification_org_rule WHERE id=${row.id}`;
						const { txidText } = await appendEventInTx(
							tx,
							userId,
							userId,
							NOTIFICATION_EVENT_TYPES.organizationRuleDeleted,
							JSON.stringify({ id: row.id, userId, organizationId }),
						);
						return {
							data: await readResponse(tx as unknown as Sql, userId, deps),
							txid: safeTxid(txidText),
						};
					},
				),
			catch: (cause) => cause,
		});
		return result;
	})();
