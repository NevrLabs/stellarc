const URL_PATTERN = /\b(https?:\/\/|www\.)\S+/i;
const MAX_NAME_LENGTH = 100;

export type OrganizationNameCheck =
  | { ok: true }
  | { ok: false; reason: string };

export function checkOrganizationName(name: string): OrganizationNameCheck {
  const trimmed = name?.trim() ?? "";
  if (trimmed.length === 0) {
    return { ok: false, reason: "Organization name is required." };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      reason: `Organization name must be ${MAX_NAME_LENGTH} characters or fewer.`,
    };
  }
  if (URL_PATTERN.test(trimmed)) {
    return {
      ok: false,
      reason: "Organization name may not contain URLs.",
    };
  }
  // Reject HTML / control characters often used to smuggle payloads.
  if (/[<>{}]/.test(trimmed)) {
    return {
      ok: false,
      reason: "Organization name may not contain HTML or template characters.",
    };
  }
  return { ok: true };
}
