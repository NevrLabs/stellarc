import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// NEVR-223: freeze the agent-transcript patterns rendered from recorded run
// fixtures on the dev-only /agent-transcript-fixtures surface. No API stubs:
// the route renders composed AI elements (trace/code-block/item) from
// src/lib/agent-transcript/fixtures.ts and makes zero network calls.

// The theme store (not the media query) drives <html>'s light/dark class
// (providers/theme-provider), and its persisted default is dark. Pin the
// persisted state so each test freezes the theme it claims to: the zustand
// persist shape is { state, version } under the "user-preferences" key.
const setTheme = (page: Page, theme: "light" | "dark") =>
  page.addInitScript((value) => {
    localStorage.setItem(
      "user-preferences",
      JSON.stringify({ state: { theme: value }, version: 0 }),
    );
  }, theme);

test("agent transcript patterns render from recorded fixtures", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await setTheme(page, "light");
  await page.goto("/agent-transcript-fixtures");
  await expect(page.getByTestId("agent-transcript-fixtures")).toBeVisible();
  // The store, not the media query, drives the class: assert we are really
  // freezing the light palette.
  await expect(page.locator("html")).toHaveClass(/light/);

  const toolCalls = page.getByTestId("fixture-tool-calls");
  // Tool: running line shimmers, completed calls collapse, failures error.
  await expect(
    toolCalls.getByText("Running watch node --version"),
  ).toBeVisible();
  await expect(
    toolCalls.getByText("Ran grep -rn cacheKey scripts"),
  ).toBeVisible();
  await expect(
    toolCalls.getByText("Failed to run pnpm --version"),
  ).toBeVisible();

  // Subagent: running child opens with its nested tool lines + role badge.
  const subagents = page.getByTestId("fixture-subagents");
  await expect(subagents.getByText("Running the research agent")).toBeVisible();
  await expect(
    subagents.getByText(
      "Find out why image optimization reruns on every deploy.",
    ),
  ).toBeVisible();
  await expect(
    subagents.getByRole("button", { name: /ran the test agent/i }),
  ).toBeVisible();

  // Test results: summary line counts the CI rollup; failed suite opens.
  const testResults = page.getByTestId("fixture-test-results");
  await expect(testResults.getByText("Ran 5 tests, 1 failed")).toBeVisible();
  await expect(
    testResults.getByText("payment.test.ts, 2 tests, 1 failed"),
  ).toBeVisible();
  await expect(testResults.getByText("retries a declined card")).toBeVisible();
  // The failing case collapses its error until opened.
  await testResults
    .getByRole("button", { name: "retries a declined card" })
    .click();
  await expect(
    testResults.getByText("Expected 2 charge attempts, received 1"),
  ).toBeVisible();

  // Confirmation: approval question with protocol options.
  const confirmation = page.getByTestId("fixture-confirmation");
  await expect(confirmation.getByText("Run rm -rf dist?")).toBeVisible();
  await expect(
    confirmation.getByRole("button", { name: "Allow once" }),
  ).toBeVisible();
  await expect(
    confirmation.getByRole("button", { name: "Deny" }),
  ).toBeVisible();

  // Sources (NEVR-239): 4 recorded links, one duplicate URL -> 3 unique.
  const sources = page.getByTestId("fixture-sources");
  await expect(sources.getByText("Used 3 sources")).toBeVisible();
  // Collapsed by default; open to reveal the deduped citations.
  await sources.getByRole("button", { name: /used 3 sources/i }).click();
  await expect(
    sources.getByRole("link", {
      name: /nextjs\.org — Image Optimization \(opens in a new tab\)/,
    }),
  ).toBeVisible();
  await expect(
    sources.getByRole("link", { name: /vercel\.com \(opens in a new tab\)/ }),
  ).toBeVisible();
  const duplicate = await sources
    .locator(
      'a[href="https://nextjs.org/docs/app/building-your-application/optimizing/images"]',
    )
    .count();
  expect(duplicate).toBe(1);
  const github = sources.locator(
    'a[href="https://github.com/vercel/next.js/discussions/59073"]',
  );
  await expect(github).toHaveAttribute("target", "_blank");
  await expect(github).toHaveAttribute("rel", "noreferrer");
  await expect(github.getByText("(opens in a new tab)")).toBeAttached();
  // Close again so the frozen screenshot shows the collapsed state.
  await sources.getByRole("button", { name: /used 3 sources/i }).click();

  // Usage (NEVR-243): recorded telemetry from agent_task_usage. Two Usage
  // elements share the section (with-cost and tokens-only), so scope every
  // assertion to its element.
  const usage = page.getByTestId("fixture-usage");
  const usageElements = usage.locator('[data-testid="usage-element"]');
  await expect(usageElements).toHaveCount(2);
  const withCost = usageElements.nth(0);
  const tokensOnly = usageElements.nth(1);
  // With-cost: totals roll-up line above the attempts.
  await expect(withCost.getByTestId("usage-totals")).toHaveText(
    /2 runs · 2,400 tokens/,
  );
  await expect(withCost.getByTestId("usage-totals")).toHaveText(
    /1,700 in \/ 700 out/,
  );
  await expect(withCost.getByTestId("usage-totals")).toHaveText(/0\.42 USD/);
  // One line per attempt: attempt 1 with cost, attempt 2 tokens-only.
  await expect(withCost.getByTestId("usage-attempt-1")).toHaveText(
    /1,000 in \/ 500 out/,
  );
  await expect(withCost.getByTestId("usage-attempt-1")).toHaveText(
    /1,200 \/ 200,000/,
  );
  await expect(withCost.getByTestId("usage-attempt-2")).toHaveText(/—/);
  // The tokens-only element shows the absent marker for cost, never $0.00.
  await expect(tokensOnly.getByTestId("usage-totals")).toHaveText(/—/);
  expect(await tokensOnly.textContent()).not.toContain("0.00");
  expect(await tokensOnly.textContent()).not.toContain("$0");
  // The no-usage case renders nothing at all.
  const empty = usage.getByTestId("fixture-usage-empty");
  await expect(empty).toBeAttached();
  expect(await empty.textContent()).toBe("");

  // Approval card (NEVR-239): sticky prompt for the pending request,
  // folded over the Confirmation question + protocol choices.
  const approval = page.getByTestId("fixture-approval");
  await expect(approval.getByText("Run rm -rf dist?")).toBeVisible();
  await expect(
    approval.getByRole("button", { name: "Allow once" }),
  ).toBeVisible();
  await expect(approval.getByRole("button", { name: "Deny" })).toBeVisible();

  // Chain of thought: summary with steps and badges.
  await expect(
    page
      .getByTestId("fixture-chain-of-thought")
      .getByText("Researched in 3 steps"),
  ).toBeVisible();

  await page.evaluate(() => document.fonts.ready);
  // Acceptance: the surface passes axe in the default (light) theme.
  const light = await new AxeBuilder({ page }).analyze();
  expect(light.violations).toEqual([]);
  await expect(page).toHaveScreenshot("agent-transcript.png");
  expect(errors).toEqual([]);
});

test("agent transcript patterns render in dark theme", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await setTheme(page, "dark");
  await page.goto("/agent-transcript-fixtures");
  await expect(page.getByTestId("agent-transcript-fixtures")).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page
      .getByTestId("fixture-tool-calls")
      .getByText("Ran grep -rn cacheKey scripts"),
  ).toBeVisible();
  // The new part shapes render in dark too: sources summary + approval card.
  await expect(
    page.getByTestId("fixture-sources").getByText("Used 3 sources"),
  ).toBeVisible();
  await expect(
    page.getByTestId("fixture-approval").getByText("Run rm -rf dist?"),
  ).toBeVisible();
  // Usage telemetry renders in dark too: totals + absent-cost em-dash.
  await expect(
    page
      .getByTestId("fixture-usage")
      .locator('[data-testid="usage-element"]')
      .first()
      .getByTestId("usage-totals"),
  ).toHaveText(/2 runs · 2,400 tokens/);
  // The dark palette comes from the registry's CSS variables; the surface
  // must paint its background, not the default white.
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(bg).not.toBe("rgb(255, 255, 255)");
  // Scroll the approval card into view before capturing: the sticky card
  // pins to the viewport bottom, and the frozen dark baseline should cover
  // the new surfaces, not only the top of the page.
  await page.getByTestId("fixture-approval").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  // Acceptance: dark-theme defaults inherited from the registry pass axe.
  const dark = await new AxeBuilder({ page }).analyze();
  expect(dark.violations).toEqual([]);
  await expect(page).toHaveScreenshot("agent-transcript-dark.png");
  expect(errors).toEqual([]);
});
