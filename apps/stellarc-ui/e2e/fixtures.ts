import type { Page } from "@playwright/test";

// Contracts derived from auth-client.ts, get-config.ts and get-instance-status.ts.
export async function stubSignIn(page: Page) {
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const responses: Record<string, unknown> = {
      "/api/auth/get-session": null,
      "/api/instance/status": { hasUsers: true, hasAdmin: true },
      "/api/config": {
        hasGoogleSignIn: false,
        hasGithubSignIn: false,
        hasDiscordSignIn: false,
        hasCustomOAuth: false,
        customOAuthAutoLogin: false,
        hasGuestAccess: false,
        disableLoginForm: false,
        hasSmtp: false,
        disableEmailOtpSignIn: true,
        disableRegistration: true,
        disablePasswordRegistration: true,
      },
    };
    if (request.method() === "GET" && Object.hasOwn(responses, path)) {
      await route.fulfill({ json: responses[path] });
      return;
    }
    unexpected.push(`${request.method()} ${path}`);
    await route.abort();
  });
  return unexpected;
}
