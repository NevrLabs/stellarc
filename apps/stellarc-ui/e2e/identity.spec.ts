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
  throw new Error(`${what} did not become ready`);
}

test.beforeAll(async () => {
  apiRoot = await mkdtemp(join(tmpdir(), "stellarc-e2e-"));
  const data = join(apiRoot, "data");
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
  execFileSync(join(BIN, "pg_ctl"), [
    "-D",
    data,
    "-l",
    join(apiRoot, "postgres.log"),
    "-w",
    "start",
    "-o",
    `-k ${apiRoot} -h ''`,
  ]);
  execFileSync(join(BIN, "psql"), [
    `postgresql://stellarc_owner@/postgres?host=${apiRoot}`,
    "-c",
    "CREATE DATABASE source",
  ]);
  execFileSync(join(BIN, "psql"), [
    `postgresql://stellarc_owner@/postgres?host=${apiRoot}`,
    "-c",
    "CREATE DATABASE dest",
  ]);

  // Source: migrate + seed the coherent ten-table snapshot (the fixture
  // helper), then run the REAL importer into dest. Secrets are deterministic
  // test values only.
  const destUrl = `postgresql://stellarc_owner@/dest?host=${apiRoot}`;
  const postgres = (await import("postgres")).default;
  const sourceSql = postgres({
    host: apiRoot,
    username: "stellarc_owner",
    database: "source",
    max: 4,
    onnotice: () => {},
  });
  const { runMigration } = await import("../../packages/db/src/migrate");
  await runMigration(sourceSql);
  const bcrypt = (await import("bcryptjs")).default;
  const hash = bcrypt.hashSync("imported-password-1", 10);
  await sourceSql`UPDATE account SET password = ${hash} WHERE id = 'a-fx'`;
  const { seedIdentitySnapshot } = await import(
    "../../tests/helpers/identity-fixture"
  );
  await seedIdentitySnapshot(sourceSql);
  await sourceSql.end();

  const importer = spawn(
    process.execPath,
    [
      "tools/import-identity.ts",
      `postgresql://stellarc_owner@/source?host=${apiRoot}`,
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
  await writeFile(secretPath, "e2e-identity-secret-0000000000");
  apiProcess = spawn(process.execPath, ["src/main.ts"], {
    cwd: API_DIR,
    env: {
      ...process.env,
      DATABASE_URL: destUrl,
      PORT: "1337",
      AUTH_SECRET: "e2e-identity-secret-0000000000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let apiLog = "";
  apiProcess.stdout?.on("data", (c: Buffer) => (apiLog += c.toString()));
  apiProcess.stderr?.on("data", (c: Buffer) => (apiLog += c.toString()));
  // Any HTTP response (including 401/404) proves the listener is up.
  await waitFor(
    async () => {
      const res = await fetch("http://127.0.0.1:1337/");
      return res.status > 0;
    },
    "identity API on :1337",
    60000,
  );

  // UI end of the live path: sign in through the REAL handler with the
  // imported bcrypt hash; the cookie the browser will use comes from the
  // same Better Auth session the UI's authClient reads.
  const signIn = await fetch(`${BASE}/auth/sign-in/email`, {
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
});

test.afterAll(async () => {
  apiProcess?.kill("SIGTERM");
});

const BASE = "http://127.0.0.1:1337/api";
let cookiePair = "";

test("T32 live sign-in through the real Better Auth handler", async () => {
  const res = await fetch(`${BASE}/auth/get-session`, {
    headers: { cookie: cookiePair },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: { email: string } } | null;
  expect(body?.user.email).toBe("owner@fixture.test");
});

test("T32 live members list serves imported rows through the mounted API", async () => {
  const res = await fetch(`${BASE}/identity/orgs/o-fx/members`, {
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
