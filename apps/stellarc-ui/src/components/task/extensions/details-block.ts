import { mergeAttributes, Node } from "@tiptap/core";

/**
 * Collapsible `<details>` / `<summary>` sections.
 *
 * GitHub issue and PR bodies routinely use raw `<details>` HTML for collapsible
 * sections — CodeRabbit-style review plans, "Prompt for AI agents" blocks,
 * long logs. StarterKit has no node for it, so `@tiptap/markdown` dropped the
 * wrapper entirely and every section rendered flat: the summary became an
 * ordinary paragraph, indistinguishable from the body it was supposed to hide.
 *
 * Three nodes, mirroring the HTML shape so parse and serialize round-trip:
 *   details        - block container, holds a summary plus arbitrary content
 *   detailsSummary - the always-visible clickable label
 *   detailsContent - the collapsible body
 *
 * Rendering uses the real `<details>`/`<summary>` elements so the browser
 * supplies the open/close behaviour natively — no JS, works read-only, and
 * keyboard/AT support comes for free.
 */

export const DetailsSummary = Node.create({
  name: "detailsSummary",
  content: "inline*",
  group: "block",
  defining: true,
  // A summary is part of its details wrapper; letting it be dragged or split
  // out on its own would orphan it.
  isolating: true,

  parseHTML() {
    return [{ tag: "summary" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "summary",
      mergeAttributes(HTMLAttributes, {
        class: "kaneo-details-summary",
      }),
      0,
    ];
  },

  renderMarkdown(
    node: unknown,
    helpers: { renderChildren: (n: unknown, sep?: string) => string },
  ) {
    return `<summary>${helpers.renderChildren(node)}</summary>`;
  },
});

export const DetailsContent = Node.create({
  name: "detailsContent",
  // Anything that can appear in a document body can appear inside the fold.
  content: "block+",
  group: "block",
  defining: true,

  parseHTML() {
    // `<details>` children other than `<summary>` are the body. There is no
    // dedicated element for it in the HTML spec, so we accept an explicit
    // wrapper div and otherwise let the details node hoist loose children.
    return [{ tag: "div[data-details-content]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-details-content": "",
        class: "kaneo-details-content",
      }),
      0,
    ];
  },

  renderMarkdown(
    node: unknown,
    helpers: { renderChildren: (n: unknown, sep?: string) => string },
  ) {
    return helpers.renderChildren(node, "\n");
  },
});

export const Details = Node.create({
  name: "details",
  content: "detailsSummary detailsContent",
  group: "block",
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.hasAttribute("open"),
        renderHTML: (attributes) => (attributes.open ? { open: "" } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "details",
        // Loose children (a `<summary>` followed by bare paragraphs, which is
        // exactly what GitHub bodies contain) need wrapping into the
        // detailsContent node. TipTap cannot express that with a plain tag
        // match, so normalise the DOM before it is parsed.
        getContent: undefined,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "details",
      mergeAttributes(HTMLAttributes, { class: "kaneo-details" }),
      0,
    ];
  },

  /*
    NodeView so the fold actually toggles inside an EDITABLE editor.

    In read-only surfaces the browser's native <details> behaviour just works.
    In an editable ProseMirror it does not: the editor intercepts the click,
    and even when the browser flips the `open` attribute, the next re-render
    restores the DOM from the document state, snapping the fold back. The
    NodeView makes the summary click dispatch a real transaction on the `open`
    attr, so the state change is the editor's own and survives re-renders (and
    persists through the markdown serializer).
  */
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("details");
      dom.className = "kaneo-details";
      if (node.attrs.open) dom.setAttribute("open", "");

      dom.addEventListener("click", (event) => {
        const summary = (event.target as HTMLElement | null)?.closest(
          "summary",
        );
        if (!summary || !dom.contains(summary)) return;
        /*
          Nested details: a click on the INNER fold's summary bubbles up to
          this listener too. Only the details that directly owns the summary
          may toggle, otherwise one click flips every ancestor fold at once.
        */
        if (summary.closest("details") !== dom) return;
        // Native toggling is unreliable under contenteditable; do it ourselves.
        event.preventDefault();
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        const current = editor.state.doc.nodeAt(pos);
        editor.view.dispatch(
          editor.state.tr
            .setNodeAttribute(pos, "open", !(current?.attrs.open ?? true))
            .setMeta("addToHistory", false),
        );
      });

      return {
        dom,
        contentDOM: dom,
        update: (updated) => {
          if (updated.type.name !== "details") return false;
          if (updated.attrs.open) dom.setAttribute("open", "");
          else dom.removeAttribute("open");
          return true;
        },
      };
    };
  },

  /*
    Serializer for the markdown round trip. Without it @tiptap/markdown has no
    renderer for these node types and SILENTLY DROPS the whole subtree, so the
    first save after loading a body with <details> wrote the document back
    minus every collapsible section — data loss, not just a rendering bug.

    Children are rendered as markdown and re-wrapped in the GitHub shape
    (blank line after the summary) so the saved form matches what GitHub
    produces; the load-time pre-pass folds it back into one HTML block.
  */
  renderMarkdown(
    node: { attrs?: { open?: boolean } },
    helpers: { renderChildren: (n: unknown, sep?: string) => string },
  ) {
    const inner = helpers.renderChildren(node, "\n");
    return `\n<details${node.attrs?.open === false ? "" : " open"}>\n${inner}\n</details>\n`;
  },
});

/**
 * Wrap the loose body children of every `<details>` in a `detailsContent`
 * element so the strict `detailsSummary detailsContent` schema can match.
 *
 * Exported for direct testing: the transform is the part most likely to break
 * on unusual GitHub markup, and it is pure DOM in / DOM out.
 */
export function normalizeDetailsHtml(html: string): string {
  // Guard for non-DOM environments (SSR, node tests without jsdom).
  if (typeof DOMParser === "undefined") return html;
  if (!html.includes("<details")) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const details of Array.from(doc.querySelectorAll("details"))) {
    // Skip anything already normalised.
    if (details.querySelector(":scope > [data-details-content]")) continue;

    const summary = details.querySelector(":scope > summary");
    const wrapper = doc.createElement("div");
    wrapper.setAttribute("data-details-content", "");

    for (const child of Array.from(details.childNodes)) {
      if (child === summary) continue;
      wrapper.appendChild(child);
    }

    // A details with no body still needs the content node to satisfy the
    // schema, otherwise the whole block is dropped again.
    if (!wrapper.childNodes.length) {
      wrapper.appendChild(doc.createElement("p"));
    }

    // An absent summary would also fail the schema; synthesise an empty one.
    if (!summary) {
      details.appendChild(doc.createElement("summary"));
    }

    details.appendChild(wrapper);
  }

  return doc.body.innerHTML;
}

export const DetailsExtensions = [Details, DetailsSummary, DetailsContent];

/**
 * Collapse a `<details>` block onto single lines so markdown-it keeps its body
 * inside the fold.
 *
 * GitHub and CodeRabbit write the shape below, with blank lines around the body
 * because that is what makes the *inner* content parse as markdown on GitHub:
 *
 *     <details>
 *     <summary>Label</summary>
 *
 *     Body text
 *
 *     </details>
 *
 * markdown-it ends an HTML block at the first blank line, so everything after
 * `</summary>` is parsed as ordinary top-level markdown and lands as a SIBLING
 * of the `<details>`, not a child. The fold then renders empty and its content
 * appears flat underneath — the reported bug. Verified against the real editor:
 *
 *     <details>...<div data-details-content><p></p></div></details>
 *     <p>Body text</p>            <-- escaped the fold
 *
 * Removing the blank lines keeps the whole block in one HTML token, so the body
 * stays nested. The trade-off is that the body is then HTML, not markdown, so
 * `renderInner` converts it first — callers pass their markdown renderer to
 * avoid a hard dependency here.
 *
 * Nesting is handled by walking depth: CodeRabbit nests `<details>` inside
 * `<details>`, and a naive first-`</details>`-wins scan would close the outer
 * block at the inner terminator.
 */
export function inlineDetailsBlocks(
  markdown: string,
  renderInner: (md: string) => string,
): string {
  if (!markdown.includes("<details")) return markdown;

  const lines = markdown.split("\n");
  const out: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!/^\s*<details\b/i.test(line)) {
      out.push(line);
      index += 1;
      continue;
    }

    // Collect the whole block, tracking depth so nested details close correctly.
    const block: string[] = [];
    let depth = 0;
    while (index < lines.length) {
      const current = lines[index];
      depth += (current.match(/<details\b/gi) ?? []).length;
      depth -= (current.match(/<\/details>/gi) ?? []).length;
      block.push(current);
      index += 1;
      if (depth <= 0) break;
    }

    out.push(collapseDetailsBlock(block.join("\n"), renderInner));
  }

  return out.join("\n");
}

/** Turn one `<details>` block into a single-line, fully-HTML equivalent. */
function collapseDetailsBlock(
  block: string,
  renderInner: (md: string) => string,
): string {
  const open = block.match(/^\s*(<details\b[^>]*>)/i)?.[1] ?? "<details>";
  const summaryMatch = block.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);

  /*
    The summary's inner text is markdown too — GitHub renders `**bold**` inside
    a <summary>, and our own serializer writes bold back as `**`. Render it as
    an inline fragment (strip the wrapping <p> the renderer adds) or the
    asterisks display literally after one save/load cycle.
  */
  let summary = "<summary></summary>";
  if (summaryMatch) {
    const rendered = renderInner(summaryMatch[1].trim())
      .trim()
      .replace(/^<p>/, "")
      .replace(/<\/p>$/, "");
    summary = `<summary>${rendered}</summary>`;
  }

  let body = block
    .replace(/^\s*<details\b[^>]*>/i, "")
    .replace(/<\/details>\s*$/i, "");
  if (summaryMatch) body = body.replace(summaryMatch[0], "");

  // Recurse first so nested folds are collapsed before this body is rendered.
  const inner = inlineDetailsBlocks(body.trim(), renderInner);
  const renderedBody = inner ? renderInner(inner) : "";

  // One line: no blank line means markdown-it cannot split the block.
  return `${open}${summary}${renderedBody}</details>`;
}

export default DetailsExtensions;
