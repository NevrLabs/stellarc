import { HTTPException } from "hono/http-exception";
import { getGitHubRepoClient } from "./manage-github-repo";

const MAX_FILE_SIZE = 1_000_000;

export type GitHubRepoContentEntry = {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  sha: string;
};

export type GitHubRepoContents = {
  path: string;
  ref: string | null;
  type: "directory" | "file" | "symlink" | "submodule";
  entries: GitHubRepoContentEntry[];
  file: {
    name: string;
    path: string;
    size: number;
    sha: string;
    content: string | null;
    isBinary: boolean;
  } | null;
};

function isBinary(buffer: Buffer) {
  return buffer.includes(0);
}

function toEntry(content: {
  name: string;
  path: string;
  type: string;
  size: number;
  sha: string;
}): GitHubRepoContentEntry {
  const type = ["file", "dir", "symlink", "submodule"].includes(content.type)
    ? (content.type as GitHubRepoContentEntry["type"])
    : "file";

  return {
    name: content.name,
    path: content.path,
    type,
    size: content.size,
    sha: content.sha,
  };
}

/** Read a GitHub repository directory or a single UTF-8 file through its installation. */
export async function getGitHubRepoContents({
  repoId,
  path,
  ref,
}: {
  repoId: string;
  path: string;
  ref?: string;
}): Promise<GitHubRepoContents> {
  const { repo, octokit } = await getGitHubRepoClient(repoId);
  const { data } = await octokit.rest.repos.getContent({
    owner: repo.owner,
    repo: repo.name,
    path,
    ...(ref ? { ref } : {}),
  });

  if (Array.isArray(data)) {
    return {
      path,
      ref: ref ?? null,
      type: "directory",
      entries: data.map(toEntry).sort((a, b) => {
        if (a.type === "dir" && b.type !== "dir") return -1;
        if (a.type !== "dir" && b.type === "dir") return 1;
        return a.name.localeCompare(b.name);
      }),
      file: null,
    };
  }

  const entry = toEntry(data);
  if (entry.type !== "file") {
    return {
      path,
      ref: ref ?? null,
      type: entry.type === "dir" ? "directory" : entry.type,
      entries: [],
      file: null,
    };
  }

  if (entry.size > MAX_FILE_SIZE) {
    throw new HTTPException(413, {
      message: `Files larger than ${MAX_FILE_SIZE} bytes cannot be displayed`,
    });
  }

  const fileData = data as {
    content?: string;
  };
  const encoded = fileData.content?.replace(/\n/g, "") ?? "";
  const buffer = Buffer.from(encoded, "base64");
  return {
    path,
    ref: ref ?? null,
    type: "file",
    entries: [],
    file: {
      ...entry,
      content: isBinary(buffer) ? null : buffer.toString("utf8"),
      isBinary: isBinary(buffer),
    },
  };
}

export default getGitHubRepoContents;
