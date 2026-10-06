import * as v from "valibot";
import { closeRedis, getRedisPub, getRedisSub } from "../redis";
import type { BroadcastAdapter, BroadcastMessage } from "./broadcast-adapter";

const CHANNEL_PREFIX = "kaneo:ws:";
const CHANNEL_SUFFIX = ":broadcast";
const CHANNEL_PATTERN = `${CHANNEL_PREFIX}*${CHANNEL_SUFFIX}`;

const broadcastMessageSchema = v.object({
  boardId: v.string(),
  message: v.object({
    type: v.string(),
    boardId: v.string(),
    taskId: v.optional(v.string()),
    sourceTaskId: v.optional(v.string()),
    targetTaskId: v.optional(v.string()),
  }),
  excludeInitiatorId: v.optional(v.string()),
});

export class RedisBroadcastAdapter implements BroadcastAdapter {
  private subscribed = false;
  private _pmessageHandler:
    | ((pattern: string, channel: string, data: string) => void)
    | null = null;

  async publish(msg: BroadcastMessage): Promise<void> {
    await getRedisPub().publish(
      this.channelForBoard(msg.boardId),
      JSON.stringify(msg),
    );
  }

  async subscribe(handler: (msg: BroadcastMessage) => void): Promise<void> {
    if (this.subscribed) return;
    this.subscribed = true;

    // Pattern-subscribe to ALL board channels at once
    await getRedisSub().psubscribe(CHANNEL_PATTERN);

    // "pmessage" fires for pattern subscriptions (not "message")
    this._pmessageHandler = (
      _pattern: string,
      _channel: string,
      data: string,
    ) => {
      try {
        const parsed = v.safeParse(broadcastMessageSchema, JSON.parse(data));
        if (!parsed.success) {
          console.error("Invalid broadcast message:", parsed.issues);
          return;
        }
        handler(parsed.output);
      } catch (err) {
        console.error("Failed to parse broadcast message:", err);
      }
    };
    getRedisSub().on("pmessage", this._pmessageHandler);
  }

  async shutdown(): Promise<void> {
    if (this._pmessageHandler) {
      getRedisSub().off("pmessage", this._pmessageHandler);
      this._pmessageHandler = null;
    }
    // Unsubscribe from the pattern — covers all board channels
    await getRedisSub().punsubscribe(CHANNEL_PATTERN);
    this.subscribed = false;
    await closeRedis();
  }

  private channelForBoard(boardId: string): string {
    return `${CHANNEL_PREFIX}${boardId}${CHANNEL_SUFFIX}`;
  }
}
