import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { repoTable } from "../../database/schema";

type CreateRepoOptions = {
  organizationId: string;
  provider: "github" | "gitea";
  owner: string;
  name: string;
  url: string;
  externalId?: string;
  description?: string;
  defaultBranch?: string;
  isPrivate?: boolean;
  config?: Record<string, unknown>;
};

/**
 * Postgres unique_violation. The insert races the dialog's own duplicate
 * check, so the constraint is the source of truth.
 */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const cause = (error as { cause?: unknown }).cause;
  const code =
    (error as { code?: string }).code ??
    (cause && typeof cause === "object"
      ? (cause as { code?: string }).code
      : undefined);
  return code === UNIQUE_VIOLATION;
}

async function createRepo(options: CreateRepoOptions) {
  try {
    const [createdRepo] = await db
      .insert(repoTable)
      .values({
        organizationId: options.organizationId,
        provider: options.provider,
        owner: options.owner,
        name: options.name,
        url: options.url,
        externalId: options.externalId,
        description: options.description,
        defaultBranch: options.defaultBranch,
        isPrivate: options.isPrivate ?? false,
        config: options.config,
      })
      .returning();

    return createdRepo;
  } catch (error) {
    /*
      repo_org_provider_owner_name_unique: the repo is already connected to
      this organization. Without this, the driver error propagated as a 500
      whose body leaked the full failed INSERT with parameters.
    */
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message: `${options.owner}/${options.name} is already connected to this organization`,
      });
    }
    throw error;
  }
}

export default createRepo;
