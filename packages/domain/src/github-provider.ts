import {
	createCipheriv,
	createDecipheriv,
	createHash,
	hkdfSync,
	randomBytes,
} from "node:crypto";
import { Context, Effect, Layer } from "effect";

// STL-18 GitHub provider adapter. Normalization is lossless for the mirror
// columns (T04): provider state open/closed/merged, draft flag, JSON labels,
// assignees and nullable timestamps are preserved; secrets are encrypted at
// rest with AES-256-GCM (T06) under an HKDF key derived from DATABASE_URL,
// so no key distribution step is required.

export const PROVIDERS = ["github"] as const;
export type Provider = (typeof PROVIDERS)[number];

export function isProvider(value: string): value is Provider {
	return (PROVIDERS as readonly string[]).includes(value);
}

type IssueInput = {
	number: number;
	id?: number | string;
	title?: string;
	body?: string | null;
	state?: string;
	user?: { login?: string; avatar_url?: string | null } | null;
	assignees?: Array<{ login?: string }> | null;
	assignee?: { login?: string } | null;
	labels?: Array<{ name?: string; color?: string | null }> | null;
	comments?: number;
	html_url?: string;
	created_at?: string | null;
	updated_at?: string | null;
	closed_at?: string | null;
};

type PullRequestInput = IssueInput & {
	merged?: boolean;
	draft?: boolean;
	head?: { ref?: string } | null;
	base?: { ref?: string } | null;
	additions?: number | null;
	deletions?: number | null;
	changed_files?: number | null;
	merged_at?: string | null;
};

const iso = (value: string | null | undefined): string | null => {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
};

export type RepoRef = { id: string; organization_id: string };

export function normalizeIssue(input: IssueInput, repo: RepoRef) {
	return {
		repo_id: repo.id,
		number: input.number,
		external_id: input.id === undefined ? null : String(input.id),
		title: input.title ?? "",
		body: input.body ?? null,
		state: input.state === "closed" ? "closed" : "open",
		author_login: input.user?.login ?? null,
		author_avatar_url: input.user?.avatar_url ?? null,
		assignee_logins:
			input.assignees
				?.map((assignee) => assignee.login ?? "")
				.filter(Boolean) ??
			(input.assignee ? [input.assignee.login ?? ""] : null),
		labels: input.labels ?? null,
		comment_count: input.comments ?? 0,
		url: input.html_url ?? "",
		external_created_at: iso(input.created_at),
		external_updated_at: iso(input.updated_at),
		closed_at: iso(input.closed_at),
	};
}

export function normalizePullRequest(input: PullRequestInput, repo: RepoRef) {
	const merged = input.merged === true;
	return {
		repo_id: repo.id,
		number: input.number,
		external_id: input.id === undefined ? null : String(input.id),
		title: input.title ?? "",
		body: input.body ?? null,
		state: merged ? "merged" : input.state === "closed" ? "closed" : "open",
		is_draft: input.draft === true,
		author_login: input.user?.login ?? null,
		author_avatar_url: input.user?.avatar_url ?? null,
		head_branch: input.head?.ref ?? null,
		base_branch: input.base?.ref ?? null,
		labels: input.labels ?? null,
		comment_count: input.comments ?? 0,
		additions: input.additions ?? null,
		deletions: input.deletions ?? null,
		changed_files: input.changed_files ?? null,
		url: input.html_url ?? "",
		external_created_at: iso(input.created_at),
		external_updated_at: iso(input.updated_at),
		merged_at: iso(input.merged_at),
		closed_at: iso(input.closed_at),
	};
}

// ---------------------------------------------------------------------------
// Token encryption (T06). Key material: HKDF-SHA256 over DATABASE_URL with a
// fixed app salt; per-token random IV; AES-256-GCM with auth tag appended.
// Ciphertext is prefixed "v1:" and never contains plaintext fragments.
// ---------------------------------------------------------------------------

export function deriveRepositoryKey(databaseUrl: string, salt: string): Buffer {
	return Buffer.from(
		hkdfSync(
			"sha256",
			databaseUrl,
			createHash("sha256").update(salt).digest(),
			"stellarc/github-user-grant/access_token",
			32,
		),
	);
}

export function encryptToken(key: Buffer, plaintext: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptToken(key: Buffer, payload: string): string {
	if (!payload.startsWith("v1:")) throw new Error("Unsupported ciphertext");
	const [ivPart, tagPart, dataPart] = payload.slice(3).split(":");
	if (!ivPart || !tagPart || !dataPart) throw new Error("Malformed ciphertext");
	const decipher = createDecipheriv(
		"aes-256-gcm",
		key,
		Buffer.from(ivPart, "base64"),
	);
	decipher.setAuthTag(Buffer.from(tagPart, "base64"));
	return Buffer.concat([
		decipher.update(Buffer.from(dataPart, "base64")),
		decipher.final(),
	]).toString("utf8");
}

/** Masked fingerprint for logs/telemetry: never the token itself. */
export function tokenFingerprint(payload: string): string {
	return createHash("sha256").update(payload).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------------------
// Service surface (Effect.fn): provider calls are a seam — the adapter maps
// REST payloads to mirror rows; live fetch lands with the webhook transport.
// ---------------------------------------------------------------------------

export class GithubProvider extends Context.Tag("stellarc/GithubProvider")<
	GithubProvider,
	{
		readonly normalizeIssue: (
			input: IssueInput,
			repo: RepoRef,
		) => ReturnType<typeof normalizeIssue>;
		readonly normalizePullRequest: (
			input: PullRequestInput,
			repo: RepoRef,
		) => ReturnType<typeof normalizePullRequest>;
	}
>() {}

export const GithubProviderLive = Layer.succeed(GithubProvider, {
	normalizeIssue,
	normalizePullRequest,
});

export const normalizeIssueEffect = Effect.fn("stellarc.github.normalizeIssue")(
	(input: IssueInput, repo: RepoRef) =>
		Effect.succeed(normalizeIssue(input, repo)),
);

export const normalizePullRequestEffect = Effect.fn(
	"stellarc.github.normalizePullRequest",
)((input: PullRequestInput, repo: RepoRef) =>
	Effect.succeed(normalizePullRequest(input, repo)),
);
