import { useMemo, useState, type FormEvent } from "react";
import { Icon } from "../../../components/Icon";
import type { CreateVaultBody, NoteTreeEntry } from "../../../types";

interface DialogShellProps {
  title: string;
  icon: "book" | "file";
  children: React.ReactNode;
  onClose: () => void;
}

function DialogShell({ title, icon, children, onClose }: DialogShellProps) {
  return (
    <div className="ol-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="ol-dialog vault-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="ol-dialog-head">
          <div className="vault-dialog-title"><Icon name={icon} size={18} /><span>{title}</span></div>
          <button type="button" className="ibtn" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CreateVaultDialog({
  busy,
  error,
  onClose,
  onCreate,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (body: CreateVaultBody) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [adapter, setAdapter] = useState<"none" | "github" | "olympus">("none");
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("main");
  const [direction, setDirection] = useState<"pull" | "push" | "bidirectional">("bidirectional");
  const [remoteInstallation, setRemoteInstallation] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const syncBindings: CreateVaultBody["syncBindings"] = adapter === "github"
      ? [{ adapter, repo: repository.trim(), branch: branch.trim(), direction }]
      : adapter === "olympus"
        ? [{ adapter, remoteInstallation: remoteInstallation.trim(), direction }]
        : [];
    void onCreate({ name: name.trim(), syncBindings });
  };

  const syncValid = adapter === "none"
    || (adapter === "github" && !!repository.trim() && !!branch.trim())
    || (adapter === "olympus" && !!remoteInstallation.trim());

  return (
    <DialogShell title="Create vault" icon="book" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="ol-dialog-body vault-form">
          <label><span>Vault name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Engineering" required /></label>
          <details>
            <summary>Synchronization (optional)</summary>
            <label><span>Adapter</span><select aria-label="Synchronization adapter" value={adapter} onChange={(event) => setAdapter(event.target.value as typeof adapter)}><option value="none">None</option><option value="github">GitHub</option><option value="olympus">Olympus native</option></select></label>
            {adapter === "github" && <>
              <label><span>Repository</span><input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository" pattern="[^/\s]+/[^/\s]+" required /></label>
              <label><span>Default branch</span><input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="main" required /></label>
              <label><span>Direction</span><select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="bidirectional">Bidirectional</option><option value="pull">Pull only</option><option value="push">Push only</option></select></label>
            </>}
            {adapter === "olympus" && <>
              <label><span>Remote Olympus installation</span><input value={remoteInstallation} onChange={(event) => setRemoteInstallation(event.target.value)} placeholder="installation ID" required /></label>
              <label><span>Direction</span><select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}><option value="bidirectional">Bidirectional</option><option value="pull">Pull only</option><option value="push">Push only</option></select></label>
              <div className="vault-form-note">Direct Olympus transport is not connected yet.</div>
            </>}
          </details>
          <div className="vault-form-note">Olympus keeps the authoritative jj working copy. Synchronization can be added later.</div>
          {error && <div className="vault-form-error" role="alert">{error}</div>}
        </div>
        <div className="ol-dialog-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy || !name.trim() || !syncValid}>{busy ? "Creating…" : "Create vault"}</button>
        </div>
      </form>
    </DialogShell>
  );
}

export function NewNoteDialog({
  folder,
  notes = [],
  busy,
  error,
  onClose,
  onCreate,
}: {
  folder: string | null;
  notes?: NoteTreeEntry[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (path: string, title: string) => Promise<void>;
}) {
  const folders = useMemo(() => collectFolders(notes), [notes]);
  const initialFolder = folder && (folder === "" || folders.some((entry) => entry.path === folder)) ? folder : "";
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState(initialFolder);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const noteTitle = title.trim() || "Untitled";
    const file = `${slugify(noteTitle)}.md`;
    void onCreate(destination ? `${destination}/${file}` : file, noteTitle);
  };

  const preview = destination ? `${destination}/${slugify(title || "Untitled")}.md` : `${slugify(title || "Untitled")}.md`;

  return (
    <DialogShell title="New note" icon="file" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="ol-dialog-body vault-form">
          <label><span>Title</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Untitled" /></label>
          <div className="vault-folder-picker">
            <div className="vault-folder-picker-head"><span>Destination</span><code>{preview}</code></div>
            <div className="vault-folder-tree" role="tree" aria-label="Destination folder">
              <button type="button" role="treeitem" aria-pressed={destination === ""} className="vault-folder-option" onClick={() => setDestination("")}><Icon name="book" size={13} />Vault root</button>
              {folders.map((entry) => (
                <button key={entry.path} type="button" role="treeitem" aria-pressed={destination === entry.path} className="vault-folder-option" style={{ paddingLeft: 10 + entry.depth * 14 }} onClick={() => setDestination(entry.path)}><Icon name="folder" size={13} />{entry.title}</button>
              ))}
            </div>
          </div>
          {error && <div className="vault-form-error" role="alert">{error}</div>}
        </div>
        <div className="ol-dialog-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Create note"}</button>
        </div>
      </form>
    </DialogShell>
  );
}

function collectFolders(notes: NoteTreeEntry[], depth = 0): Array<NoteTreeEntry & { depth: number }> {
  return notes.flatMap((entry) => entry.kind === "folder"
    ? [{ ...entry, depth }, ...collectFolders(entry.children, depth + 1)]
    : []);
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
}
