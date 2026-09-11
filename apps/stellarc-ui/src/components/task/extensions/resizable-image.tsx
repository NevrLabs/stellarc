import Image from "@tiptap/extension-image";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AttachmentContextMenu } from "@/components/task/attachment-context-menu";
import {
  clampImageWidth,
  imageTooltip,
  imageWrapperClass,
  MIN_IMAGE_WIDTH,
} from "@/lib/editor-image-resize";

export function ResizableImageView({
  node,
  editor,
  getPos,
  selected,
}: NodeViewProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [resizing, setResizing] = useState(false);
  const drag = useRef({ startX: 0, startWidth: 0 });
  const { src = "", alt = "", title = "", width = null } = node.attrs;
  const tooltip = imageTooltip(title, alt, src);

  const commitWidth = useCallback(() => {
    setResizing(false);
    const image = imageRef.current;
    const pos = typeof getPos === "function" ? getPos() : null;
    if (!image || pos === null || pos === undefined) return;
    const nextWidth = clampImageWidth(Number.parseInt(image.style.width, 10));
    editor.view.dispatch(
      editor.view.state.tr.setNodeMarkup(pos, undefined, {
        ...editor.view.state.doc.nodeAt(pos)?.attrs,
        width: nextWidth,
      }),
    );
  }, [editor, getPos]);

  useEffect(() => {
    if (!resizing) return;
    const move = (event: PointerEvent) => {
      const image = imageRef.current;
      if (!image) return;
      image.style.width = `${clampImageWidth(drag.current.startWidth + event.clientX - drag.current.startX, image.parentElement?.parentElement?.clientWidth || undefined)}px`;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", commitWidth);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", commitWidth);
    };
  }, [commitWidth, resizing]);

  const remove = () => {
    const pos = typeof getPos === "function" ? getPos() : null;
    if (pos === null || pos === undefined) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  };

  return (
    <NodeViewWrapper as="span">
      <AttachmentContextMenu
        url={src}
        filename={tooltip}
        isImage
        onRemove={remove}
      >
        <span
          className={`${imageWrapperClass(selected)}${resizing ? " is-resizing" : ""}`}
          data-selected={selected ? "true" : undefined}
          data-testid="editor-image-wrapper"
          title={tooltip}
        >
          <img
            ref={imageRef}
            alt={alt || ""}
            className="kaneo-editor-image"
            draggable={false}
            loading="lazy"
            src={src}
            style={width ? { width: `${width}px` } : undefined}
            title={tooltip}
            width={width || undefined}
          />
          <span
            aria-hidden="true"
            className="kaneo-editor-image-resize-handle"
            contentEditable={false}
            data-testid="editor-image-resize-handle"
            onPointerDown={(event) => {
              if (!editor.isEditable) return;
              event.preventDefault();
              event.stopPropagation();
              drag.current = {
                startX: event.clientX,
                startWidth:
                  imageRef.current?.getBoundingClientRect().width ||
                  width ||
                  MIN_IMAGE_WIDTH,
              };
              setResizing(true);
            }}
          />
        </span>
      </AttachmentContextMenu>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  name: "image",
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null as number | null,
        parseHTML: (element) => {
          const raw =
            element.getAttribute("width") ||
            (element as HTMLElement).style?.width ||
            "";
          const parsed = Number.parseInt(String(raw), 10);
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML: (attributes) => {
          const width = attributes.width as number | null;
          return width
            ? { width: String(width), style: `width: ${width}px` }
            : {};
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
  renderMarkdown(node: {
    attrs?: {
      src?: string;
      alt?: string | null;
      title?: string | null;
      width?: number | null;
    };
  }) {
    const attrs = node.attrs ?? {};
    const escapeHtml = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    const src = escapeHtml(attrs.src || "");
    const alt = escapeHtml(attrs.alt || "");
    const title = attrs.title ? ` title="${escapeHtml(attrs.title)}"` : "";
    const width = attrs.width ? ` width="${attrs.width}"` : "";
    return `<img src="${src}" alt="${alt}"${title}${width}>`;
  },
});

export default ResizableImage;
