export type AiChatSize = { width: number; height: number };

export const DEFAULT_AI_CHAT_SIZE: AiChatSize = { width: 384, height: 512 };
export const MIN_AI_CHAT_SIZE: AiChatSize = { width: 320, height: 360 };

export function clampAiChatSize(
  size: AiChatSize,
  viewport: { width: number; height: number },
): AiChatSize {
  const maxWidth = Math.max(MIN_AI_CHAT_SIZE.width, viewport.width - 32);
  const maxHeight = Math.max(MIN_AI_CHAT_SIZE.height, viewport.height - 40);
  return {
    width: Math.min(maxWidth, Math.max(MIN_AI_CHAT_SIZE.width, size.width)),
    height: Math.min(maxHeight, Math.max(MIN_AI_CHAT_SIZE.height, size.height)),
  };
}

export function parseAiChatSize(value: string | null): AiChatSize | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AiChatSize>;
    if (
      typeof parsed.width !== "number" ||
      !Number.isFinite(parsed.width) ||
      typeof parsed.height !== "number" ||
      !Number.isFinite(parsed.height)
    ) {
      return null;
    }
    return { width: parsed.width, height: parsed.height };
  } catch {
    return null;
  }
}
