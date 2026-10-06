import { HTTPException } from "hono/http-exception";
import { formatGitHubCommentBody } from "./github-comment-author-policy";
import { getActingOctokit } from "./manage-github-repo";

export const REVIEW_EVENTS = ["APPROVE", "REQUEST_CHANGES", "COMMENT"] as const;
export type ReviewEvent = (typeof REVIEW_EVENTS)[number];

export type RepoPullRequestReview = {
  id: number;
  state: string;
  body: string | null;
  submittedAt: string | null;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  url: string | null;
};

export type RepoPullRequestReviewComment = {
  id: number;
  body: string;
  path: string | null;
  line: number | null;
  side: string | null;
  createdAt: string | null;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  url: string | null;
  inReplyToId: number | null;
};

/**
 * Read submitted reviews and inline review comments for a pull request.
 *
 * Reviews live only on GitHub — Kaneo mirrors pull requests but not review
 * threads — so this reads through, mirroring how checks/commits/files behave.
 */
export async function listGitHubPullRequestReviews({
  repoId,
  number,
  userId,
}: {
  repoId: string;
  number: number;
  userId?: string;
}): Promise<{
  reviews: RepoPullRequestReview[];
  comments: RepoPullRequestReviewComment[];
}> {
  const { repo, octokit } = await getActingOctokit(repoId, userId);

  const [reviews, comments] = await Promise.all([
    octokit.rest.pulls.listReviews({
      owner: repo.owner,
      repo: repo.name,
      pull_number: number,
      per_page: 100,
    }),
    octokit.rest.pulls.listReviewComments({
      owner: repo.owner,
      repo: repo.name,
      pull_number: number,
      per_page: 100,
    }),
  ]);

  return {
    reviews: reviews.data
      // PENDING reviews are the caller's unsubmitted drafts; they are not part
      // of the conversation until submitted.
      .filter((review) => review.state !== "PENDING")
      .map((review) => ({
        id: review.id,
        state: review.state,
        body: review.body || null,
        submittedAt: review.submitted_at ?? null,
        authorLogin: review.user?.login ?? null,
        authorAvatarUrl: review.user?.avatar_url ?? null,
        url: review.html_url ?? null,
      })),
    comments: comments.data.map((comment) => ({
      id: comment.id,
      body: comment.body,
      path: comment.path ?? null,
      line: comment.line ?? comment.original_line ?? null,
      side: comment.side ?? null,
      createdAt: comment.created_at ?? null,
      authorLogin: comment.user?.login ?? null,
      authorAvatarUrl: comment.user?.avatar_url ?? null,
      url: comment.html_url ?? null,
      inReplyToId: comment.in_reply_to_id ?? null,
    })),
  };
}

/**
 * Submit a review as the acting member.
 *
 * A review must be submitted with the member's delegated GitHub identity:
 * GitHub rejects self-approval, and an App-authored approval would silently
 * satisfy branch protection on behalf of a human who never approved.
 */
export async function createGitHubPullRequestReview({
  repoId,
  number,
  event,
  body,
  userId,
}: {
  repoId: string;
  number: number;
  event: ReviewEvent;
  body?: string;
  userId: string;
}) {
  const trimmed = body?.trim() ?? "";
  if (event !== "APPROVE" && !trimmed) {
    throw new HTTPException(400, {
      message: "A comment is required unless you are approving.",
    });
  }

  const { repo, octokit, actedAsUser } = await getActingOctokit(repoId, userId);
  if (!actedAsUser) {
    throw new HTTPException(403, {
      message:
        "Connect your GitHub account before submitting reviews so the review is attributed to you.",
    });
  }

  const { data } = await octokit.rest.pulls.createReview({
    owner: repo.owner,
    repo: repo.name,
    pull_number: number,
    event,
    ...(trimmed ? { body: formatGitHubCommentBody(trimmed, undefined) } : {}),
  });

  return {
    id: data.id,
    state: data.state,
    url: data.html_url ?? null,
  };
}

/** Reply to an existing inline review comment thread. */
export async function replyToGitHubReviewComment({
  repoId,
  number,
  commentId,
  body,
  userId,
}: {
  repoId: string;
  number: number;
  commentId: number;
  body: string;
  userId: string;
}) {
  const { repo, octokit, actedAsUser } = await getActingOctokit(repoId, userId);
  const { data } = await octokit.rest.pulls.createReplyForReviewComment({
    owner: repo.owner,
    repo: repo.name,
    pull_number: number,
    comment_id: commentId,
    body: actedAsUser ? body : formatGitHubCommentBody(body, undefined),
  });

  return { id: data.id, url: data.html_url ?? null };
}
