import { describe, expect, it } from "vitest";
import type { Message, ToolCall } from "../../types";
import { buildRuntimeMessages, streamPartsToMessage, toAssistantMessage } from "./assistantRuntime";

const durable: Message = {
  messageId: 7, sessionId: "s1", role: "assistant", content: "done", toolName: null,
  toolCalls: null, reasoning: null, timestamp: 1, tokenCount: null, finishReason: null,
};

describe("assistant-ui external store adapter", () => {
  it("keeps Stellarc message identity available to the renderer", () => {
    const converted = toAssistantMessage(durable);
    expect(converted).toMatchObject({ id: "7", role: "assistant", content: "done" });
    expect(converted.metadata?.custom?.stellarcMessage).toBe(durable);
  });

  it("maps ordered streaming parts without creating another transport", () => {
    const toolCall = { id: "tc1", name: "read", args: {}, result: null } as ToolCall;
    const stream = streamPartsToMessage("s1", [
      { type: "text", text: "before" },
      { type: "toolCall", toolCall },
      { type: "reasoning", text: "think" },
      { type: "text", text: " after" },
    ]);
    expect(stream).toMatchObject({ content: "before after", reasoning: "think", streaming: true });
    expect(stream?.toolCalls?.[0]).toMatchObject({ id: "tc1", anchor: 6 });
    expect(buildRuntimeMessages([durable], "s1", [])).toEqual([durable]);
  });
});
