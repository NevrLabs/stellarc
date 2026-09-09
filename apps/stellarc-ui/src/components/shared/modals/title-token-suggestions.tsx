import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import {
  filterTitleTokenOptions,
  moveTitleTokenHighlight,
  type TitleToken,
  type TitleTokenKind,
} from "@/lib/title-token-autocomplete";

export type TitleTokenOption = {
  id: string;
  name: string;
  /** Optional swatch (labels) or icon (priority) rendered before the name. */
  color?: string;
  icon?: React.ReactNode;
};

type TitleTokenSuggestionsProps = {
  token: TitleToken | null;
  options: readonly TitleTokenOption[];
  onCommit: (option: TitleTokenOption) => void;
  onDismiss: () => void;
  /** Exposes the keyboard contract to the title input. */
  onRegisterKeyHandler?: (
    handler: ((event: React.KeyboardEvent<HTMLInputElement>) => boolean) | null,
  ) => void;
};

const KIND_LABEL: Record<TitleTokenKind, string> = {
  label: "tasks:titleTokens.labels",
  user: "tasks:titleTokens.members",
  priority: "tasks:titleTokens.priority",
};

/**
 * #266: the panel is portaled to `document.body`, so it can no longer be
 * positioned by an `absolute` offset from its JSX parent — it is measured off a
 * zero-height anchor left behind at the original spot and painted with
 * `position: fixed`.
 */
type AnchorRect = { top: number; left: number; width: number };

function readAnchorRect(element: HTMLElement | null): AnchorRect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { top: rect.bottom, left: rect.left, width: rect.width };
}

/**
 * #72: the inline picker shown while a `#` / `@` / `>` token is being typed in
 * the Create Task title.
 *
 * Rendered inline beneath the title rather than as a popover, so it cannot
 * steal focus from the input — the input keeps the caret and forwards
 * navigation keys through the handler registered here.
 *
 * #266: the panel itself is PORTALED to `document.body`. It used to be an
 * `absolute` child of the create-task modal's scrolling body
 * (`overflow-y-auto`), and `overflow` clips descendants regardless of
 * `z-index` — so the list was cut off by the modal footer. A portal is the
 * only fix that escapes the clip; bumping `z-index` cannot.
 */
export function TitleTokenSuggestions({
  token,
  options,
  onCommit,
  onDismiss,
  onRegisterKeyHandler,
}: TitleTokenSuggestionsProps) {
  const { t } = useTranslation();
  const [rawHighlighted, setHighlighted] = useState(0);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);

  const matches = useMemo(
    () => (token ? filterTitleTokenOptions(options, token.query) : []),
    [options, token],
  );

  // A changed query re-ranks the list, so a stale index could point past the
  // end. Clamping during render avoids an effect that would briefly highlight
  // an unrelated row before correcting itself.
  const highlighted =
    matches.length === 0 ? 0 : rawHighlighted % matches.length;

  // Re-opening the picker for a different token must start at the top rather
  // than inheriting the previous run's highlight.
  const tokenKey = token ? `${token.kind}:${token.start}` : null;
  const lastTokenKeyRef = useRef<string | null>(null);
  if (tokenKey !== lastTokenKeyRef.current) {
    lastTokenKeyRef.current = tokenKey;
    if (rawHighlighted !== 0) setHighlighted(0);
  }

  useEffect(() => {
    if (!onRegisterKeyHandler) return;

    if (!token || matches.length === 0) {
      onRegisterKeyHandler(null);
      return;
    }

    onRegisterKeyHandler((event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((current) =>
          moveTitleTokenHighlight(current, 1, matches.length),
        );
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted((current) =>
          moveTitleTokenHighlight(current, -1, matches.length),
        );
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        // The ticket is explicit: Enter commits the suggestion. It must not
        // also submit the form.
        event.preventDefault();
        const option = matches[highlighted] ?? matches[0];
        if (option) onCommit(option);
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return true;
      }
      // Space deliberately falls through: the sigil becomes plain title text.
      return false;
    });

    return () => onRegisterKeyHandler(null);
  }, [token, matches, highlighted, onCommit, onDismiss, onRegisterKeyHandler]);

  const isOpen = Boolean(token) && matches.length > 0;

  // The anchor only exists while the picker is open, so measure in a layout
  // effect (before paint) to avoid a frame at the wrong position, and keep it
  // in sync while the modal body scrolls or the window resizes.
  useLayoutEffect(() => {
    if (!isOpen) {
      setAnchorRect(null);
      return;
    }

    const sync = () => setAnchorRect(readAnchorRect(anchorRef.current));
    sync();

    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [isOpen]);

  if (!token || !isOpen) return null;

  const panel = (
    /*
      #72: taken out of flow so it OVERLAYS the modal instead of taking part in
      its layout. As an inline block it pushed the description and footer down,
      visibly resizing the Create Task modal every time the picker opened.

      #266: `fixed` + portal rather than `absolute` inside the modal body. The
      body scrolls (`overflow-y-auto`), and an overflow container clips its
      descendants no matter how high their `z-index` is — that clipping is what
      hid the list behind the footer.
    */
    <div
      className="fixed z-[60] max-h-56 w-full max-w-xs overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
      data-testid="title-token-suggestions"
      data-token-kind={token.kind}
      style={
        anchorRect
          ? {
              top: anchorRect.top,
              left: anchorRect.left,
              width: anchorRect.width || undefined,
            }
          : { visibility: "hidden" }
      }
    >
      <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
        {t(KIND_LABEL[token.kind])}
      </div>
      {matches.map((option, index) => (
        <button
          className={cn(
            "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
            index === highlighted
              ? "bg-accent text-accent-foreground"
              : "text-foreground",
          )}
          data-active={index === highlighted ? "true" : undefined}
          data-testid="title-token-option"
          key={option.id}
          // The input owns the caret; taking focus here would close the token.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onCommit(option)}
          type="button"
        >
          {option.icon}
          {option.color && (
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: option.color }}
            />
          )}
          <span className="truncate">{option.name}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      {/*
        Zero-size marker left at the original DOM position. It carries no
        visuals; it exists only so the portaled panel can be positioned
        relative to the title input the way the inline version was.
      */}
      <span
        aria-hidden="true"
        className="block h-0 w-full"
        data-testid="title-token-suggestions-anchor"
        ref={anchorRef}
      />
      {createPortal(panel, document.body)}
    </>
  );
}

/**
 * #72: a one-line hint so the `#`/`@`/`!` shortcuts are discoverable — nobody
 * finds an inline autocomplete they were never told about.
 *
 * Hidden while a picker is open, because the picker itself is the affordance at
 * that point and two stacked panels under the title is noise.
 */
export function TitleTokenHint({ hidden = false }: { hidden?: boolean }) {
  const { t } = useTranslation();

  /*
   * #72: the line is always reserved, only its text is hidden. Unmounting it
   * shrank the modal the moment the picker opened — the same "modal resizes"
   * complaint, just in the other direction.
   */
  return (
    <p
      aria-hidden={hidden}
      /*
       * #72 (third round): "it takes too much space. make it hug the title
       * more, significantly reduce the line spacing, and text should be
       * smaller and fainter. it's a hint, not an announcement."
       *
       * -mt-2 pulls it up under the title's own padding, leading-none kills
       * the line box, 10px/50% opacity makes it recede.
       */
      /*
       * #72 (round 4): the title <Input> carries py-3, so its box extends well
       * below the glyphs and left a ~32px visual gap. -mt-5 pulls the hint back
       * up through that padding so it sits directly under the typed text.
       */
      /*
       * #72 (round 5): the title input now carries pb-0, so the hint sits
       * directly under the text without a negative pull fighting the padding.
       */
      className={`!mt-1 px-0.5 text-[10px] leading-none text-muted-foreground/50 ${
        hidden ? "invisible" : ""
      }`}
      data-testid={hidden ? "title-token-hint-hidden" : "title-token-hint"}
    >
      {t("tasks:titleTokens.hint")}
    </p>
  );
}

export default TitleTokenSuggestions;
