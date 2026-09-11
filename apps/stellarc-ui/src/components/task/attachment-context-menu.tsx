import { Copy, Download, ExternalLink, Link2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type AttachmentContextMenuProps = {
  url: string;
  filename?: string;
  isImage?: boolean;
  onRemove?: () => void;
  children: ReactNode;
};

function toAbsoluteUrl(url: string) {
  if (!url) return "";
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

async function copyToClipboard(value: string) {
  if (!value) return;
  try {
    await navigator.clipboard?.writeText(value);
  } catch {
    // clipboard access can be denied; nothing actionable for the user here
  }
}

/**
 * Right-click menu for task attachments (images and file cards).
 * Wraps the attachment render site following the same ContextMenu pattern
 * used by subtask-row.tsx.
 */
export function AttachmentContextMenu({
  url,
  filename,
  isImage = false,
  children,
  onRemove,
}: AttachmentContextMenuProps) {
  const { t } = useTranslation();
  const absoluteUrl = toAbsoluteUrl(url);
  const name = filename?.trim() || t("tasks:attachment.fallbackName");

  const markdown = isImage
    ? `![${name}](${absoluteUrl})`
    : `[${name}](${absoluteUrl})`;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild data-testid="attachment-context-trigger">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-56"
        data-testid="attachment-context-menu"
      >
        <ContextMenuItem
          data-testid="attachment-copy-address"
          onClick={() => copyToClipboard(absoluteUrl)}
        >
          <Link2 className="size-4" />
          {isImage
            ? t("tasks:attachment.copyImageAddress")
            : t("tasks:attachment.copyFileAddress")}
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="attachment-open-new-tab"
          onClick={() => {
            if (!absoluteUrl) return;
            window.open(absoluteUrl, "_blank", "noopener,noreferrer");
          }}
        >
          <ExternalLink className="size-4" />
          {t("tasks:attachment.openInNewTab")}
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="attachment-download"
          onClick={() => {
            if (!absoluteUrl) return;
            const anchor = document.createElement("a");
            anchor.href = absoluteUrl;
            anchor.download = name;
            anchor.rel = "noopener noreferrer";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
          }}
        >
          <Download className="size-4" />
          {t("tasks:attachment.download")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          data-testid="attachment-copy-markdown"
          onClick={() => copyToClipboard(markdown)}
        >
          <Copy className="size-4" />
          {t("tasks:attachment.copyMarkdown")}
        </ContextMenuItem>
        {onRemove ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              data-testid="attachment-remove"
              onClick={onRemove}
            >
              <Trash2 className="size-4" />
              {t("tasks:attachment.remove")}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default AttachmentContextMenu;
