import { getApiUrl } from "@/fetchers/get-api-url";

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

export type RepoPullRequestReviews = {
  reviews: RepoPullRequestReview[];
  comments: RepoPullRequestReviewComment[];
};

export default async function getPullRequestReviews(
  repoId: string,
  number: number,
) {
  const response = await fetch(
    getApiUrl(`/repo/${repoId}/pull-requests/${number}/reviews`),
    { credentials: "include" },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as RepoPullRequestReviews;
}
