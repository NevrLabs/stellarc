import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

/**
 * Notification-secret crypto Layer (§2): tokens/URLs secrets are encrypted at
 * rest with AES-256-GCM through a configured key; ciphertext is never copied
 * without the key. Mirrors fork secrets.ts semantics (enc:v1: prefix, base64
 * parts) so imported ciphertext round-trips under a matching key.
 */

const SECRET_PREFIX = "enc:v1:";
const SECRET_ALGORITHM = "aes-256-gcm";
const SECRET_IV_BYTES = 12;

export class SecretKeyUnavailable extends Error {
	constructor() {
		super("notification secret encryption key is required");
	}
}

export class SecretUndecryptable extends Error {
	constructor() {
		super("stored secret could not be decrypted");
	}
}

export interface NotificationSecrets {
	/** Encrypt a plaintext secret; null stays null (no secret). */
	encrypt(value: string | null): string | null;
	/** Decrypt stored ciphertext; throws SecretUndecryptable on tamper/key mismatch. */
	decrypt(value: string | null): string | null;
	/** True when the value is ciphertext produced by this scheme. */
	isEncrypted(value: string | null): boolean;
}

export function makeNotificationSecrets(rawKey: string): NotificationSecrets {
	const key = createHash("sha256").update(rawKey).digest();
	const b64 = (b: Buffer) => b.toString("base64url");
	const unb64 = (s: string) => Buffer.from(s, "base64url");
	return {
		encrypt(value) {
			if (value === null) return null;
			const iv = randomBytes(SECRET_IV_BYTES);
			const cipher = createCipheriv(SECRET_ALGORITHM, key, iv);
			const ciphertext = Buffer.concat([
				cipher.update(value, "utf8"),
				cipher.final(),
			]);
			return `${SECRET_PREFIX}${b64(iv)}.${b64(ciphertext)}.${b64(
				cipher.getAuthTag(),
			)}`;
		},
		decrypt(value) {
			if (value === null) return null;
			if (!value.startsWith(SECRET_PREFIX)) {
				// Legacy plaintext (pre-encryption import) — treated as-is only
				// when the caller opts in; default fail-closed.
				throw new SecretUndecryptable();
			}
			try {
				const [ivPart, dataPart, tagPart] = value
					.slice(SECRET_PREFIX.length)
					.split(".");
				if (!ivPart || !dataPart || !tagPart) throw new SecretUndecryptable();
				const decipher = createDecipheriv(SECRET_ALGORITHM, key, unb64(ivPart));
				decipher.setAuthTag(unb64(tagPart));
				return Buffer.concat([
					decipher.update(unb64(dataPart)),
					decipher.final(),
				]).toString("utf8");
			} catch {
				throw new SecretUndecryptable();
			}
		},
		isEncrypted(value) {
			return typeof value === "string" && value.startsWith(SECRET_PREFIX);
		},
	};
}

/** Fork-compatible value mask: keep first/last 4 when long, else bullets. */
export function maskSecret(value: string | null): string | null {
	if (!value) return null;
	return value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : "••••";
}

/** Trim to null (fork normalizeOptionalString semantics without the nullish bug). */
export function normalizeOptionalString(
	value: string | null | undefined,
): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}
