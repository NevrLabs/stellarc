// NEVR-170: anchored-stream scroll contract (post-#11465 laws).
//
// Four named regression plays, one per law from the Amended 2026-11-02 brief,
// cribbed from upstream's packages/react/src/message-scroller/
// message-scroller.browser.test.tsx (#11465) but driving OUR wrapper layer
// (src/components/ui/message-scroller.tsx → src/vendor/shadcn-react/*) in a
// real Chromium. A throwaway vite dev server on 127.0.0.1:4183 serves the
// harness page (e2e/harness/message-scroller.html) so the plays exercise the
// exact sources the product imports, with no product-bundle pollution and no
// app-shell plumbing. This spec is additive to the frozen surfaces: it never
// loads an app route, so frozen screenshots are untouched.
//
// Calibrated geometry (Chromium, 6×80px items, 200px viewport, 64px reading
// line): placing the anchored turn lands at scrollTop 416 with the reader's
// viewport bottom exactly at the end of the 36px reserved spacer. A release
// gesture that leaves the reader above the reply bottom (overlap ≤ 0) freezes
// the spacer; a release into the room (overlap > 0) drains it to zero and
// hands off to following at the real bottom. Manual scrolls below use ±50
// (freeze) and +20 (drain) accordingly.
import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const HARNESS_PORT = 4183;
const HARNESS_URL = `http://127.0.0.1:${HARNESS_PORT}/e2e/harness/message-scroller.html`;
const APP_DIR = fileURLToPath(new URL("..", import.meta.url));

type Snapshot = {
  distanceToBottom: number;
  end: boolean;
  newUserViewportOffset: number | null;
  spacerHeight: number;
  spacerPresent: boolean;
  spacerVisible: boolean;
  scrollTop: number;
};

type Driver = {
  createItems: (count: number) => Array<{ id: string }>;
  manualScroll: (delta: number) => Promise<Snapshot>;
  render: (autoScroll: boolean, items: unknown[]) => Promise<Snapshot>;
  scrollToRealBottom: () => Promise<Snapshot>;
};

let server: ChildProcess | null = null;

// Cold vite dev-server startup + first module transform on CI/NFS can exceed
// the default 30s hook timeout; test.setTimeout also governs the beforeAll
// hook timeout (Playwright 1.62 has no per-hook timeout argument).
test.setTimeout(150_000);

test.beforeAll(async () => {
  test.setTimeout(150_000);
  server = spawn(
    "bun",
    [
      "run",
      "vite",
      "--port",
      String(HARNESS_PORT),
      "--strictPort",
      "--host",
      "127.0.0.1",
    ],
    { cwd: APP_DIR, stdio: "pipe" },
  );
  server.on("error", (error) => {
    throw new Error(`vite dev server failed to spawn: ${error.message}`);
  });

  // Cold vite startup on CI's runner can take tens of seconds; poll readiness
  // instead of relying on a fixed delay.
  const deadline = Date.now() + 120_000;
  let lastError = "";
  for (;;) {
    try {
      const response = await fetch(HARNESS_URL, { redirect: "manual" });
      if (response.status === 200) break;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() > deadline) {
      throw new Error(`vite dev server not ready in time (${lastError})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
});

test.afterAll(async () => {
  server?.kill("SIGTERM");
  server = null;
});

async function drive<T>(page: Page, name: keyof Driver, ...args: unknown[]) {
  return page.evaluate(
    ([driverName, driverArgs]) => {
      const driver = (globalThis as { __ms?: Driver }).__ms;
      if (!driver) throw new Error("harness driver not mounted");
      const fn = driver[driverName];
      if (typeof fn !== "function") {
        throw new Error(`unknown driver fn ${driverName}`);
      }
      return fn(...driverArgs);
    },
    [name, args] as const,
  ) as Promise<T>;
}

// The shared opening of every play: six 80px items pinned to the bottom, then
// an anchored turn (user message + a 20px reply start) placed at the reading
// line with the tail spacer reserved below it. Returns the placed snapshot —
// sampling must never ride on a manual scroll, which is itself a release
// gesture.
async function placeAnchoredTurn(page: Page, replyHeight = 20) {
  const six = await drive<Array<{ id: string }>>(page, "createItems", 6);
  await drive<Snapshot>(page, "render", true, six);
  return drive<Snapshot>(page, "render", true, [
    ...six,
    { id: "new-user", scrollAnchor: true },
    { id: "new-assistant", height: replyHeight },
  ]);
}

async function growReply(
  page: Page,
  six: Array<{ id: string }>,
  replyHeight: number,
) {
  return drive<Snapshot>(page, "render", true, [
    ...six,
    { id: "new-user", scrollAnchor: true },
    { id: "new-assistant", height: replyHeight },
  ]);
}

test("law 1: a manual scroll during an anchored streaming turn releases the anchor and holds the reader's position", async ({
  page,
}) => {
  await page.goto(HARNESS_URL);
  const six = await drive<Array<{ id: string }>>(page, "createItems", 6);
  const atBottom = await drive<Snapshot>(page, "render", true, six);
  expect(atBottom.distanceToBottom).toBeLessThanOrEqual(1);

  const placed = await placeAnchoredTurn(page);
  expect(placed.newUserViewportOffset).not.toBeNull();
  expect(placed.newUserViewportOffset as number).toBeLessThanOrEqual(65);
  expect(placed.spacerVisible).toBe(true);

  // The reader scrolls up, clear of the reply bottom, while the reply
  // streams. The wheel gesture releases the anchor; the reader keeps their
  // position and the reserved spacer stays intact below the reply.
  const released = await drive<Snapshot>(page, "manualScroll", -50);
  expect(released.newUserViewportOffset).toBe(
    (placed.newUserViewportOffset as number) + 50,
  );
  expect(released.spacerVisible).toBe(true);
  expect(released.distanceToBottom).toBeGreaterThan(1);

  // The reply streams a second chunk below the released reader (a real
  // append, not a resize: the childList commit is the pre-fix yank path).
  // Nothing may re-arm follow for them: the pre-fix controller re-armed on
  // this very commit (end read false, no spacer gate) and yanked the reader
  // to the live edge.
  const grown = await drive<Snapshot>(page, "render", true, [
    ...six,
    { id: "new-user", scrollAnchor: true },
    { id: "new-assistant", height: 20 },
    { id: "new-assistant-2", height: 240 },
  ]);
  expect(grown.scrollTop).toBe(released.scrollTop);
  expect(grown.newUserViewportOffset).toBe(released.newUserViewportOffset);
  expect(grown.distanceToBottom).toBeGreaterThan(1);
});

test("law 2: the reserved tail spacer drains when the anchor releases - no yank, no stranded space", async ({
  page,
}) => {
  await page.goto(HARNESS_URL);
  const six = await drive<Array<{ id: string }>>(page, "createItems", 6);
  await drive<Snapshot>(page, "render", true, six);
  const placed = await placeAnchoredTurn(page);
  expect(placed.spacerVisible).toBe(true);

  // The reader scrolls up, clear of the reply: the anchor releases and the
  // spacer freezes below the reply (the reader wanted to read, not follow).
  const released = await drive<Snapshot>(page, "manualScroll", -50);
  expect(released.scrollTop).toBe(placed.scrollTop - 50);
  expect(released.spacerVisible).toBe(true);

  // The reply grows far below the released reader without moving them.
  const grown = await growReply(page, six, 260);
  expect(grown.scrollTop).toBe(released.scrollTop);
  expect(grown.spacerVisible).toBe(true);

  // Returning to the live edge drains the reserved room - the pre-fix code
  // had no drain and left the spacer standing at the bottom as dead space
  // below the reply (the autoScroll-off failure).
  const atBottom = await drive<Snapshot>(page, "scrollToRealBottom");
  expect(atBottom.spacerVisible).toBe(false);
  expect(atBottom.distanceToBottom).toBeLessThanOrEqual(1);

  // With the room reclaimed and following re-engaged, the rest of the stream
  // tracks the live edge.
  const pinned = await growReply(page, six, 400);
  expect(pinned.distanceToBottom).toBeLessThanOrEqual(1);
});

test("law 3: a reader inside the spacer zone is not at the end and must not re-arm follow", async ({
  page,
}) => {
  await page.goto(HARNESS_URL);
  const six = await drive<Array<{ id: string }>>(page, "createItems", 6);
  await drive<Snapshot>(page, "render", true, six);
  const placed = await placeAnchoredTurn(page);

  // The freshly anchored reader sits inside the reserved room: the raw
  // geometry reports distance-to-bottom 0 only because the spacer pads the
  // scroll height, yet `end` reads false - "at the end" is measured against
  // the content bottom including the spacer zone.
  expect(placed.distanceToBottom).toBeLessThanOrEqual(1);
  expect(placed.end).toBe(false);

  // A streamed chunk arrives while the reader is inside the room. The anchor
  // hold consumes the spacer by exactly the chunk's growth - no collapse, no
  // re-arm, the reading line does not move.
  const grown40 = await growReply(page, six, 40);
  expect(grown40.scrollTop).toBe(placed.scrollTop);
  expect(grown40.newUserViewportOffset).toBe(placed.newUserViewportOffset);
  expect(grown40.spacerVisible).toBe(true);
  expect(grown40.spacerHeight).toBeLessThan(placed.spacerHeight);
  expect(grown40.end).toBe(false);

  // The last of the room is consumed only when the reply fills the viewport:
  // the hand-off to the live edge happens exactly then, not before.
  const grown60 = await growReply(page, six, 60);
  expect(grown60.spacerVisible).toBe(false);
  expect(grown60.distanceToBottom).toBeLessThanOrEqual(1);
});

test("law 4: follow re-arms at the true bottom and stays pinned for the rest of the stream", async ({
  page,
}) => {
  await page.goto(HARNESS_URL);
  const six = await drive<Array<{ id: string }>>(page, "createItems", 6);
  await drive<Snapshot>(page, "render", true, six);
  await placeAnchoredTurn(page);

  // Release into the room, then return to the live edge: the drain finishes
  // and following re-arms.
  // Release into the room: the drain reclaims it in the same gesture and
  // the reader lands at the live edge, not stranded mid-room.
  const released = await drive<Snapshot>(page, "manualScroll", 20);
  expect(released.spacerVisible).toBe(false);
  expect(released.distanceToBottom).toBeLessThanOrEqual(1);
  const atBottom = await drive<Snapshot>(page, "scrollToRealBottom");
  expect(atBottom.distanceToBottom).toBeLessThanOrEqual(1);

  // The stream continues; following stays engaged and keeps the live edge
  // pinned for the rest of the reply.
  const pinned = await growReply(page, six, 400);
  expect(pinned.distanceToBottom).toBeLessThanOrEqual(1);
});
