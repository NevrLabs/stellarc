import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { betterAuth } from "better-auth";

const home = process.env.STELLARC_HOME ?? "";
const secret = process.env.BETTER_AUTH_SECRET ?? "";
if (!home) throw new Error("STELLARC_HOME is required");
if (!secret) throw new Error("BETTER_AUTH_SECRET is required");
mkdirSync(home, { recursive: true, mode: 0o700 });
export const database = new Database(join(home, "auth.sqlite"), { create: true });
export const auth = betterAuth({
  database,
  secret,
  basePath: "/api/auth",
  emailAndPassword: { enabled: true },
  user: { additionalFields: { username: { type: "string", required: true, unique: true } } },
  trustedOrigins: (process.env.STELLARC_TRUSTED_ORIGINS ?? "").split(",").filter(Boolean),
});
export default auth;
