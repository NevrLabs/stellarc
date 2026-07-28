import { describe, expect, it } from "vitest";
import fs from "node:fs";
describe("durable message completion",()=>{it("refetches messages when done",()=>{const s=fs.readFileSync(new URL("src/views/sessions/pages/ChatPage.tsx",`file://${process.cwd()}/`),"utf8");const done=s.slice(s.indexOf('if (frame.kind === "message.done")'),s.indexOf('// Liveness pushed'));expect(done).toContain("qk.messages(sessionId)");expect(done).not.toContain("setOptimisticMsg(null)");});});
