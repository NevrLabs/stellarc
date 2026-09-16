import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// STL-15 §6/T32: Members renders LIVE against the real identity API —
// disposable PostgreSQL + imported fixture (the import path itself is the
// domain's T23/T24-covered maintenance path) + the real Better Auth handler
// + the built UI bundle served by playwright's webServer. No request
// interception here: intercepting identity requests invalidates the result
// (§6). Frozen surfaces (frozen.spec.ts) keep their stub harness.
//
// Playwright's webServer boots the preview server before tests run
// (strictPort, reuseExistingServer: false), so the API and database are
// started here, in the file's beforeAll.

const ROOT = process.cwd();
const API_DIR = join(ROOT, "apps/stellarc-api");
const BIN = process.env.PG_BIN ?? "/usr/lib/postgresql/15/bin";

let apiProcess: ReturnType<typeof spawn> | null = null;
let apiRoot = "";
let pgData = "";
let PG_PORT = 15433;
let apiLog = "";
let API_PORT = 13370;
let API_BASE = "http://127.0.0.1:13370";

async function freePort(): Promise<number> {
  // Node-compatible: bind :0, read the assigned port, release.
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error("no port"))));
    });
  });
}

async function waitFor(fn: () => Promise<boolean>, what: string, ms: number) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if (await fn()) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `${what} did not become ready\n--- api log ---\n${apiLog.slice(-1500)}`,
  );
}

test.beforeAll(async () => {
  // Hooks take the per-test timeout; raise it for the DB+API bootstrap.
  test.setTimeout(300000);
  apiRoot = await mkdtemp(join(tmpdir(), "stellarc-e2e-"));
  const data = join(apiRoot, "data");
  pgData = data;
  execFileSync(join(BIN, "initdb"), [
    "-D",
    data,
    "-A",
    "trust",
    "--no-locale",
    "--no-sync",
    "-U",
    "stellarc_owner",
  ]);
  // TCP on a loopback port (trust): the Effect PgClient resolves hosts
  // explicitly and does not honour unix-socket directory URLs, so the
  // disposable cluster listens on 127.0.0.1 on a free, dynamically chosen
  // port (bind-then-close probe).
  PG_PORT = await freePort();
  execFileSync(join(BIN, "pg_ctl"), [
    "-D",
    data,
    "-l",
    join(apiRoot, "postgres.log"),
    "-w",
    "start",
    "-o",
    `-h 127.0.0.1 -p ${PG_PORT} -k ${apiRoot}`,
  ]);
  execFileSync(join(BIN, "psql"), [
    `postgresql://stellarc_owner@127.0.0.1:${PG_PORT}/postgres`,
    "-c",
    "CREATE DATABASE source",
  ]);
  execFileSync(join(BIN, "psql"), [
    `postgresql://stellarc_owner@127.0.0.1:${PG_PORT}/postgres`,
    "-c",
    "CREATE DATABASE dest",
  ]);

  // Source: migrate + seed the coherent ten-table snapshot (the fixture
  // helper), then run the REAL importer into dest. Secrets are deterministic
  // test values only.
  const destUrl = `postgresql://stellarc_owner@127.0.0.1:${PG_PORT}/dest`;
  const postgres = (await import("postgres")).default;
  const sourceSql = postgres({
    host: "127.0.0.1",
    port: PG_PORT,
    username: "stellarc_owner",
    database: "source",
    max: 4,
    onnotice: () => {},
  });
  const { runMigration } = await import("../../../packages/db/src/migrate");
  await runMigration(sourceSql);
  const { seedIdentitySnapshot } = await import(
    "../../../tests/helpers/identity-fixture"
  );
  await seedIdentitySnapshot(sourceSql);
  // Known-answer password for the sign-in leg: overwrite AFTER seeding (the
  // helper inserts its own legacy hash) so the real handler verifies a hash
  // we minted with the same bcrypt the runtime uses.
  const bcrypt = (await import("bcryptjs")).default;
  const hash = bcrypt.hashSync("imported-password-1", 10);
  await sourceSql`UPDATE account SET password = ${hash} WHERE id = 'a-fx'`;
  await sourceSql.end();

  // Destination: same migration set — the importer writes the ledger,
  // counters and projection events there (mirrors the T23/T24 harness).
  const destSql = postgres({
    host: "127.0.0.1",
    port: PG_PORT,
    username: "stellarc_owner",
    database: "dest",
    max: 4,
    onnotice: () => {},
  });
  await runMigration(destSql);
  await destSql.end();

  const bunBin = process.env.BUN_BIN ?? "bun";
  const importer = spawn(
    bunBin,
    [
      "tools/import-identity.ts",
      `postgresql://stellarc_owner@127.0.0.1:${PG_PORT}/source`,
      destUrl,
      "e2e-identity-fixture",
    ],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  await new Promise<void>((resolve, reject) => {
    let out = "";
    importer.stdout.on("data", (c: Buffer) => (out += c.toString()));
    importer.stderr.on("data", (c: Buffer) => (out += c.toString()));
    importer.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`importer failed (${code}): ${out}`)),
    );
  });

  // API: real main.ts against the imported destination on the port the UI
  // proxies to. Empty runtime session table — no cookie bypass.
  const secretPath = join(apiRoot, "auth-secret");
  await writeFile(secretPath, "e2e-identity-secret-0000000000000000");
  // The host's dev API owns :1337 — never bind over it. The UI
  // bundle is built with VITE_API_URL pointing at this free port instead;
  // IDENTITY_CORS_ORIGIN/PUBLIC_ORIGIN allow the preview origin's cookies.
  API_PORT = 13370; // must match the baked VITE_API_URL
  API_BASE = `http://127.0.0.1:${API_PORT}`;
  apiProcess = spawn(bunBin, ["src/main.ts"], {
    cwd: API_DIR,
    env: {
      ...process.env,
      DATABASE_URL: destUrl,
      PORT: String(API_PORT),
      AUTH_SECRET: "e2e-identity-secret-0000000000000000",
      PUBLIC_ORIGIN: "http://127.0.0.1:4173",
      IDENTITY_CORS_ORIGIN: "http://127.0.0.1:4173",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  apiLog = "";
  apiProcess.stdout?.on("data", (c: Buffer) => (apiLog += c.toString()));
  apiProcess.stderr?.on("data", (c: Buffer) => (apiLog += c.toString()));
  // Any HTTP response (including 401/404) proves the listener is up.
  await waitFor(
    async () => {
      const res = await fetch(`${API_BASE}/`);
      return res.status > 0;
    },
    "identity API ready",
    60000,
  );

  // UI end of the live path: sign in through the REAL handler with the
  // imported bcrypt hash; the cookie the browser will use comes from the
  // same Better Auth session the UI's authClient reads.
  const signIn = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "owner@fixture.test",
      password: "imported-password-1",
    }),
  });
  if (!signIn.ok) {
    throw new Error(`live sign-in failed (${signIn.status}): ${apiLog}`);
  }
  const setCookie = signIn.headers.get("set-cookie") ?? "";
  cookiePair = setCookie.split(";")[0];
  if (!cookiePair) throw new Error(`no session cookie: ${apiLog}`);

  // Establish the active organization server-side (§3 POST /active-org) so
  // the browser session lands on the fixture org.
  await fetch(`${API_BASE}/api/identity/active-org`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookiePair },
    body: JSON.stringify({ organizationId: "o-fx" }),
  });
});

test.afterAll(async () => {
  apiProcess?.kill("SIGTERM");
  if (pgData) {
    try {
      execFileSync(join(BIN, "pg_ctl"), ["-D", pgData, "stop", "-m", "fast"], {
        stdio: "ignore",
      });
    } catch {
      // already gone
    }
  }
});

let cookiePair = "";
const identityFetch = (path: string, init?: RequestInit) =>
  fetch(`${API_BASE}/api${path}`, init);

test("T32 live sign-in through the real Better Auth handler", async () => {
  const res = await fetch(`${API_BASE}/api/auth/get-session`, {
    headers: { cookie: cookiePair },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: { email: string } } | null;
  expect(body?.user.email).toBe("owner@fixture.test");
});

test("T32 live members list serves imported rows through the mounted API", async () => {
  const res = await identityFetch("/identity/orgs/o-fx/members", {
    headers: { cookie: cookiePair },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    members: Array<{ user: { email: string }; role: string }>;
  };
  expect(body.members.some((m) => m.user.email === "owner@fixture.test")).toBe(
    true,
  );
  expect(body.members.some((m) => m.role === "owner")).toBe(true);
});

// §6/T32 promoted screens: Members/Teams/Roles/Keys render LIVE (imported
// fixture through the real handler + built UI). Deterministic clock, fonts
// awaited; baselines captured per viewport for reviewer diffing.
const SCREENS: Array<[string, string]> = [
  ["/dashboard/organization/fixture-org/members", "members"],
  ["/dashboard/organization/fixture-org/members?tab=teams", "teams"],
  ["/dashboard/settings/organization/roles", "roles"],
  ["/dashboard/settings/account/developer", "developer"],
];

for (const [path, screen] of SCREENS) {
  test(`T32 live ${screen} screen matches the fork baseline`, async ({
    page,
  }) => {
    const [name, ...rest] = cookiePair.split("=");
    await page.context().addCookies([
      {
        name,
        value: rest.join("="),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.clock.setFixedTime(new Date("2026-01-02T12:00:00.000Z"));
    await page.goto(path, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Let react-query settle: remaining inflight refetches mutate the DOM.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    // Live-content proof: the imported fixture user must be rendered by the
    // frozen Members surface reading its real data source (blank shells fail).
    if (screen === "members") {
      // Live-content proof: the imported fixture user must be rendered by
      // the frozen Members surface reading its real data source.
      await expect(
        page.getByText("Fixture Owner", { exact: false }).first(),
      ).toBeVisible();
    }
    await expect(page).toHaveScreenshot(`${screen}.png`);
  });
}
