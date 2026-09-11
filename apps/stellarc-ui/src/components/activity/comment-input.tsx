import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Paperclip } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import CommentEditor from "@/components/activity/comment-editor";
import { Button } from "@/components/ui/button";
import { KbdSequence } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import useCreateComment from "@/hooks/mutations/comment/use-create-comment";
import { getModifierKeyText } from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/cn";
import useCommentDraftStore, {
  commentDraftKey,
  isPersistableCommentDraft,
} from "@/lib/editor-comment-draft";
import { toast } from "@/lib/toast";

type CommentInputProps = {
  taskId: string;
};

export default function CommentInput({ taskId }: CommentInputProps) {
  const { t } = useTranslation();
  const draftKey = commentDraftKey(taskId);
  /*
   * #100: seed from the persisted draft on the FIRST render, not in an effect.
   *
   * The editor hydrates its document exactly once, from whatever `value` it
   * holds at mount. Restoring in a `useEffect` delivered the draft one render
   * too late: the editor had already hydrated with "", so the restored text
   * was treated as a no-op and the composer came back empty — the draft was in
   * localStorage the whole time, which is why this looked "implemented".
   */
  const [content, setContent] = useState(
    () => useCommentDraftStore.getState().getDraft(draftKey)?.content ?? "",
  );
  const [attachAction, setAttachAction] = useState<(() => void) | null>(null);
  const { mutateAsync: createComment, isPending } = useCreateComment();
  const queryClient = useQueryClient();
  const saveDraft = useCommentDraftStore((state) => state.saveDraft);
  const clearDraft = useCommentDraftStore((state) => state.clearDraft);
  /**
   * Which draft key has already been restored into this composer.
   *
   * Starts null: seeding it with `draftKey` made the restore effect return on
   * its very first run, so a draft that was present in the store was never
   * applied — the composer opened empty while localStorage still held the text.
   */
  const restoredForRef = useRef<string | null>(null);
  /**
   * Whether the user has typed in THIS composer instance.
   *
   * Deliberately starts false even when a draft was restored: the first empty
   * onChange after mount is the editor hydrating, not the user clearing the
   * box, and treating it as the latter is what destroyed saved drafts.
   */
  const hasHadContentRef = useRef(false);

  // Restore an unsent comment when the task is (re)opened.
  //
  // #100: subscribed rather than read once. `persist` may rehydrate from
  // localStorage AFTER this component first renders, in which case a one-shot
  // `getState()` read (in an effect or a lazy useState) sees an empty store and
  // the draft is silently dropped. Subscribing means the restore also fires if
  // the draft arrives late.
  const storedDraft = useCommentDraftStore(
    (state) => state.drafts[draftKey]?.content,
  );

  useEffect(() => {
    // Never clobber what the user is actively typing.
    if (hasHadContentRef.current) return;
    if (restoredForRef.current === draftKey) return;
    if (!storedDraft) return;
    restoredForRef.current = draftKey;
    setContent(storedDraft);
  }, [draftKey, storedDraft]);

  const handleChange = useCallback(
    (next: string) => {
      /*
       * #100: the editor reports an empty document while it hydrates. That
       * arrives AFTER the draft has been restored into state, so accepting it
       * blindly overwrote the restored text with "" — the draft stayed in
       * localStorage while the composer rendered empty.
       *
       * Until the user has actually typed here, an empty report is hydration
       * noise: ignore it entirely, for both state and storage.
       */
      if (!isPersistableCommentDraft(next) && !hasHadContentRef.current) {
        return;
      }

      setContent(next);

      if (isPersistableCommentDraft(next)) {
        hasHadContentRef.current = true;
      }
      saveDraft(draftKey, next);
    },
    [draftKey, saveDraft],
  );

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) {
      toast.error(t("activity:comment.cannotBeEmpty"));
      return;
    }

    try {
      await createComment({
        taskId,
        comment: content,
      });

      setContent("");
      // The comment exists now; a resurrected draft would duplicate it.
      clearDraft(draftKey);
      await queryClient.invalidateQueries({ queryKey: ["activities", taskId] });

      toast.success(t("activity:comment.added"));
    } catch (error) {
      console.error("Failed to create comment:", error);
      toast.error(t("activity:comment.failedToAdd"));
    }
  }, [clearDraft, content, createComment, draftKey, queryClient, t, taskId]);

  const handleAttachActionChange = useCallback(
    (nextAttachAction: (() => void) | null) => {
      setAttachAction(() => nextAttachAction);
    },
    [],
  );

  /**
   * #100: a draft exists once there is persistable content. Derived from the
   * live editor value rather than the store so the indicator appears as soon
   * as you type, matching when the draft is actually written.
   */
  const hasDraft = isPersistableCommentDraft(content);

  const handleDeleteDraft = useCallback(() => {
    clearDraft(draftKey);
    setContent("");
    // The composer is empty again by explicit choice, so a later hydration
    // blank must not be mistaken for content the user still wants kept.
    hasHadContentRef.current = false;
  }, [clearDraft, draftKey]);

  return (
    <div className="w-full">
      <div className="rounded-xl border border-border/80 bg-card/70 transition-colors focus-within:border-ring/60 focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_20%,transparent)]">
        <CommentEditor
          value={content}
          onChange={handleChange}
          placeholder={t("activity:comment.leavePlaceholder")}
          taskId={taskId}
          uploadSurface="comment"
          showQuickAttachButton={false}
          onAttachActionChange={handleAttachActionChange}
          className="[&_.kaneo-comment-editor-content_.ProseMirror]:min-h-[3rem] [&_.kaneo-comment-editor-content_.ProseMirror]:max-h-none [&_.kaneo-comment-editor-content_.ProseMirror]:overflow-visible [&_.kaneo-comment-editor-content_.ProseMirror]:px-3 [&_.kaneo-comment-editor-content_.ProseMirror]:pt-3 [&_.kaneo-comment-editor-content_.ProseMirror]:pb-2"
          onSubmitShortcut={handleSubmit}
        />
        <div className="flex items-center gap-2 border-border/70 border-t px-2 py-2">
          {/*
            #100: tell the user the draft is kept, and give them a way out of
            it. Without this the persistence is invisible — you only discover
            it by accident, and you cannot discard a draft except by selecting
            all the text and deleting it.
          */}
          {hasDraft && (
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className="text-[11px] text-muted-foreground"
                data-testid="comment-draft-status"
              >
                {t("activity:comment.draftSaved")}
              </span>
              <Button
                className="h-auto px-1 py-0 text-[11px] text-muted-foreground hover:text-foreground"
                data-testid="comment-draft-delete"
                onClick={handleDeleteDraft}
                size="xs"
                variant="ghost"
              >
                {t("activity:comment.deleteDraft")}
              </Button>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => attachAction?.()}
              disabled={!attachAction}
              className="text-muted-foreground"
              aria-label={t("activity:comment.attachFile")}
            >
              <Paperclip className="size-3.5" />
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    data-testid="comment-submit"
                    size="xs"
                    variant="default"
                    onClick={handleSubmit}
                    disabled={isPending || !content.trim()}
                    className={cn(
                      isPending ||
                        (!content.trim() && "opacity-50 cursor-not-allowed"),
                      content.trim().length > 0 &&
                        "bg-primary text-primary-foreground",
                    )}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <KbdSequence
                    keys={[getModifierKeyText(), "Enter"]}
                    description={t("activity:comment.submitShortcut")}
                  />
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
