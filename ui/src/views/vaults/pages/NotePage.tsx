// NotePage — an always-editable, full-pane Vault note surface.

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../../../components/Icon";
import { deleteVaultNote, putVaultNote } from "../../../api";
import { qk, useVaultNote } from "../../../hooks/queries";
import { collectVaultSuggestions } from "../editor/vaultMarkdown";
import { deleteVaultDraft, getVaultDraft, putVaultDraft } from "../../../lib/vaultDrafts";

const VaultMarkdownEditor = lazy(() =>
  import("../editor/VaultMarkdownEditor").then((module) => ({
    default: module.VaultMarkdownEditor,
  })),
);

interface NotePageProps {
  vaultId: string;
  notePath: string | null;
  onNavigateNote: (path: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  editorMode?: "rich" | "source";
  onEditorModeChange?: (mode: "rich" | "source") => void;
}

export function shouldClearDirtyAfterSave(liveDraft: string, submittedSnapshot: string): boolean {
  return liveDraft === submittedSnapshot;
}

export function NotePage({ vaultId, notePath, onDirtyChange, editorMode, onEditorModeChange }: NotePageProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: note, isLoading, error } = useVaultNote(vaultId, notePath);
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const [draftPath, setDraftPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const baseCidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!note) return;
    let active = true;
    void getVaultDraft(vaultId, note.path).then((local) => {
      if (!active) return;
      const markdown = local?.markdown ?? note.markdown;
      const restored = local != null && markdown !== note.markdown;
      setDraft(markdown); draftRef.current = markdown; setDraftPath(note.path);
      baseCidRef.current = local?.baseCid ?? note.cid ?? null;
      setDirty(restored); onDirtyChange(restored);
      setSaveError(restored ? "Local draft restored" : null);
    }).catch(() => {
      if (!active) return;
      setDraft(note.markdown); draftRef.current=note.markdown; setDraftPath(note.path);
      baseCidRef.current=note.cid ?? null; setDirty(false); onDirtyChange(false);
    });
    return () => { active = false; };
  }, [note?.path, vaultId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!notePath) return;
    const path = notePath;
    const submittedSnapshot = draftRef.current;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await putVaultNote(vaultId, path, { markdown: submittedSnapshot, expectedCid: baseCidRef.current });
      baseCidRef.current = saved.cid ?? null;
      await qc.invalidateQueries({ queryKey: qk.vaultNote(vaultId, path) });
      await qc.invalidateQueries({ queryKey: qk.vaultNotes(vaultId) });
      await deleteVaultDraft(vaultId, path);
      const clearDirty = shouldClearDirtyAfterSave(draftRef.current, submittedSnapshot);
      if (!clearDirty) await putVaultDraft(vaultId, path, draftRef.current, baseCidRef.current);
      setDirty(!clearDirty);
      onDirtyChange(!clearDirty);
    } catch (saveFailure) {
      setSaveError(saveFailure instanceof Error ? `${saveFailure.message}. Local draft kept.` : "Save failed. Local draft kept.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (dirty && !saving) void handleSave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, saving]);

  useEffect(() => {
    const sync = () => { if (dirty && !saving) void handleSave(); };
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [dirty, saving, notePath]);

  if (!notePath) {
    return (
      <div className="vault-content">
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="file" size={32} /></div>
          <div className="empty-state-title">No note selected</div>
          <div className="empty-state-msg">Pick a note from the sidebar, or create a new one.</div>
        </div>
      </div>
    );
  }

  if (isLoading || (note && draftPath !== note.path)) {
    return <div className="vault-content vault-note-surface"><div className="vault-editor-loading">Loading note…</div></div>;
  }

  if (error || !note) {
    return (
      <div className="vault-content">
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="alert" size={32} /></div>
          <div className="empty-state-title">Note not found</div>
          <div className="empty-state-msg">{notePath}</div>
        </div>
      </div>
    );
  }

  const handleDelete = async () => {
    try {
      await deleteVaultNote(vaultId, notePath);
      await qc.invalidateQueries({ queryKey: qk.vaultNotes(vaultId) });
      void navigate({ to: "/vaults/$vaultId", params: { vaultId } });
    } catch {
      // The surrounding Vault query state remains authoritative on failure.
    }
  };

  const handleCancel = () => {
    setDraft(note.markdown);
    draftRef.current = note.markdown;
    setDirty(false);
    onDirtyChange(false);
    setSaveError(null);
    void deleteVaultDraft(vaultId, notePath);
  };

  return (
    <div className="vault-content vault-note-surface">
      <Suspense fallback={<div className="vault-editor-loading">Loading editor…</div>}>
        <VaultMarkdownEditor
          key={`${vaultId}:${notePath}`}
          markdown={draft}
          suggestions={collectVaultSuggestions(draft, note.linkedNotes)}
          dirty={dirty}
          saving={saving}
          saveError={saveError}
          onSave={handleSave}
          onCancel={handleCancel}
          onDelete={handleDelete}
          editorMode={editorMode}
          onEditorModeChange={onEditorModeChange}
          onChange={(markdown) => {
            const nextDirty = markdown !== note.markdown;
            draftRef.current = markdown;
            setDraft(markdown);
            setDirty(nextDirty);
            onDirtyChange(nextDirty);
            void putVaultDraft(vaultId, notePath, markdown, baseCidRef.current);
          }}
        />
      </Suspense>
    </div>
  );
}
