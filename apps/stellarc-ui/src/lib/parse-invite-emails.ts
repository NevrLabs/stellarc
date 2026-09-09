/**
 * Splits a bulk invite textarea into addresses.
 *
 * Accepts the shapes people actually paste: newline-separated lists, comma or
 * semicolon separated lists, whitespace-separated, and `Name <a@b.com>` pairs
 * copied out of a mail client. Duplicates are collapsed case-insensitively so
 * the same person is not invited twice in one submit.
 */

// Deliberately conservative: enough to catch typos and stray words without
// rejecting legitimate addresses. The server is still the authority.
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export type ParsedInviteEmails = {
  /** Valid, de-duplicated addresses in the order they were entered. */
  emails: string[];
  /** Tokens that are not addresses, preserved verbatim for the error message. */
  invalid: string[];
};

export function parseInviteEmails(raw: string): ParsedInviteEmails {
  const tokens = raw
    .split(/[\n,;]+/)
    .flatMap((entry) => {
      // "Display Name <user@example.com>" → keep only the bracketed address.
      // Splitting on whitespace first would turn the display name into bogus
      // "invalid address" tokens and block a paste straight out of a mail
      // client.
      const bracketed = entry.match(/<([^<>]+)>/);
      if (bracketed) return [bracketed[1]];
      // Otherwise the entry may still be a whitespace-separated list.
      return entry.split(/\s+/);
    })
    .map((token) => token.replace(/^<|>$/g, "").trim())
    .filter((token) => token.length > 0);

  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (!EMAIL_PATTERN.test(token)) {
      invalid.push(token);
      continue;
    }
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(token);
  }

  return { emails, invalid };
}

export default parseInviteEmails;
