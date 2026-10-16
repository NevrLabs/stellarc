/**
 * Recorded run fixtures for the agent-transcript surface (NEVR-223).
 *
 * Shapes mirror the ACP schema (@agentclientprotocol/sdk 1.7.0) and the
 * NEVR-198 approval item; values are synthetic. These feed the dev-only
 * fixture surface so the Playwright frozen suites can capture the four
 * composed patterns without a live agent session.
 */
import type {
  RunPermissionRequest,
  RunSubagentSpawn,
  RunToolCall,
} from "@/lib/agent-transcript";

/** Tool calls: running, completed-with-output, failed. */
export const fixtureToolCalls: RunToolCall[] = [
  {
    toolCallId: "call-grep",
    title: "grep -rn cacheKey scripts",
    name: "bash",
    kind: "execute",
    status: "completed",
    content: [
      {
        type: "content",
        text: "scripts/optimize-images.ts:13:const cacheKey = commitSha\nscripts/optimize-images.ts:52:  if (cache[cacheKey]) return",
      },
    ],
    locations: [{ path: "scripts/optimize-images.ts", line: 13 }],
  },
  {
    toolCallId: "call-sed",
    title: "sed -n 13,15p scripts/optimize-images.ts",
    name: "bash",
    kind: "read",
    status: "completed",
    content: [
      {
        type: "content",
        text: "13: const cacheKey = commitSha\n14: // every deploy misses because the SHA changes\n15: const cacheBuster = cacheKey.slice(0, 7)",
      },
    ],
    locations: [],
  },
  {
    toolCallId: "call-pnpm",
    title: "pnpm --version",
    name: "bash",
    kind: "execute",
    status: "failed",
    content: [{ type: "content", text: "command not found: pnpm" }],
  },
  {
    toolCallId: "call-watching",
    title: "watch node --version",
    name: "bash",
    kind: "execute",
    status: "in_progress",
  },
];

/** Permission request as NEVR-198 reports it for approval. */
export const fixturePermissionRequest: RunPermissionRequest = {
  sessionId: "sess-fixture",
  toolCallId: "call-fixture-permission",
  toolName: "bash",
  title: "rm -rf dist",
  options: [
    { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
    { optionId: "allow_always", name: "Always allow", kind: "allow_always" },
    { optionId: "reject_once", name: "Deny", kind: "reject_once" },
  ],
};

/**
 * Pending web-search call whose resource_link blocks cite the results
 * (NEVR-239): four links, one duplicate URL — the adapter must collapse
 * them to three unique sources.
 */
export const fixtureWebSearchCall: RunToolCall = {
  toolCallId: "call-web-search",
  title: 'web_search "next.js image loader cache"',
  name: "web_search",
  kind: "fetch",
  status: "completed",
  content: [
    {
      type: "content",
      text: "4 results for next.js image loader cache",
    },
    {
      type: "resource_link",
      name: "nextjs.org — Image Optimization",
      uri: "https://nextjs.org/docs/app/building-your-application/optimizing/images",
    },
    {
      type: "resource_link",
      name: "Image Component — Next.js",
      // Duplicate URL: the second crawl of the same doc must collapse.
      uri: "https://nextjs.org/docs/app/building-your-application/optimizing/images",
    },
    {
      type: "resource_link",
      name: "vercel.com",
      uri: "https://vercel.com/docs/next.js/optimizing-images",
    },
    {
      // No title/name worth showing: hostname is the label.
      type: "resource_link",
      name: "",
      uri: "https://github.com/vercel/next.js/discussions/59073",
    },
  ],
};

/** Sub-agent spawns: running and finished. */
export const fixtureSubagentSpawns: RunSubagentSpawn[] = [
  {
    sessionId: "sess-child-research",
    title: "the research agent",
    description: "Find out why image optimization reruns on every deploy.",
    state: { state: "running", activity: "reading build logs" },
  },
  {
    sessionId: "sess-child-tests",
    title: "the test agent",
    description: "Run the checkout suite and report failures.",
    state: { state: "idle" },
  },
];

/** CI rollup on an agent PR, for TestResults. */
export const fixtureTestSuites = [
  {
    name: "cart.test.ts",
    cases: [
      { name: "adds an item", status: "passed" as const },
      { name: "removes an item", status: "passed" as const },
      { name: "applies a discount code", status: "passed" as const },
    ],
  },
  {
    name: "payment.test.ts",
    cases: [
      { name: "charges the saved card", status: "passed" as const },
      {
        name: "retries a declined card",
        status: "failed" as const,
        error:
          "Expected 2 charge attempts, received 1\n    at Object.<anonymous> (src/payment.test.ts:58:22)",
      },
    ],
  },
];

/** Chain-of-thought steps recorded from a completed research turn. */
export const fixtureThoughtSteps = [
  { title: "Read the build log for dpl_8Kx2", status: undefined },
  { title: "Searched the web for next.js image cache key", status: undefined },
  { title: "Searched the code for cacheKey", status: undefined },
];
