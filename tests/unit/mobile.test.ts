import { spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

const ROOT = process.cwd();
const FLOWS = [
  "mobile-sign-in.yaml",
  "mobile-sheet-nav.yaml",
  "mobile-board.yaml",
  "mobile-ticket-nav.yaml",
] as const;
const APP_ID = "dev.stellarc.mobile";

interface TauriConf {
  identifier: string;
  version?: string;
  build?: { frontendDist?: string };
  bundle?: { targets?: string[] };
  app?: { withGlobalTauri?: boolean; security?: { csp: string | null } };
}

function readTauriConf(shell: "desktop" | "mobile"): TauriConf {
  return JSON.parse(
    readFileSync(join(ROOT, shell, "tauri.conf.json"), "utf8"),
  ) as TauriConf;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// M01 - Shell config exactness (spec SS7 M01).
test("M01 mobile shell config is exact: identifier, apk target, frozen frontendDist, withGlobalTauri false, CSP = desktop", () => {
  const conf = readTauriConf("mobile");
  expect(conf.identifier).toBe(APP_ID);
  // APK (Android debug) is the only real bundle target; the iOS .app is
  // produced by `tauri ios build`, never a bundle target.
  expect(conf.bundle?.targets).toEqual(["apk"]);
  expect(conf.build?.frontendDist).toBe("../apps/stellarc-ui/dist");
  expect(conf.app?.withGlobalTauri).toBe(false);
  const csp = conf.app?.security?.csp;
  expect(csp, "csp must be non-null (v1 shipped csp: null)").not.toBeNull();
  // Real CSP identical to the desktop shell's: the mobile shell must not
  // open a second security posture against the same frozen bundle.
  expect(csp).toBe(readTauriConf("desktop").app?.security?.csp ?? null);
});

// M02 - UI-tree purity: nothing under apps/stellarc-ui/, packages/, or
// desktop/ may change (spec SS5 MODIFY note: enforced by M02).
test("M02 mobile slice leaves the frozen UI tree and the desktop shell untouched", () => {
  let mb = spawnSync("git", ["merge-base", "origin/dev", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (mb.status !== 0) {
    const fetch = spawnSync(
      "git",
      ["fetch", "--deepen=100", "origin", "dev:refs/remotes/origin/dev"],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(
      fetch.status,
      `origin/dev absent (depth-1 checkout) and git fetch origin dev failed: ${fetch.stderr}`,
    ).toBe(0);
    mb = spawnSync("git", ["merge-base", "origin/dev", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    });
  }
  expect(mb.status, mb.stderr).toBe(0);
  const result = spawnSync(
    "git",
    [
      "diff",
      "--name-only",
      mb.stdout.trim(),
      "--",
      "apps/stellarc-ui",
      "packages",
      "desktop",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  const changed = result.stdout
    .split("\n")
    .filter((line) => line.trim().length > 0);
  expect(changed, "frozen UI tree or desktop shell modified").toEqual([]);
});

function makeMobileSandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "stellarc-mobile-build-"));
  const mobile = join(root, "mobile");
  const scripts = join(mobile, "scripts");
  mkdirSync(join(root, "apps/stellarc-ui"), { recursive: true });
  mkdirSync(scripts, { recursive: true });
  writeFileSync(
    join(scripts, "build-ui.sh"),
    readFileSync(join(ROOT, "mobile/scripts/build-ui.sh"), "utf8"),
  );
  chmodSync(join(scripts, "build-ui.sh"), 0o755);
  writeFileSync(
    join(mobile, "tauri.conf.json"),
    JSON.stringify({
      identifier: APP_ID,
      version: "0.1.0",
      app: {
        security: {
          csp: "default-src 'self'; connect-src 'self' __STELLARC_API_ORIGIN__; img-src 'self' __STELLARC_IMG_ORIGIN__ data:; style-src 'self' 'unsafe-inline'",
        },
      },
    }),
  );
  // Stub `bun` so `bun run build` simulates the frozen Vite build baking
  // VITE_API_URL into the emitted bundle.
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "bun"),
    `#!/usr/bin/env bash
mkdir -p dist
echo "$VITE_API_URL" > dist/index.js
`,
  );
  chmodSync(join(bin, "bun"), 0o755);
  return root;
}

function runBuildUi(root: string, apiUrl: string | undefined) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}`,
  };
  if (apiUrl === undefined) {
    delete env.MOBILE_API_URL;
  } else {
    env.MOBILE_API_URL = apiUrl;
  }
  return spawnSync("bash", [join(root, "mobile/scripts/build-ui.sh")], {
    cwd: root,
    encoding: "utf8",
    env,
  });
}

// M03 - Build baking (spec SS7 M03).
test("M03 build-ui.sh bakes MOBILE_API_URL into a manifest, never the localhost fallback", () => {
  const script = join(ROOT, "mobile/scripts/build-ui.sh");
  expect(existsSync(script), "build-ui.sh missing").toBe(true);
  expect(isExecutable(script), "build-ui.sh not executable").toBe(true);

  const root = makeMobileSandbox();
  try {
    const result = runBuildUi(root, "https://api.example.com");
    expect(result.status, result.stderr).toBe(0);

    const manifest = JSON.parse(
      readFileSync(
        join(root, "apps/stellarc-ui/dist/stellarc-mobile-manifest.json"),
        "utf8",
      ),
    ) as { vite_api_url: string; ws_url: string };
    expect(manifest.vite_api_url).toBe("https://api.example.com");
    expect(manifest.ws_url).toBe("wss://api.example.com");
    expect(JSON.stringify(manifest)).not.toContain("localhost:1337");

    const bundle = readFileSync(
      join(root, "apps/stellarc-ui/dist/index.js"),
      "utf8",
    );
    expect(bundle).toContain("https://api.example.com");
    expect(bundle).not.toContain("localhost:1337");

    // The CSP placeholder resolves into the BUILD-TIME copy only.
    const resolved = readFileSync(
      join(root, "mobile/target/tauri.conf.build.json"),
      "utf8",
    );
    expect(resolved).toContain("https://api.example.com");
    expect(resolved).toContain("wss://api.example.com");
    expect(resolved).not.toContain("__STELLARC_API_ORIGIN__");
    const source = readFileSync(join(root, "mobile/tauri.conf.json"), "utf8");
    expect(source).toContain("__STELLARC_API_ORIGIN__");
    expect(source).not.toContain("api.example.com");

    // Sabotage guard: the script must fail closed when the env is unset
    // (M03 sabotage: "unset the env in the script").
    const noEnv = runBuildUi(root, undefined);
    expect(noEnv.status, "build-ui.sh must require MOBILE_API_URL").not.toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("M03b build-ui.sh is idempotent: a second run with a new origin re-resolves", () => {
  const root = makeMobileSandbox();
  try {
    expect(runBuildUi(root, "https://api-one.example.com").status).toBe(0);
    expect(runBuildUi(root, "https://api-two.example.com").status).toBe(0);
    const resolved = readFileSync(
      join(root, "mobile/target/tauri.conf.build.json"),
      "utf8",
    );
    expect(resolved).toContain("https://api-two.example.com");
    expect(resolved).not.toContain("api-one.example.com");
    expect(resolved).not.toContain("__STELLARC_API_ORIGIN__");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

// M05 - Generated projects committed and consistent (spec SS7 M05).
test("M05 gen projects committed: android + ios present, ids = dev.stellarc.mobile, versions match conf", () => {
  const android = join(ROOT, "mobile/gen/android");
  const ios = join(ROOT, "mobile/gen/ios");
  expect(existsSync(android), "mobile/gen/android missing").toBe(true);
  expect(existsSync(ios), "mobile/gen/ios missing").toBe(true);

  const conf = readTauriConf("mobile");
  expect(conf.version).toBe("0.1.0");

  for (const [label, dir] of [
    ["android", android],
    ["ios", ios],
  ] as const) {
    const files = walk(dir).filter((f) =>
      /\.(kt|kts|gradle|xml|plist|pbxproj|yml|yaml|swift|entitlements)$/.test(
        f,
      ),
    );
    expect(
      files.length,
      `${label} gen project has no readable sources`,
    ).toBeGreaterThan(0);
    const idLines: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/dev\.stellarc\.[a-z]+/g)) {
        idLines.push(match[0]);
      }
    }
    expect(idLines.length, `${label} gen carries no bundle id`).toBeGreaterThan(
      0,
    );
    // Every declared id is exactly the mobile id (sabotage: change one gen
    // file's id and this set loses its invariant).
    expect(
      new Set(idLines),
      `${label} gen declares a foreign bundle id`,
    ).toEqual(new Set([APP_ID]));
  }
});

// M09 - Maestro flows parse (spec SS7 M09): required steps per flow,
// asserted device-free.
test("M09 all four Maestro flows are native (appId, no url) with required steps", () => {
  for (const flow of FLOWS) {
    const text = readFileSync(
      join(ROOT, "mobile/e2e/maestro/flows", flow),
      "utf8",
    );
    // Native, not web-mode: appId present, url absent (premise-audit 1).
    expect(text, `${flow}: appId missing`).toContain(`appId: ${APP_ID}`);
    expect(text, `${flow}: web-mode url leaked in`).not.toMatch(/^url:/m);
    // Required steps: launchApp, >=1 extendedWaitUntil, >=1 tapOn,
    // >=1 takeScreenshot, in order.
    const launch = text.indexOf("- launchApp");
    const wait = text.indexOf("- extendedWaitUntil");
    const tap = text.indexOf("- tapOn");
    const shot = text.indexOf("- takeScreenshot");
    expect(launch, `${flow}: missing launchApp`).toBeGreaterThanOrEqual(0);
    expect(wait, `${flow}: missing extendedWaitUntil`).toBeGreaterThanOrEqual(
      0,
    );
    expect(tap, `${flow}: missing tapOn`).toBeGreaterThanOrEqual(0);
    expect(shot, `${flow}: missing takeScreenshot`).toBeGreaterThanOrEqual(0);
    expect(launch, `${flow}: launchApp must come first`).toBeLessThan(wait);
    expect(wait, `${flow}: wait must precede screenshot`).toBeLessThan(shot);
  }
  const config = readFileSync(
    join(ROOT, "mobile/e2e/maestro/config.mobile.yaml"),
    "utf8",
  );
  expect(config).toContain("testOutputDir");
});

interface Landmark {
  id: string;
  surface: string;
  playwrightSelector: string;
  maestroSelector: string;
}

// M11 - Touch-parity landmark set (spec SS7 M11): one shared manifest,
// equal to the Playwright mobile project's set, consumed by the native
// flows. Drift on either side fails here.
test("M11 shared landmark manifest matches the Playwright mobile set and feeds the native flows", () => {
  const manifestPath = join(ROOT, "mobile/e2e/maestro/landmarks.json");
  expect(existsSync(manifestPath), "landmarks.json missing").toBe(true);
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as { landmarks: Landmark[] };
  expect(manifest.landmarks.length).toBeGreaterThanOrEqual(4);

  // Web side: the frozen Playwright mobile assertions are the source of
  // truth - every manifest selector must literally appear in the specs the
  // mobile projects run (responsive.spec.ts + frozen.spec.ts), and every
  // mobile-specific sidebar selector asserted there must be in the manifest.
  const specs = [
    "apps/stellarc-ui/e2e/responsive.spec.ts",
    "apps/stellarc-ui/e2e/frozen.spec.ts",
  ]
    .map((rel) => readFileSync(join(ROOT, rel), "utf8"))
    .join("\n");
  for (const landmark of manifest.landmarks) {
    expect(
      specs.includes(landmark.playwrightSelector),
      `manifest selector ${landmark.playwrightSelector} absent from the Playwright specs the mobile projects run`,
    ).toBe(true);
  }
  const webSelectors = [
    'getByTestId("mobile-sidebar-toggle")',
    '[data-slot="sidebar"][data-mobile="true"]',
    '[data-slot="sidebar-container"]',
  ];
  const manifestSelectors = manifest.landmarks.map(
    (landmark) => landmark.playwrightSelector,
  );
  for (const selector of webSelectors) {
    expect(
      manifestSelectors.includes(selector),
      `Playwright mobile selector ${selector} missing from the shared manifest`,
    ).toBe(true);
  }

  // Native side: every manifest landmark is referenced by a flow.
  const flowText = FLOWS.map((flow) =>
    readFileSync(join(ROOT, "mobile/e2e/maestro/flows", flow), "utf8"),
  ).join("\n");
  for (const landmark of manifest.landmarks) {
    expect(
      flowText.includes(landmark.maestroSelector),
      `native flows never assert landmark ${landmark.id} (${landmark.maestroSelector})`,
    ).toBe(true);
  }
});

// M12 - No console, no PII in shell logs (spec SS7 M12).
test("M12 Rust shell logs structured startup lines only; never the API origin or credentials", () => {
  const source = readFileSync(join(ROOT, "mobile/src/lib.rs"), "utf8");
  // Structured prefix on every eprintln site (log_event is the only path).
  for (const match of source.matchAll(/eprintln!\("([^"]*)"/g)) {
    expect(
      match[1].startsWith("service.name=stellarc-mobile"),
      `raw eprintln without the structured prefix: ${match[1]}`,
    ).toBe(true);
  }
  // No println!/dbg! in the shell.
  expect(source).not.toMatch(/\bprintln!\(/);
  expect(source).not.toMatch(/\bdbg!\(/);
  // The baked API origin (or any URL/credential) never reaches a log call:
  // API_URL may only feed the request target, never a format! passed to
  // eprintln!/log_event (sabotage: log the baked VITE_API_URL).
  for (const match of source.matchAll(/log_event\(([^)]*)\)/g)) {
    expect(
      match[1].includes("API_URL"),
      "API_URL must never be logged (PII/credential rule)",
    ).toBe(false);
  }
});

// M07/M08/M10 CI wiring (spec SS5 + premise 5: ships regardless, fails
// closed with a named O1 message when the runner lacks device capability).
test("M07/M08/M10 mobile workflow wires emulator + simulator smokes and fails closed on O1", () => {
  const workflow = readFileSync(
    join(ROOT, ".github/workflows/mobile.yml"),
    "utf8",
  );
  expect(workflow).toContain("tauri android build --debug");
  expect(workflow).toContain("tauri ios build --debug");
  expect(workflow).toContain("maestro test");
  expect(workflow).toContain("--config config.mobile.yaml");
  // O1 fail-closed: the Android emulator job must name the runner-class
  // failure instead of hanging.
  expect(workflow).toContain("::error::O1");
  // Artifacts, per v1 desktop.yml conventions.
  expect(workflow).toContain("actions/upload-artifact@v4");
});
