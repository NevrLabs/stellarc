import { expect, type Page, test } from "@playwright/test";
import { stubOrgShell } from "./fixtures";

/**
 * NEVR-170: the AI chat bubble's transcript renders through the shadcn chat
 * primitives (MessageScroller/Message/Bubble). This spec is additive to the
 * frozen surfaces: stubOrgShell keeps AI disabled there, so the frozen
 * screenshots never contain this panel. Here we re-enable the AI settings
 * route so the panel mounts, and drive a round trip through the fixture
 * responder.
 */

const aiSettings = {
  enabled: true,
  configured: true,
  effectiveTokenLimit: 1000,
  effectiveCharacterLimit: 2000,
};

async function stubAiEnabled(page: Page) {
  await page.route("**/api/ai/organization/fixture-org/settings", (route) =>
    route.fulfill({ json: aiSettings }),
  );
  await page.route("**/api/ai/organization/fixture-org/chat", (route) =>
    route.fulfill({
      json: { message: "Ticket assigned to Ada.", actions: [] },
    }),
  );
}

test("ai chat bubble renders transcript through chat primitives", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await stubOrgShell(page);
  await stubAiEnabled(page);

  await page.goto("/dashboard/organization/foundation");

  await page
    .getByRole("button", { name: "Open organization AI assistant" })
    .click();
  const panel = page.getByTestId("ai-chat-panel");
  await expect(panel).toBeVisible();

  // MessageScroller viewport + log are present (not a plain overflow div).
  await expect(page.getByRole("region", { name: "Messages" })).toBeVisible();
  await expect(page.getByRole("log")).toBeVisible();

  // Round trip: user bubble + assistant bubble, registered as scroller items.
  await page
    .getByLabel("Message organization AI assistant")
    .fill("Assign STL-1 to Ada");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page.getByText("Assign STL-1 to Ada")).toBeVisible();
  await expect(page.getByText("Ticket assigned to Ada.")).toBeVisible();
  await expect(panel.locator("[data-message-id]")).toHaveCount(2);

  // Jump-to-latest from MessageScrollerButton is rendered.
  await expect(
    page.getByRole("button", { name: "Jump to latest message" }),
  ).toBeAttached();

  // The empty-state hint only shows before any traffic.
  await expect(
    page.getByText("Ask about this organization or tell me to assign"),
  ).toHaveCount(0);

  expect(errors).toEqual([]);
});
