// NEVR-170 anchored-stream scroll-contract harness.
//
// Real-browser regression harness for the four post-#11465 laws (shadcn-ui/ui
// #11465, vendored at src/vendor/shadcn-react). Cribbed from upstream's
// packages/react/src/message-scroller/message-scroller.browser.test.tsx, but
// mounted through OUR wrapper (src/components/ui/message-scroller.tsx) so the
// plays guard the full lane: the vendored post-fix sources AND the import the
// product actually uses. Served by a throwaway vite dev server that
// message-scroller.spec.ts boots on 127.0.0.1:4183; the spec drives the
// window.__ms API from Playwright.

import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScrollerScrollable,
} from "@/components/ui/message-scroller";

const ITEM_HEIGHT = 80;
const VIEWPORT_HEIGHT = 200;

type TestItem = { height?: number; id: string; scrollAnchor?: boolean };

function Thread({
  autoScroll,
  items,
}: {
  autoScroll?: boolean;
  items: TestItem[];
}) {
  return (
    <MessageScrollerProvider autoScroll={autoScroll}>
      <MessageScroller style={{ width: 320 }}>
        <MessageScrollerViewport
          aria-label="viewport"
          style={{ height: VIEWPORT_HEIGHT, overflowY: "auto" }}
        >
          <MessageScrollerContent>
            {items.map((item) => (
              <MessageScrollerItem
                key={item.id}
                messageId={item.id}
                scrollAnchor={item.scrollAnchor}
                style={{ height: item.height ?? ITEM_HEIGHT, flex: "none" }}
              >
                {item.id}
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton aria-label="Jump to latest message" />
        <ScrollableProbe />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function ScrollableProbe() {
  const scrollable = useMessageScrollerScrollable();

  return (
    <div
      data-end={String(scrollable.end)}
      data-start={String(scrollable.start)}
      data-testid="scrollable"
      style={{ height: 0 }}
    />
  );
}

// Resolve after a few real animation frames so the scroller's rAF-scheduled
// work and ResizeObserver callbacks settle before the spec reads geometry.
function settle(frames = 6) {
  return new Promise<void>((resolve) => {
    let remaining = frames;
    const tick = () =>
      remaining-- <= 0 ? resolve() : requestAnimationFrame(tick);
    requestAnimationFrame(tick);
  });
}

let root: Root | null = null;

function getViewport() {
  return document.querySelector('[aria-label="viewport"]') as HTMLElement;
}

function getSpacer() {
  return document.querySelector(
    "[data-message-scroller-spacer]",
  ) as HTMLElement | null;
}

function snapshot() {
  const viewport = getViewport();
  const spacer = getSpacer();
  const anchorItem = document.querySelector(
    '[data-message-id="new-user"]',
  ) as HTMLElement | null;
  const probe = document.querySelector(
    '[data-testid="scrollable"]',
  ) as HTMLElement | null;

  return {
    distanceToBottom: Math.round(
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
    ),
    end: probe?.getAttribute("data-end") === "true",
    newUserViewportOffset:
      anchorItem === null
        ? null
        : Math.round(
            anchorItem.getBoundingClientRect().top -
              viewport.getBoundingClientRect().top,
          ),
    spacerHeight: spacer ? spacer.getBoundingClientRect().height : 0,
    spacerPresent: spacer !== null,
    spacerVisible: spacer !== null && !spacer.hidden,
    scrollTop: Math.round(viewport.scrollTop),
  };
}

type Snapshot = ReturnType<typeof snapshot>;

async function render(
  autoScroll: boolean,
  items: TestItem[],
): Promise<Snapshot> {
  if (root === null) {
    const container = document.getElementById("root");
    if (container === null) throw new Error("harness root missing");
    root = createRoot(container);
  }
  flushSync(() => {
    root?.render(<Thread autoScroll={autoScroll} items={items} />);
  });
  await settle();
  return snapshot();
}

// A manual scroll releases the anchor: a real wheel event (the controller
// distinguishes user intent from programmatic scrolls by the wheel event),
// then the actual scroll, then a settle for the release bookkeeping.
async function manualScroll(delta: number): Promise<Snapshot> {
  const viewport = getViewport();
  viewport.dispatchEvent(
    new WheelEvent("wheel", { bubbles: true, deltaY: delta }),
  );
  viewport.scrollTop += delta;
  // A real browser fires this natively on the assignment above; dispatch it
  // anyway to match the upstream crib's belt-and-braces sequencing.
  viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
  await settle();
  return snapshot();
}

async function scrollToRealBottom(): Promise<Snapshot> {
  const viewport = getViewport();
  viewport.scrollTop = viewport.scrollHeight;
  await settle();
  return snapshot();
}

function createItems(count: number): TestItem[] {
  return Array.from({ length: count }, (_, index) => ({ id: `m${index}` }));
}

// The driver the Playwright spec calls through page.evaluate. Keep it
// promise-returning and JSON-serializable only.
(globalThis as { __ms?: unknown }).__ms = {
  createItems,
  manualScroll,
  render,
  scrollToRealBottom,
};
