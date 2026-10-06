import { HTTPException } from "hono/http-exception";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseMilestoneName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) {
    throw new HTTPException(400, { message: "Milestone name is required" });
  }
  if (trimmed.length > 255) {
    throw new HTTPException(400, {
      message: "Milestone name must be at most 255 characters",
    });
  }
  return trimmed;
}

export function parseMilestoneDescription(
  description: string | null | undefined,
): string | null {
  const trimmed = description?.trim();
  if (!trimmed) return null;
  if (trimmed.length > 65535) {
    throw new HTTPException(400, {
      message: "Milestone description must be at most 65535 characters",
    });
  }
  return trimmed;
}

export function parseMilestoneTargetDate(
  targetDate: string | null | undefined,
): string | null {
  const trimmed = targetDate?.trim();
  if (!trimmed) return null;
  if (!DATE_ONLY.test(trimmed)) {
    throw new HTTPException(400, { message: "Invalid target date" });
  }
  return trimmed;
}

export function parseMilestoneRank(rank: number | undefined): number {
  const value = rank ?? 0;
  if (!Number.isInteger(value)) {
    throw new HTTPException(400, { message: "Invalid rank" });
  }
  return value;
}
