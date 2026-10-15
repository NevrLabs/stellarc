import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// NEVR-223: freeze the agent-transcript patterns rendered from recorded run
// fixtures on the dev-only /agent-transcript-fixtures surface. No API stubs:
// the route renders composed AI elements (trace/code-block/item) from
// src/lib/agent-transcript/fixtures.ts and makes zero network calls.

test("agent transcript patterns render from recorded fixtures", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/agent-transcript-fixtures");
  await expect(page.getByTestId("agent-transcript-fixtures")).toBeVisible();

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
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/agent-transcript-fixtures");
  await expect(page.getByTestId("agent-transcript-fixtures")).toBeVisible();
  await expect(
    page
      .getByTestId("fixture-tool-calls")
      .getByText("Ran git status")
      .or(
        page
          .getByTestId("fixture-tool-calls")
          .getByText("Failed to run pnpm --version"),
      )
      .first(),
  ).toBeVisible();
  // The dark palette comes from the registry's CSS variables; the surface
  // must paint its background, not the default white.
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(bg).not.toBe("rgb(255, 255, 255)");
  await page.evaluate(() => document.fonts.ready);
  // Acceptance: dark-theme defaults inherited from the registry pass axe.
  const dark = await new AxeBuilder({ page }).analyze();
  expect(dark.violations).toEqual([]);
  await expect(page).toHaveScreenshot("agent-transcript-dark.png");
  expect(errors).toEqual([]);
});
