import { useQuery } from "@tanstack/react-query";
import { mergeAttributes, Node } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/preview-card";
import getBoard from "@/fetchers/board/get-board";
import getTask from "@/fetchers/task/get-task";
import { escapeHtml, isValidUrl } from "./url-safety";

function parseTaskRouteFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(
      /\/dashboard\/organization\/([^/]+)\/board\/([^/]+)\/task\/([^/]+)(?:\/|$)/i,
    );
    if (!match) return null;
    return {
      organizationId: match[1],
      boardId: match[2],
      taskId: match[3],
    };
  } catch {
    return null;
  }
}

function KaneoIssueLinkView({ node }: NodeViewProps) {
  const { t } = useTranslation();
  const issueKey = String(node.attrs.issueKey || "");
  const taskIdAttr = String(node.attrs.taskId || "");
  const url = String(node.attrs.url || "");
  const taskRoute = parseTaskRouteFromUrl(url);
  const taskId = taskIdAttr || taskRoute?.taskId || "";

  const { data: task } = useQuery({
    queryKey: ["task", taskId, "kaneo-issue-link"],
    queryFn: () => getTask(taskId),
    enabled: Boolean(taskId),
    staleTime: 1000 * 60,
  });
  const { data: board } = useQuery({
    queryKey: [
      "boards",
      taskRoute?.organizationId,
      taskRoute?.boardId,
      "kaneo-issue-link",
    ],
    queryFn: () =>
      getBoard({
        id: taskRoute?.boardId ?? "",
        organizationId: taskRoute?.organizationId ?? "",
      }),
    enabled: Boolean(taskRoute?.organizationId && taskRoute?.boardId),
    staleTime: 1000 * 60,
  });

  const boardSlug = board?.slug ? String(board.slug).toUpperCase() : "";
  const resolvedIssueKey =
    issueKey ||
    (boardSlug && task?.number ? `${boardSlug}-${task.number}` : "");
  const title = task?.title || issueKey || t("tasks:entity.task");
  const status = task?.status
    ? t(`tasks:status.${task.status}`)
    : t("tasks:status.to-do");
  const priority = task?.priority
    ? t(`tasks:priority.${task.priority}`)
    : t("tasks:priority.no-priority");
  const assignee = task?.assigneeName || t("tasks:assignee.unassigned");
  const resolvedHref =
    taskRoute?.organizationId && taskRoute?.boardId && task?.id
      ? `/dashboard/organization/${taskRoute.organizationId}/board/${taskRoute.boardId}/task/${task.id}`
      : url;
  const isInternal = resolvedHref.startsWith("/");
  // Reject non-http(s) external URLs (javascript:, data:, ...).
  const href = isInternal || isValidUrl(resolvedHref) ? resolvedHref : "";

  return (
    <NodeViewWrapper as="span" className="kaneo-issue-link-node">
      <HoverCard openDelay={160} closeDelay={120}>
        <HoverCardTrigger asChild>
          <a
            href={href || undefined}
            target={isInternal ? undefined : "_blank"}
            rel={isInternal ? undefined : "noopener noreferrer"}
            className="kaneo-issue-link-chip"
          >
            {resolvedIssueKey ? (
              <span className="kaneo-issue-link-key">{resolvedIssueKey}</span>
            ) : null}
            <span className="kaneo-issue-link-title">{title}</span>
          </a>
        </HoverCardTrigger>
        <HoverCardContent
          side="top"
          align="start"
          sideOffset={8}
          className="kaneo-issue-link-preview"
        >
          <div className="kaneo-issue-link-preview-top">
            <span className="kaneo-issue-link-preview-key">
              {resolvedIssueKey || t("tasks:entity.task")}
            </span>
            <span className="kaneo-issue-link-preview-assignee">
              {assignee}
            </span>
          </div>
          <p className="kaneo-issue-link-preview-title">{title}</p>
          <div className="kaneo-issue-link-preview-meta">
            <span>{status}</span>
            <span>·</span>
            <span>{priority}</span>
          </div>
        </HoverCardContent>
      </HoverCard>
    </NodeViewWrapper>
  );
}

export const KaneoIssueLink = Node.create({
  name: "kaneoIssueLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    /*
     * #128: each attribute needs an explicit parseHTML.
     *
     * Tiptap's default parser looks for a DOM attribute named exactly like the
     * attribute key, i.e. `issueKey` / `taskId`. renderHTML writes kebab-case
     * (`issue-key`, `task-id`, plus `data-` variants), so on the way back in
     * nothing matched and both fell back to "". That is why a saved mention
     * reloaded as `issue-key="" task-id=""` and rendered blank.
     */
    return {
      url: {
        default: "",
        parseHTML: (element) => element.getAttribute("url") ?? "",
      },
      issueKey: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("issue-key") ??
          element.getAttribute("data-issue-key") ??
          "",
      },
      taskId: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("task-id") ??
          element.getAttribute("data-task-id") ??
          "",
      },
    };
  },

  parseHTML() {
    return [
      { tag: "kaneo-issue-link[url]" },
      { tag: "span[data-type='kaneo-issue-link'][data-url]" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "kaneo-issue-link",
      mergeAttributes(HTMLAttributes, {
        "data-type": "kaneo-issue-link",
        "data-url": HTMLAttributes.url,
        "data-issue-key": HTMLAttributes.issueKey,
        "data-task-id": HTMLAttributes.taskId,
        url: HTMLAttributes.url,
        "issue-key": HTMLAttributes.issueKey,
        "task-id": HTMLAttributes.taskId,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KaneoIssueLinkView);
  },

  renderMarkdown(
    node: { attrs?: { url?: string; issueKey?: string; taskId?: string } },
    _helpers: unknown,
    _context: unknown,
  ) {
    const url = String(node.attrs?.url || "");
    const issueKey = String(node.attrs?.issueKey || "");
    const taskId = String(node.attrs?.taskId || "");
    if (!url) return "";
    /*
     * #128: an explicit closing tag, NOT a self-closing `/>`.
     *
     * `<kaneo-issue-link ... />` is not valid HTML for a non-void element, so
     * the parser treats it as an OPEN tag and swallows everything after it —
     * which is why a description lost all of its text following a mention.
     * Custom elements must be written `<tag ...></tag>`.
     */
    return `\n<kaneo-issue-link url="${escapeHtml(url)}" issue-key="${escapeHtml(issueKey)}" task-id="${escapeHtml(taskId)}"></kaneo-issue-link>\n`;
  },
});
