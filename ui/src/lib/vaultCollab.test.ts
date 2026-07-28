import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { replaceText } from "./vaultCollab";

describe("replaceText", () => {
  it("merges concurrent edits made at different positions", () => {
    const a = new Y.Doc(); const b = new Y.Doc();
    const ta = a.getText("markdown"); ta.insert(0, "hello world");
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const tb = b.getText("markdown");
    replaceText(ta, "hello brave world");
    replaceText(tb, "hello world!");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(ta.toString()).toBe(tb.toString());
    expect(ta.toString()).toContain("brave");
    expect(ta.toString()).toContain("!");
  });
});
