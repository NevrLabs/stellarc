import { MarkdownRenderer } from "@/components/public-board/markdown-renderer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarTone } from "@/lib/avatar-tone";
import type { RepoIssueGithub, RepoIssueGithubActor } from "@/types/repo";

type RepoIssueHistoryProps = { github?: RepoIssueGithub };

// GitHub renders one chronological conversation. Comments and events are the
// same stream, so interleave them by timestamp instead of splitting sections.
type Entry =
  | {
      kind: "comment";
      at: number;
      comment: RepoIssueGithub["comments"][number];
    }
  | { kind: "event"; at: number; event: RepoIssueGithub["timeline"][number] }
  | {
      kind: "label-change";
      at: number;
      actor?: RepoIssueGithubActor;
      createdAt?: string | null;
      added: RepoIssueGithub["timeline"];
      removed: RepoIssueGithub["timeline"];
    };

const HIDDEN_EVENTS = new Set([
  "commented",
  "committed",
  "subscribed",
  "mentioned",
]);

function time(value?: string | null) {
  return value ? new Date(value).getTime() : 0;
}

function isLabelChange(
  entry: Entry,
): entry is Extract<Entry, { kind: "event" }> {
  return (
    entry.kind === "event" &&
    ["labeled", "unlabeled"].includes(entry.event.event ?? "")
  );
}

function sameActor(
  first?: RepoIssueGithubActor,
  second?: RepoIssueGithubActor,
) {
  return first?.login === second?.login;
}

function groupLabelChanges(entries: Entry[]) {
  return entries.reduce<Entry[]>((grouped, entry) => {
    if (!isLabelChange(entry)) {
      grouped.push(entry);
      return grouped;
    }

    const previous = grouped.at(-1);
    const canJoin =
      previous?.kind === "label-change" &&
      previous.at === entry.at &&
      sameActor(previous.actor, entry.event.actor);
    const labelChange = canJoin
      ? previous
      : {
          kind: "label-change" as const,
          at: entry.at,
          actor: entry.event.actor,
          createdAt: entry.event.created_at,
          added: [],
          removed: [],
        };

    if (!canJoin) grouped.push(labelChange);
    labelChange[entry.event.event === "labeled" ? "added" : "removed"].push(
      entry.event,
    );
    return grouped;
  }, []);
}

function normalizeColor(color?: string | null) {
  if (!color) return null;
  const normalized = color.startsWith("#") ? color : `#${color}`;
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(normalized) ? normalized : null;
}

function Actor({ actor }: { actor?: RepoIssueGithubActor }) {
  const login = actor?.login ?? "GitHub";
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
      <Avatar className={`size-5 ${getAvatarTone(actor?.login)}`}>
        <AvatarImage alt={login} src={actor?.avatar_url ?? undefined} />
        <AvatarFallback className="bg-transparent text-[8px]">
          {login.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {login}
    </span>
  );
}

function describe(event: RepoIssueGithub["timeline"][number]) {
  const name = event.event ?? "updated";
  if (name === "closed") {
    return event.state_reason === "not_planned"
      ? "closed this as not planned"
      : event.state_reason === "duplicate"
        ? "closed this as a duplicate"
        : "closed this as completed";
  }
  if (name === "reopened") return "reopened this";
  if (name === "assigned")
    return `assigned ${event.assignee?.login ?? "someone"}`;
  if (name === "unassigned")
    return `unassigned ${event.assignee?.login ?? "someone"}`;
  if (name === "milestoned")
    return `added this to the ${event.milestone?.title ?? ""} milestone`;
  if (name === "demilestoned") return "removed this from the milestone";
  if (name === "renamed") return "changed the title";
  if (name === "cross-referenced") return "referenced this";
  return name.replaceAll("_", " ");
}

function LabelPill({
  label,
}: {
  label: RepoIssueGithub["timeline"][number]["label"];
}) {
  const color = normalizeColor(label?.color);
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-foreground"
      style={
        color
          ? { backgroundColor: `${color}1a`, borderColor: `${color}80` }
          : undefined
      }
    >
      {label?.name ?? "label"}
    </span>
  );
}

function LabelChange({
  entry,
}: {
  entry: Extract<Entry, { kind: "label-change" }>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      <Actor actor={entry.actor} />
      {entry.added.length > 0 && (
        <>
          <span>added {entry.added.length === 1 ? "label" : "labels"}</span>
          {entry.added.map((event, index) => (
            <LabelPill
              key={`added-${event.id ?? event.node_id ?? index}`}
              label={event.label}
            />
          ))}
        </>
      )}
      {entry.added.length > 0 && entry.removed.length > 0 && <span>and</span>}
      {entry.removed.length > 0 && (
        <>
          <span>removed {entry.removed.length === 1 ? "label" : "labels"}</span>
          {entry.removed.map((event, index) => (
            <LabelPill
              key={`removed-${event.id ?? event.node_id ?? index}`}
              label={event.label}
            />
          ))}
        </>
      )}
      {entry.createdAt && (
        <time className="text-xs">
          {new Date(entry.createdAt).toLocaleString()}
        </time>
      )}
    </li>
  );
}

export default function RepoIssueHistory({ github }: RepoIssueHistoryProps) {
  if (!github) return null;
  const entries = groupLabelChanges(
    [
      ...(github.comments ?? []).map((comment) => ({
        kind: "comment" as const,
        at: time(comment.created_at),
        comment,
      })),
      ...(github.timeline ?? [])
        .filter((event) => !HIDDEN_EVENTS.has(event.event ?? ""))
        .map((event) => ({
          kind: "event" as const,
          at: time(event.created_at),
          event,
        })),
    ].sort((a, b) => a.at - b.at),
  );

  return (
    <div className="border-b border-border/80 px-6 py-5">
      <section>
        <div className="mb-3 text-sm font-semibold">Conversation</div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="space-y-3 border-l border-border/70 pl-4">
            {entries.map((entry, index) =>
              entry.kind === "comment" ? (
                <li key={`c-${entry.comment.id ?? index}`}>
                  <article className="overflow-hidden rounded-lg border">
                    <header className="flex flex-wrap items-center gap-2 border-b bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                      <Actor actor={entry.comment.user} />
                      <span>commented</span>
                      {entry.comment.created_at && (
                        <time>
                          {new Date(entry.comment.created_at).toLocaleString()}
                        </time>
                      )}
                    </header>
                    <div className="px-4 py-4">
                      {entry.comment.body ? (
                        <MarkdownRenderer content={entry.comment.body} />
                      ) : (
                        <span className="text-sm italic text-muted-foreground">
                          No content
                        </span>
                      )}
                    </div>
                  </article>
                </li>
              ) : entry.kind === "label-change" ? (
                <LabelChange
                  entry={entry}
                  key={`l-${entry.added[0]?.id ?? entry.removed[0]?.id ?? index}`}
                />
              ) : (
                <li
                  className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
                  key={`e-${entry.event.id ?? entry.event.node_id ?? index}`}
                >
                  <Actor actor={entry.event.actor} />
                  <span>{describe(entry.event)}</span>
                  {entry.event.created_at && (
                    <time className="text-xs">
                      {new Date(entry.event.created_at).toLocaleString()}
                    </time>
                  )}
                </li>
              ),
            )}
          </ol>
        )}
      </section>
    </div>
  );
}
