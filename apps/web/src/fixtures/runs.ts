/*
 * Run-detail fixtures (NEVR-624): per-attempt context receipts exactly as the
 * plane's read path serves them (getTask → receipts; the store view over
 * agents:context-receipt events). Metadata only — sizes and 12-char SHA-256
 * prefixes, never content — mirroring the wire shape 1:1 so the NEVR-434
 * data swap replaces this source, not the component. Hashes are real
 * SHA-256 prefixes of the underlying fixture strings.
 */
export interface RunReceiptRow {
	readonly attempt: number;
	readonly position: number;
	readonly kind:
		| "instructions"
		| "prompt"
		| "resume-digest"
		| "mcp-server"
		| "file"
		| "other";
	readonly name: string;
	readonly bytes: number;
	readonly sha256: string;
	readonly delivery: "inline" | "reference";
	readonly confidence: "seeded" | "referenced" | "unknown";
}

/** s-229 "Preserve partial transcript": attempt 1 seeded cold, attempt 2 is
 * the lease-expiry retry — same instructions/prompt/MCP (identical hashes;
 * that is the change-detection signal), plus the resume-digest row. */
const s229: RunReceiptRow[] = [
	{
		attempt: 1,
		position: 0,
		kind: "instructions",
		name: "instructions",
		bytes: 101,
		sha256: "59c8775f0d15",
		delivery: "inline",
		confidence: "seeded",
	},
	{
		attempt: 1,
		position: 1,
		kind: "prompt",
		name: "prompt",
		bytes: 133,
		sha256: "1d6097be2a8d",
		delivery: "inline",
		confidence: "seeded",
	},
	{
		attempt: 1,
		position: 2,
		kind: "mcp-server",
		name: "github",
		bytes: 117,
		sha256: "11f62feb294e",
		delivery: "reference",
		confidence: "referenced",
	},
	{
		attempt: 1,
		position: 3,
		kind: "mcp-server",
		name: "kaneo",
		bytes: 57,
		sha256: "884fb0eb6845",
		delivery: "reference",
		confidence: "referenced",
	},
	{
		attempt: 2,
		position: 0,
		kind: "instructions",
		name: "instructions",
		bytes: 101,
		sha256: "59c8775f0d15",
		delivery: "inline",
		confidence: "seeded",
	},
	{
		attempt: 2,
		position: 1,
		kind: "resume-digest",
		name: "resume:attempt-1",
		bytes: 124,
		sha256: "ec6919189e37",
		delivery: "inline",
		confidence: "seeded",
	},
	{
		attempt: 2,
		position: 2,
		kind: "prompt",
		name: "prompt",
		bytes: 133,
		sha256: "1d6097be2a8d",
		delivery: "inline",
		confidence: "seeded",
	},
	{
		attempt: 2,
		position: 3,
		kind: "mcp-server",
		name: "github",
		bytes: 117,
		sha256: "11f62feb294e",
		delivery: "reference",
		confidence: "referenced",
	},
	{
		attempt: 2,
		position: 4,
		kind: "mcp-server",
		name: "kaneo",
		bytes: 57,
		sha256: "884fb0eb6845",
		delivery: "reference",
		confidence: "referenced",
	},
];

/** s-419 "Deps to latest": one clean attempt, one MCP server. */
const s419: RunReceiptRow[] = [
	{
		attempt: 1,
		position: 0,
		kind: "instructions",
		name: "instructions",
		bytes: 101,
		sha256: "59c8775f0d15",
		delivery: "inline",
		confidence: "seeded",
	},
	{
		attempt: 1,
		position: 1,
		kind: "prompt",
		name: "prompt",
		bytes: 88,
		sha256: "ae6936caf91f",
		delivery: "inline",
		confidence: "seeded",
	},
	{
		attempt: 1,
		position: 2,
		kind: "mcp-server",
		name: "kaneo",
		bytes: 57,
		sha256: "884fb0eb6845",
		delivery: "reference",
		confidence: "referenced",
	},
];

export const runReceipts: Record<string, RunReceiptRow[]> = {
	"s-229": s229,
	"s-419": s419,
};
