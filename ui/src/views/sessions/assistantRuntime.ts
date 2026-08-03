import type { ThreadMessageLike } from "@assistant-ui/react";
import type { Message, ToolCall } from "../../types";

export type StreamPart =
  | { type: "text"; text: string }
  | { type: "toolCall"; toolCall: ToolCall }
  | { type: "reasoning"; text: string };

export type StellarcRuntimeMessage = Message & { streaming?: boolean };

export function toAssistantMessage(message: StellarcRuntimeMessage): ThreadMessageLike {
  const role = message.role === "session_meta" || message.role === "tool" ? "system" : message.role;
  return {
    id: message.messageId < 0 ? `optimistic-${message.sessionId}` : String(message.messageId),
    role,
    content: message.content ?? "",
    createdAt: new Date(message.timestamp * 1000),
    metadata: { custom: { stellarcMessage: message } },
  };
}

export function streamPartsToMessage(sessionId: string, parts: StreamPart[]): StellarcRuntimeMessage | null {
  if (parts.length === 0) return null;
  let content = "";
  let reasoning = "";
  const toolCalls: ToolCall[] = [];
  for (const part of parts) {
    if (part.type === "text") content += part.text;
    else if (part.type === "reasoning") reasoning += part.text;
    else toolCalls.push({ ...part.toolCall, anchor: content.length });
  }
  return {
    messageId: -2,
    sessionId,
    role: "assistant",
    content,
    toolName: null,
    toolCalls,
    reasoning: reasoning || null,
    timestamp: Math.floor(Date.now() / 1000),
    tokenCount: null,
    finishReason: null,
    streaming: true,
  };
}

export function buildRuntimeMessages(
  messages: Message[],
  sessionId: string,
  streamParts: StreamPart[],
): StellarcRuntimeMessage[] {
  const stream = streamPartsToMessage(sessionId, streamParts);
  return stream ? [...messages, stream] : messages;
}
