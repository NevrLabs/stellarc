import { useState } from "react";
import CommentEditor from "@/components/activity/comment-editor";
import { MarkdownRenderer } from "@/components/public-board/markdown-renderer";
import { Button } from "@/components/ui/button";
import { uploadRepoMedia } from "@/lib/upload-repo-media";

type RepoDescriptionEditorProps = {
  body: string;
  onSave: (markdown: string) => Promise<void>;
  isSaving?: boolean;
  placeholder?: string;
  repoId: string;
};

function normalizeMarkdown(markdown: string) {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n{2,}$/g, "\n");
}

/**
 * Inline Markdown editor for GitHub issue and PR descriptions.
 *
 * This intentionally reuses the same `CommentEditor` that task descriptions and
 * comments use, so slash commands, bubble menu, shortcuts, and Markdown
 * round-tripping behave identically everywhere in Kaneo. Earlier this component
 * hand-rolled its own Tiptap setup, which drifted from the task editor.
 */
export function RepoDescriptionEditor({
  body,
  onSave,
  isSaving = false,
  placeholder = "Add a description…",
  repoId,
}: RepoDescriptionEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(body);

  const startEditing = () => {
    setDraft(body);
    setIsEditing(true);
  };

  const cancel = () => {
    setDraft(body);
    setIsEditing(false);
  };

  const save = async () => {
    const next = normalizeMarkdown(draft).trim();
    if (next === normalizeMarkdown(body).trim()) {
      setIsEditing(false);
      return;
    }
    await onSave(next);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Description</h3>
          <Button onClick={startEditing} size="sm" variant="outline">
            Edit
          </Button>
        </div>
        {body.trim() ? (
          <MarkdownRenderer content={body} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No description provided.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Description</h3>
      <CommentEditor
        autoFocus
        onCancelShortcut={cancel}
        onChange={setDraft}
        onSubmitShortcut={() => void save()}
        placeholder={placeholder}
        uploadSurface="description"
        uploadFile={(file, surface) =>
          uploadRepoMedia({ repoId, file, surface })
        }
        value={draft}
      />
      <div className="flex items-center gap-2">
        <Button disabled={isSaving} onClick={() => void save()} size="sm">
          {isSaving ? "Saving…" : "Save"}
        </Button>
        <Button
          disabled={isSaving}
          onClick={cancel}
          size="sm"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default RepoDescriptionEditor;
