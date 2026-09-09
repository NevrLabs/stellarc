const OFFSET = /^([+-])(\d{1,5})([mhdw])$/i;
const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
const MAX_OFFSET_MS = 10 * 365 * UNIT_MS.d;

export function resolveTemplateDate(
  absolute: string | null | undefined,
  offset: string | null | undefined,
  now = new Date(),
) {
  if (offset) {
    const match = OFFSET.exec(offset.trim());
    if (!match) return undefined;
    const [, sign, amount, unit] = match;
    const delta =
      Number(amount) * UNIT_MS[unit.toLowerCase() as keyof typeof UNIT_MS];
    if (!Number.isFinite(delta) || delta > MAX_OFFSET_MS) return undefined;
    return new Date(now.getTime() + (sign === "+" ? delta : -delta));
  }
  if (!absolute) return undefined;
  const date = new Date(absolute);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export function isTemplateDateOffset(value: string) {
  return !value || resolveTemplateDate(null, value) !== undefined;
}
