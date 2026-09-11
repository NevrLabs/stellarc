export type RepoProvider = string;

export type Repo = {
  id: string;
  organizationId: string;
  provider: RepoProvider;
  owner: string;
  name: string;
  url: string;
  description: string | null;
  defaultBranch: string | null;
  isPrivate: boolean | null;
  config: { icon?: string | null } | null;
  isActive: boolean | null;
  lastSyncedAt: string | null;
  openIssueCount: number;
  openPullRequestCount: number;
};

export type RepoLabel = {
  name: string;
  color: string | null;
};

export type RepoGithubMetadata = {
  labels: Array<{ name: string; color: string; description: string | null }>;
  assignableUsers: Array<{ login: string; avatarUrl: string }>;
  milestones: Array<{
    number: number;
    title: string;
    state: string;
    dueOn: string | null;
  }>;
};

export type RepoContentEntry = {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  sha: string;
};

export type RepoContents = {
  path: string;
  ref: string | null;
  type: "directory" | "file" | "symlink" | "submodule";
  entries: RepoContentEntry[];
  file:
    | (RepoContentEntry & { content: string | null; isBinary: boolean })
    | null;
};

export type RepoTree = {
  entries: RepoContentEntry[];
  ref: string;
  truncated: boolean;
};

export type RepoIssueState = "open" | "closed";

export type RepoIssueGithubActor = {
  login?: string | null;
  avatar_url?: string | null;
};

export type RepoIssueGithub = {
  comments: Array<{
    id?: number | string;
    body?: string | null;
    created_at?: string | null;
    user?: RepoIssueGithubActor;
  }>;
  timeline: Array<{
    id?: number | string;
    node_id?: string;
    event?: string | null;
    created_at?: string | null;
    state_reason?: string | null;
    actor?: RepoIssueGithubActor;
    assignee?: RepoIssueGithubActor;
    label?: { name?: string | null; color?: string | null };
    milestone?: { title?: string | null };
  }>;
  linkedPullRequests?: Array<{
    number: number;
    title?: string | null;
    url?: string | null;
    state?: string | null;
    mergedAt?: string | null;
  }>;
  milestone?: { number: number; title: string } | null;
  stateReason?: string | null;
  parent?: {
    id?: number | string;
    number?: number;
    title?: string | null;
    state?: string | null;
    html_url?: string | null;
    repository_url?: string | null;
  } | null;
  parentSupported?: boolean;
  subIssues: Array<{
    id?: number | string;
    number?: number;
    title?: string | null;
    state?: string | null;
    html_url?: string | null;
    repository_url?: string | null;
  }>;
  subIssuesSupported: boolean;
};

export type RepoTaskLink = {
  id: string;
  taskId: string;
  createdAt: string;
  syncEnabled: boolean;
  syncBrokenAt: string | null;
  syncBrokenReason: string | null;
  task: {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    number: number | null;
    boardId: string;
  };
};

export type RepoIssue = {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  state: RepoIssueState;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  assigneeLogins: string[] | null;
  labels: RepoLabel[];
  commentCount: number;
  url: string;
  externalCreatedAt: string | null;
  closedAt: string | null;
  taskLinks: RepoTaskLink[];
  github?: RepoIssueGithub;
};

export type RepoPullRequestState = "open" | "closed" | "merged";

export type RepoPullRequest = {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  state: RepoPullRequestState;
  isDraft: boolean | null;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  headBranch: string | null;
  baseBranch: string | null;
  labels: RepoLabel[];
  commentCount: number;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  url: string;
  externalCreatedAt: string | null;
  mergedAt: string | null;
  closedAt: string | null;
  taskLinks: RepoTaskLink[];
};

export type RepoIssueStateFilter = "open" | "closed" | "all";

export type RepoPullRequestStateFilter = "open" | "closed" | "merged" | "all";

// The API returns paginated collections as { data, pagination } — see
// apps/api/src/repo/index.ts. Keep these aligned with the server response.
export type RepoPagination = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type RepoIssuesResponse = {
  data: RepoIssue[];
  pagination: RepoPagination;
};

export type RepoPullRequestsResponse = {
  data: RepoPullRequest[];
  pagination: RepoPagination;
};

export type RepoPullRequestFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
};

export type RepoPullRequestFiles = {
  files: RepoPullRequestFile[];
  totals: { additions: number; deletions: number; changedFiles: number };
};

export type RepoPullRequestCommit = {
  sha: string;
  message: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  committedAt: string | null;
  url: string;
};

export type RepoPullRequestCommits = { commits: RepoPullRequestCommit[] };

export type RepoPullRequestCheck = {
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  url: string;
};

export type RepoPullRequestChecks = {
  conclusion: string | null;
  headSha: string;
  checks: RepoPullRequestCheck[];
  runs: RepoPullRequestCheck[];
  /** Sources the GitHub App lacks permission to read (`checks: read` / `actions: read`). */
  unavailable: Array<"checks" | "runs">;
};
