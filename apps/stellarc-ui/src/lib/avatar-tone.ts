/**
 * Stable per-identity avatar tone.
 *
 * #264: the members table already derived a pastel from a cheap string hash,
 * but the helper was trapped inside that component, so every other avatar
 * surface fell back to a flat grey. This module is the single source of truth
 * so the same person keeps the same colour on every surface without any
 * server-side state.
 */
export const AVATAR_TONES = [
  "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
] as const;

/**
 * Pick a deterministic tone for an identity key.
 *
 * Prefer a stable identifier (user id, then email). Display names change, and
 * a rename must not recolour the avatar.
 */
export function getAvatarTone(
  ...identityCandidates: Array<string | null | undefined>
): string {
  const key = identityCandidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  // No identity at all: keep a neutral tone rather than always bucketing
  // unknown users into AVATAR_TONES[0], which would imply they are the same
  // person.
  if (!key) return "bg-muted text-muted-foreground";

  const normalized = key.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}
