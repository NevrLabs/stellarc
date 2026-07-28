import { join } from "node:path";
export function socketPath(home: string): string {
  if (!home) throw new Error("STELLARC_HOME is required");
  return join(home, "auth.sock");
}
