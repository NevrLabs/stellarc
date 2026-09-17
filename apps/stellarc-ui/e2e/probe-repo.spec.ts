import { expect, test } from "@playwright/test";
import { stubOrgShell } from "./fixtures";

test("probe repo list renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const unexpected = await stubOrgShell(page);
  await page.goto("/dashboard/organization/foundation/repo");
  await page.waitForTimeout(3000);
  console.log("STACK:", await page.locator("body").innerHTML().then(h => h.length));
  console.log("BODY-TEXT:", (await page.locator("body").innerText()).slice(0, 600));
  console.log("ERRORS:", JSON.stringify(errors));
  console.log("UNEXPECTED:", JSON.stringify(unexpected));
});
