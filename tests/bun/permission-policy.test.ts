import { describe, expect, test } from "bun:test";
import {
	classifyPermission,
	policyOverlap,
	toolGlobsIntersect,
	toolMatches,
} from "../../packages/agents/src/policy";
import type { PermissionPolicy } from "../../packages/agents/src/protocol";

// NEVR-701 — canonical permission-policy semantics. The glob grammar and the
// ask > autoAllow > null-legacy classification live in packages/agents/src/
// policy so the node's per-request evaluation and the plane's
// registration-time conflict check cannot drift apart; these tests pin the
// shared behavior both sides rely on.

describe("toolMatches (glob grammar)", () => {
	test("exact name matches itself", () => {
		expect(toolMatches("deploy", "deploy")).toBe(true);
		expect(toolMatches("deploy", "destroy")).toBe(false);
	});
	test("* spans within a dot-separated segment", () => {
		expect(toolMatches("mcp:github.*", "mcp:github.create_issue")).toBe(true);
	});
	test("no cross-segment wildcard", () => {
		expect(toolMatches("mcp:github.*", "mcp:github.org.create")).toBe(false);
		expect(toolMatches("*", "a.b")).toBe(false);
		expect(toolMatches("*", "deploy")).toBe(true);
	});
	test("? is one non-dot char", () => {
		expect(toolMatches("depl?y", "deploy")).toBe(true);
		expect(toolMatches("depl?y", "deply")).toBe(false);
		expect(toolMatches("depl?y", "deployy")).toBe(false);
	});
	test("regex metacharacters in a pattern are literal", () => {
		expect(toolMatches("a+b", "a+b")).toBe(true);
		expect(toolMatches("a+b", "aab")).toBe(false);
		expect(toolMatches("tool(x)", "tool(x)")).toBe(true);
	});
});

describe("toolGlobsIntersect (registration conflict check)", () => {
	test("the #9927 shape: a broad auto glob overlaps a narrower ask glob", () => {
		expect(toolGlobsIntersect("mcp:github.*", "mcp:github.create_*")).toBe(
			true,
		);
	});
	test("disjoint literal prefixes stay disjoint", () => {
		expect(toolGlobsIntersect("deploy", "destroy")).toBe(false);
		expect(toolGlobsIntersect("mcp:github.create_*", "mcp:github.list_*")).toBe(
			false,
		);
	});
	test("identical patterns overlap", () => {
		expect(toolGlobsIntersect("deploy", "deploy")).toBe(true);
		expect(toolGlobsIntersect("mcp:*.write_*", "mcp:*.write_*")).toBe(true);
	});
	test("a star may span several of the other pattern's tokens", () => {
		expect(toolGlobsIntersect("a*", "a.b")).toBe(false); // star cannot cross the dot
		expect(toolGlobsIntersect("a.*", "a.b")).toBe(true);
		expect(toolGlobsIntersect("a.*", "a.b*c")).toBe(true);
		expect(toolGlobsIntersect("a*.x", "a.x")).toBe(true); // star may match empty
	});
	test("? intersects literals and stars, never a dot", () => {
		expect(toolGlobsIntersect("depl?y", "deploy")).toBe(true);
		expect(toolGlobsIntersect("depl?y", "depl*y")).toBe(true);
		expect(toolGlobsIntersect("?.x", "..x")).toBe(false); // ? cannot match '.'
		expect(toolGlobsIntersect("?x", "ax")).toBe(true);
	});
	test("dot boundaries are respected exactly", () => {
		expect(toolGlobsIntersect("a.*", "a.b.c")).toBe(false); // [^.]* stops at the second dot
		expect(toolGlobsIntersect("a.*.*", "a.b.c")).toBe(true);
	});
});

describe("classifyPermission (ask > autoAllow > null-legacy)", () => {
	test("null policy is the legacy allow-all", () => {
		expect(classifyPermission(null, "anything")).toBe("auto");
		expect(classifyPermission(undefined, null)).toBe("auto");
	});
	test("non-null policy allowlists by glob", () => {
		expect(
			classifyPermission({ autoAllow: ["deploy"], ask: [] }, "deploy"),
		).toBe("auto");
		expect(
			classifyPermission({ autoAllow: ["deploy"], ask: [] }, "destroy"),
		).toBe("park");
	});
	test("an untitled tool cannot be allowlisted", () => {
		expect(classifyPermission({ autoAllow: ["*"], ask: [] }, null)).toBe(
			"park",
		);
	});
	test("ask outranks a matching autoAllow glob", () => {
		expect(
			classifyPermission(
				{
					ask: ["mcp:github.create_*"],
					autoAllow: ["mcp:github.*"],
				},
				"mcp:github.create_issue",
			),
		).toBe("ask");
	});
	test("ask does not touch tools outside its globs", () => {
		expect(
			classifyPermission(
				{
					ask: ["mcp:github.create_*"],
					autoAllow: ["mcp:github.list_*"],
				},
				"mcp:github.list_repos",
			),
		).toBe("auto");
		expect(
			classifyPermission(
				{ ask: ["mcp:github.create_*"], autoAllow: [] },
				"mcp:github.create_issue",
			),
		).toBe("ask");
	});
	test("a stored row from before the ask class decodes leniently", () => {
		// The store casts stored JSON; a pre-NEVR-701 row has no ask key at
		// runtime even though the decoded type always carries it.
		const oldRow = { autoAllow: ["deploy"] } as unknown as PermissionPolicy;
		expect(classifyPermission(oldRow, "deploy")).toBe("auto");
		expect(classifyPermission(oldRow, "destroy")).toBe("park");
	});
});

describe("policyOverlap (write-path validation)", () => {
	test("no overlap on disjoint or empty lists", () => {
		expect(policyOverlap({ ask: [], autoAllow: ["deploy"] })).toBeNull();
		expect(
			policyOverlap({ ask: ["deploy"], autoAllow: ["read", "grep"] }),
		).toBeNull();
		expect(policyOverlap({ ask: [], autoAllow: [] })).toBeNull();
	});
	test("returns the overlapping pair, ask first", () => {
		expect(
			policyOverlap({
				ask: ["read", "mcp:github.create_*"],
				autoAllow: ["mcp:github.*", "grep"],
			}),
		).toEqual({ ask: "mcp:github.create_*", autoAllow: "mcp:github.*" });
	});
});
