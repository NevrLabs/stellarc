import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  ChevronDown,
  Edit3,
  GitMerge,
  LoaderCircle,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { Textarea } from "@/components/ui/textarea";
import { getApiUrl } from "@/fetchers/get-api-url";
import { toast } from "@/lib/toast";

/**
 * Item-level actions, split out of the old single `RepoIssueActions` bar.
 *
 * Previously rename/close/merge sat in the middle of the main column, roughly
 * 1300px below the title and state badge they act on, wedged between the
 * comment footer and the comment composer. They now live in the header beside
 * the identity they mutate; the composer stays at the bottom of the column
 * where commenting actually belongs in the reading order.
 */
export type RepoItemActionProps = {
  kind: "issue" | "pull-request";
  repoId: string;
  number: number;
  title: string;
  state: string;
};

function useItemRequest(
  kind: RepoItemActionProps["kind"],
  repoId: string,
  number: number,
) {
  const isIssue = kind === "issue";
  const resourcePath = `/repo/${repoId}/${isIssue ? "issues" : "pull-requests"}/${number}`;
  const queryKey = [
    isIssue ? "repo-issue" : "repo-pull-request",
    repoId,
    number,
  ];

  const request = async (path: string, init: RequestInit) => {
    const response = await fetch(getApiUrl(path), {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
      ...init,
    });
    if (!response.ok) {
      throw new Error((await response.text()) || "GitHub update failed");
    }
  };

  return { request, resourcePath, queryKey };
}

export function RepoItemHeaderActions({
  kind,
  repoId,
  number,
  state,
}: Omit<RepoItemActionProps, "title">) {
  const { request, resourcePath, queryKey } = useItemRequest(
    kind,
    repoId,
    number,
  );
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request(resourcePath, { body: JSON.stringify(payload), method: "PATCH" }),
    onSuccess: invalidate,
  });

  const reopenIssue = useMutation({
    mutationFn: () => request(`${resourcePath}/reopen`, { method: "POST" }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Issue reopened on GitHub.");
    },
    onError: () => toast.error("Could not reopen the issue."),
  });

  const merge = useMutation({
    mutationFn: () => request(`${resourcePath}/merge`, { method: "POST" }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Pull request merged.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not merge."),
  });

  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* Rename lives beside the title via RepoItemTitleAction, not here —
            an action belongs next to the thing it changes. */}
      {kind === "issue" && state === "closed" && (
        <Button
          disabled={reopenIssue.isPending}
          onClick={() => reopenIssue.mutate()}
          size="sm"
          variant="outline"
        >
          {reopenIssue.isPending ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RotateCcw className="size-3.5" />
          )}
          Reopen GitHub Issue
        </Button>
      )}

      {kind === "pull-request" && state !== "merged" && (
        <Button
          disabled={update.isPending}
          onClick={async () => {
            try {
              await update.mutateAsync({
                state: state === "open" ? "closed" : "open",
              });
              toast.success(
                state === "open" ? "Closed on GitHub." : "Reopened on GitHub.",
              );
            } catch {
              toast.error("Could not update the state.");
            }
          }}
          size="sm"
          variant="outline"
        >
          <Check className="size-3.5" />
          {state === "open" ? "Close" : "Reopen"}
        </Button>
      )}

      {kind === "pull-request" && state === "open" && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" variant="default" />}>
            <GitMerge className="size-3.5" /> Merge
          </AlertDialogTrigger>
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>Merge pull request?</AlertDialogTitle>
              <AlertDialogDescription>
                This will merge the open pull request in GitHub. GitHub still
                enforces branch protection and required reviews.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" />}>
                Cancel
              </AlertDialogClose>
              <Button disabled={merge.isPending} onClick={() => merge.mutate()}>
                {merge.isPending && (
                  <LoaderCircle className="size-3.5 animate-spin" />
                )}
                Merge pull request
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      )}
    </div>
  );
}

/**
 * Rename control, rendered inline with the item title.
 *
 * It used to sit in the header action cluster on the far side of the row from
 * the title it renames. Actions belong beside what they affect, so the button
 * and its dialog moved here and the header keeps only state-changing actions.
 */
export function RepoItemTitleAction({
  kind,
  repoId,
  number,
  title,
}: Omit<RepoItemActionProps, "state">) {
  const name = kind === "issue" ? "Issue" : "Pull Request";
  const { request, resourcePath, queryKey } = useItemRequest(
    kind,
    repoId,
    number,
  );
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      request(resourcePath, { body: JSON.stringify(payload), method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const saveEdit = async () => {
    try {
      await update.mutateAsync({ title: draftTitle });
      toast.success(`${name} updated on GitHub.`);
      setEditOpen(false);
    } catch {
      toast.error(`Could not update the ${name.toLowerCase()}.`);
    }
  };

  return (
    <>
      <Button
        aria-label={`Rename ${name.toLowerCase()}`}
        className="shrink-0"
        data-slot="repo-item-title-action"
        onClick={() => {
          setDraftTitle(title);
          setEditOpen(true);
        }}
        size="icon-sm"
        title={`Rename ${name.toLowerCase()}`}
        variant="ghost"
      >
        <Edit3 className="size-3.5" />
      </Button>

      {/* Only the title is edited here; the body is edited inline by
          RepoDescriptionEditor. */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Rename {name}</DialogTitle>
            <DialogDescription>Update the title in GitHub.</DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <Input
              aria-label="Title"
              onChange={(event) => setDraftTitle(event.target.value)}
              value={draftTitle}
            />
          </DialogPanel>
          <DialogFooter>
            <Button onClick={() => setEditOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={update.isPending || !draftTitle.trim()}
              onClick={saveEdit}
            >
              {update.isPending && (
                <LoaderCircle className="size-3.5 animate-spin" />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

export function RepoItemCommentComposer({
  kind,
  repoId,
  number,
  state,
}: RepoItemActionProps) {
  const { request, resourcePath, queryKey } = useItemRequest(
    kind,
    repoId,
    number,
  );
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const isOpenIssue = kind === "issue" && state === "open";

  const addComment = useMutation({
    mutationFn: () =>
      request(`${resourcePath}/comments`, {
        body: JSON.stringify({ body: comment.trim() }),
        method: "POST",
      }),
    onSuccess: async () => {
      setComment("");
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Comment submitted to GitHub.");
    },
    onError: () => toast.error("Could not submit the comment."),
  });

  const closeIssue = useMutation({
    mutationFn: async (reason: "completed" | "not_planned") => {
      const body = comment.trim();
      if (body) {
        await request(`${resourcePath}/comments`, {
          body: JSON.stringify({ body }),
          method: "POST",
        });
      }
      await request(resourcePath, {
        body: JSON.stringify({ state: "closed", stateReason: reason }),
        method: "PATCH",
      });
    },
    onSuccess: async () => {
      const includedComment = !!comment.trim();
      setComment("");
      await queryClient.invalidateQueries({ queryKey });
      toast.success(
        includedComment
          ? "Comment submitted and issue closed on GitHub."
          : "Issue closed on GitHub.",
      );
    },
    onError: () => toast.error("Could not close the issue."),
  });

  const pending = addComment.isPending || closeIssue.isPending;

  return (
    <div
      className="border-t border-border/80 px-3 py-2 sm:px-6 sm:py-4 md:shadow-[0_-8px_24px_-20px_rgba(0,0,0,0.45)]"
      data-testid="repo-comment-composer"
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium sm:mb-2 sm:text-sm">
        <MessageSquare className="size-3.5 sm:size-4" /> Leave a comment
      </div>
      <Textarea
        aria-label="Comment"
        className="mb-1.5 max-h-24 min-h-10 resize-y sm:mb-3 sm:max-h-40 sm:min-h-20"
        onChange={(event) => setComment(event.target.value)}
        placeholder="Leave a comment on GitHub…"
        rows={2}
        value={comment}
      />
      <div className="flex flex-wrap justify-end gap-2">
        {isOpenIssue && (
          <Menu>
            <MenuTrigger render={<Button size="sm" variant="outline" />}>
              <Check className="size-3.5" />
              {comment.trim() ? "Close with comment" : "Close issue"}
              <ChevronDown className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-56">
              <MenuItem
                disabled={pending}
                onClick={() => closeIssue.mutate("completed")}
              >
                <Check className="size-3.5" /> Close as completed
              </MenuItem>
              <MenuItem
                disabled={pending}
                onClick={() => closeIssue.mutate("not_planned")}
              >
                <Ban className="size-3.5" /> Close as not planned
              </MenuItem>
            </MenuPopup>
          </Menu>
        )}
        <Button
          disabled={pending || !comment.trim()}
          onClick={() => addComment.mutate()}
          size="sm"
        >
          {addComment.isPending && (
            <LoaderCircle className="size-3.5 animate-spin" />
          )}
          Comment
        </Button>
      </div>
    </div>
  );
}
