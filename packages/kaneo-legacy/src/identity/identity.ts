export const normalizeOrganizationSlug = (value: string): string =>
  value.toLowerCase();

export const normalizeBoardKey = (value: string): string => value.toUpperCase();

export const parseTicketKey = (
  value: string,
): { boardKey: string; number: number } | null => {
  const match = /^([A-Za-z](?:[A-Za-z0-9-]{0,18}[A-Za-z0-9])?)-(\d+)$/.exec(
    value,
  );
  if (!match) return null;

  const number = Number(match[2]);
  if (!Number.isSafeInteger(number) || number <= 0) return null;

  return { boardKey: normalizeBoardKey(match[1]), number };
};

export const normalizeProjectSlug = (value: string): string =>
  value.toLowerCase();
