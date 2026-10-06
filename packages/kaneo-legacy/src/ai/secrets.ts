import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { HTTPException } from "hono/http-exception";

const SECRET_PREFIX = "enc:v1:";
const SECRET_ALGORITHM = "aes-256-gcm";
const SECRET_IV_BYTES = 12;

/**
 * AI provider keys are encrypted at rest with a dedicated key, falling back to
 * the notification secret key and finally AUTH_SECRET so existing deployments
 * keep working without new configuration.
 */
function requireKey() {
  const raw = (
    process.env.AI_SECRET_ENCRYPTION_KEY ||
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET
  )?.trim();
  if (!raw) {
    throw new HTTPException(500, {
      message:
        "AI_SECRET_ENCRYPTION_KEY (or AUTH_SECRET) is required to store an AI provider key",
    });
  }
  return createHash("sha256").update(raw).digest();
}

export function isEncryptedAiSecret(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(SECRET_PREFIX);
}

export function encryptAiSecret(value: string): string {
  const iv = randomBytes(SECRET_IV_BYTES);
  const cipher = createCipheriv(SECRET_ALGORITHM, requireKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${SECRET_PREFIX}${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptAiSecret(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  if (!isEncryptedAiSecret(value)) return value;

  const [iv, authTag, encrypted] = value.slice(SECRET_PREFIX.length).split(".");
  if (!iv || !authTag || !encrypted) return null;

  try {
    const decipher = createDecipheriv(
      SECRET_ALGORITHM,
      requireKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // A rotated/incorrect key must not take the whole AI surface down.
    return null;
  }
}
