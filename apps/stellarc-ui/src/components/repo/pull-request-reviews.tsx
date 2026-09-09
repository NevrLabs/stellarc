import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, FileDiff, MessageSquare, X } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/fetchers/get-api-url";
import type {
  RepoPullRequestReview,
  RepoPullRequestReviewComment,
} from "@/fetchers/repo/get-pull-request-reviews";
import useGetPullRequestReviews from "@/hooks/queries/repo/use-get-pull-request-reviews";
import { getAvatarTone } from "@/lib/avatar-tone";
import { formatDateMedium } from "@/lib/format";
import { toast } from "@/lib/toast";

const REVIEW_EVENTS = [
  { event: "APPROVE", label: "Approve", icon: Check },
  { event: "REQUEST_CHANGES", label: "Request changes", icon: X },
  { event: "COMMENT", label: "Comment", icon: MessageSquare },
] as const;

/** GitHub's own review-state vocabulary, kept verbatim so it reads familiarly. */
function reviewStateLabel(state: string) {
  if (state === "APPROVED") return "approved these changes";
  if (state === "CHANGES_REQUESTED") return "requested changes";
  if (state === "DISMISSED") return "review dismissed";
  return "commented";
}

function reviewStateClassName(state: string) {
  if (state === "APPROVED") return "text-emerald-600";
  if (state === "CHANGES_REQUESTED") return "text-destructive";
  return "text-muted-foreground";
}

function Author({
  login,
  avatarUrl,
}: {
  login: string | null;
  avatarUrl: string | null;
}) {
  return (
    <span className="flex items-center gap-1.5 font-medium">
      <Avatar className={`size-5 ${getAvatarTone(login)}`}>
        {avatarUrl && <AvatarImage src={avatarUrl} />}
        <AvatarFallback className="bg-transparent text-[9px]">
          {(login ?? "?").slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {login ?? "Unknown"}
    </span>
  );
}

function InlineThread({
  comments,
  onReply,
  replying,
}: {
  comments: RepoPullRequestReviewComment[];
  onReply: (commentId: number, body: string) => Promise<unknown>;
  replying: boolean;
}) {
  const [openReply, setOpenReply] = useState(false);
  const [body, setBody] = useState("");
  const root = comments[0];
  if (!root) return null;

  return (
    <div className="rounded-md border" data-testid="review-thread">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 font-mono text-xs">
        <FileDiff className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">{root.path ?? "General"}</span>
        {root.line != null && (
          <span className="text-muted-foreground">line {root.line}</span>
        )}
      </div>
      <div className="space-y-3 px-3 py-3">
        {comments.map((comment) => (
          <div className="space-y-1 text-sm" key={comment.id}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Author
                avatarUrl={comment.authorAvatarUrl}
                login={comment.authorLogin}
              />
              {comment.createdAt && formatDateMedium(comment.createdAt)}
            </div>
            <p className="whitespace-pre-wrap">{comment.body}</p>
          </div>
        ))}

        {openReply ? (
          <div className="space-y-2">
            <textarea
              aria-label={`Reply to review thread on ${root.path ?? "this pull request"}`}
              className="min-h-20 w-full resize-none rounded-md border bg-background p-2 text-sm"
              onChange={(event) => setBody(event.target.value)}
              value={body}
            />
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setOpenReply(false);
                  setBody("");
                }}
                size="sm"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={!body.trim() || replying}
                onClick={async () => {
                  await onReply(root.id, body.trim());
                  setBody("");
                  setOpenReply(false);
                }}
                size="sm"
              >
                Reply
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setOpenReply(true)} size="sm" variant="ghost">
            Reply
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Submitted reviews and inline review threads for a pull request.
 *
 * Reviews are not mirrored into Kaneo — they are read through to GitHub — so
 * this renders live data and writes back with the member's delegated identity.
 */
export default function PullRequestReviews({
  repoId,
  number,
}: {
  repoId: string;
  number: number;
}) {
  const queryClient = useQueryClient();
  const reviews = useGetPullRequestReviews(repoId, number);
  const [body, setBody] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["repo-pull-request-reviews", repoId, number],
    });

  const submit = useMutation({
    mutationFn: async (event: (typeof REVIEW_EVENTS)[number]["event"]) => {
      const response = await fetch(
        getApiUrl(`/repo/${repoId}/pull-requests/${number}/reviews`),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, body: body.trim() || undefined }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: async () => {
      setBody("");
      await invalidate();
      toast.success("Review submitted on GitHub.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Could not submit the review.",
      ),
  });

  const reply = useMutation({
    mutationFn: async ({
      commentId,
      body: replyBody,
    }: {
      commentId: number;
      body: string;
    }) => {
      const response = await fetch(
        getApiUrl(
          `/repo/${repoId}/pull-requests/${number}/review-comments/${commentId}/replies`,
        ),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: replyBody }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Reply posted on GitHub.");
    },
    onError: () => toast.error("Could not post the reply."),
  });

  if (reviews.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading reviews…</p>;
  }
  if (reviews.isError) {
    return (
      <p className="text-sm text-destructive">
        Could not load reviews. Reload to try again.
      </p>
    );
  }

  // Inline comments arrive flat; group replies under the comment they answer so
  // a thread reads as one conversation instead of repeated file headers.
  const threads = new Map<number, RepoPullRequestReviewComment[]>();
  for (const comment of reviews.data?.comments ?? []) {
    const rootId = comment.inReplyToId ?? comment.id;
    threads.set(rootId, [...(threads.get(rootId) ?? []), comment]);
  }

  const submitted: RepoPullRequestReview[] = reviews.data?.reviews ?? [];

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        {submitted.length === 0 && threads.size === 0 && (
          <p className="text-sm text-muted-foreground">
            No reviews submitted yet.
          </p>
        )}
        {submitted.map((review) => (
          <div className="space-y-1 text-sm" key={review.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Author
                avatarUrl={review.authorAvatarUrl}
                login={review.authorLogin}
              />
              <span className={reviewStateClassName(review.state)}>
                {reviewStateLabel(review.state)}
              </span>
              {review.submittedAt && (
                <span className="text-xs text-muted-foreground">
                  {formatDateMedium(review.submittedAt)}
                </span>
              )}
            </div>
            {review.body && (
              <p className="whitespace-pre-wrap text-muted-foreground">
                {review.body}
              </p>
            )}
          </div>
        ))}
      </section>

      {threads.size > 0 && (
        <section className="space-y-3">
          {[...threads.values()].map((thread) => (
            <InlineThread
              comments={thread}
              key={thread[0].id}
              onReply={(commentId, replyBody) =>
                reply.mutateAsync({ commentId, body: replyBody })
              }
              replying={reply.isPending}
            />
          ))}
        </section>
      )}

      <section className="space-y-2 border-t pt-4">
        <textarea
          aria-label="Review comment"
          className="min-h-24 w-full resize-none rounded-md border bg-background p-2 text-sm"
          onChange={(event) => setBody(event.target.value)}
          placeholder="Leave a review comment…"
          value={body}
        />
        <div className="flex flex-wrap justify-end gap-2">
          {REVIEW_EVENTS.map(({ event, label, icon: Icon }) => (
            <Button
              disabled={
                submit.isPending || (event !== "APPROVE" && !body.trim())
              }
              key={event}
              onClick={() => submit.mutate(event)}
              size="sm"
              variant={event === "APPROVE" ? "default" : "outline"}
            >
              <Icon className="size-3.5" />
              {label}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
