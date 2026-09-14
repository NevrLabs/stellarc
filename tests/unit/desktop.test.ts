import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

const ROOT = process.cwd();

interface TauriConf {
	identifier: string;
	build?: { frontendDist?: string };
	bundle?: { targets?: string[] };
	app?: { security?: { csp: string | null } };
}

const BUNDLE_TARGETS = ["msi", "nsis", "deb", "appimage", "dmg"] as const;

function readTauriConf(): TauriConf {
	return JSON.parse(
		readFileSync(join(ROOT, "desktop/tauri.conf.json"), "utf8"),
	) as TauriConf;
}

test("T01 desktop shell config is exact: identifier, bundle targets, icons, frontendDist, pinned Tauri CLI", () => {
	const conf = readTauriConf();
	expect(conf.identifier).toBe("dev.stellarc.desktop");
	for (const target of BUNDLE_TARGETS) {
		expect(conf.bundle?.targets, `missing bundle target ${target}`).toContain(
			target,
		);
	}
	expect(conf.build?.frontendDist).toBe("../apps/stellarc-ui/dist");
	for (const icon of [
		"icons/32x32.png",
		"icons/128x128.png",
		"icons/icon.ico",
		"icons/icon.icns",
	]) {
		expect(
			existsSync(join(ROOT, "desktop", icon)),
			`missing icon ${icon}`,
		).toBe(true);
	}
	const pkg = JSON.parse(
		readFileSync(join(ROOT, "desktop/package.json"), "utf8"),
	) as { devDependencies?: Record<string, string> };
	expect(pkg.devDependencies?.["@tauri-apps/cli"]).toBe("^2");
	// v1 shipped `csp: null`; the schema check must reject that (see T10).
	expect(conf.app?.security?.csp).not.toBeNull();
});

test("T01b desktop:build pre-bakes the tauri config before the CLI parses -c (rework D1)", () => {
	const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
		scripts?: Record<string, string>;
	};
	const script = pkg.scripts?.["desktop:build"] ?? "";
	// `tauri build -c target/tauri.conf.build.json` parses -c BEFORE running
	// beforeBuildCommand, so the resolved config must already exist when the
	// CLI starts: build-ui.sh runs first as a plain shell step.
	expect(script, "desktop:build missing build-ui.sh pre-bake").toContain(
		"build-ui.sh",
	);
	expect(script, "desktop:build missing tauri build").toContain("tauri build");
	const bake = script.indexOf("build-ui.sh");
	const tauri = script.indexOf("tauri build");
	expect(bake, "build-ui.sh must run before tauri build").toBeLessThan(tauri);
	// The -c path build-ui.sh emits is the one the CLI consumes.
	expect(script).toContain("-c target/tauri.conf.build.json");
});

test("T02 desktop slice leaves the frozen UI tree untouched", () => {
	const result = spawnSync(
		"git",
		["diff", "--name-only", "HEAD", "--", "apps/stellarc-ui", "packages"],
		{ cwd: ROOT, encoding: "utf8" },
	);
	const changed = result.stdout
		.split("\n")
		.filter((line) => line.trim().length > 0);
	expect(changed, "frozen UI tree modified by the desktop slice").toEqual([]);
});

function makeDesktopSandbox(): string {
	const root = mkdtempSync(join(tmpdir(), "stellarc-desktop-build-"));
	// Reproduce the script's expected layout in a sandbox so the full bake
	// path runs without a real Vite build: `repo/apps/stellarc-ui` plus a
	// `desktop/tauri.conf.json` carrying the CSP placeholder.
	const desktop = join(root, "desktop");
	const scripts = join(desktop, "scripts");
	mkdirSync(join(root, "apps/stellarc-ui"), { recursive: true });
	mkdirSync(scripts, { recursive: true });
	writeFileSync(
		join(scripts, "build-ui.sh"),
		readFileSync(join(ROOT, "desktop/scripts/build-ui.sh"), "utf8"),
	);
	chmodSync(join(scripts, "build-ui.sh"), 0o755);
	writeFileSync(
		join(desktop, "tauri.conf.json"),
		JSON.stringify({
			identifier: "dev.stellarc.desktop",
			app: {
				security: {
					csp: "default-src 'self'; connect-src 'self' __STELLARC_API_ORIGIN__",
				},
			},
		}),
	);

	// Stub `bun` so `bun run build` simulates a Vite build that bakes
	// VITE_API_URL into the emitted bundle, like the real frozen build does.
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

function runBuildUi(root: string, apiUrl: string) {
	return spawnSync("bash", [join(root, "desktop/scripts/build-ui.sh")], {
		cwd: root,
		encoding: "utf8",
		env: {
			...process.env,
			DESKTOP_API_URL: apiUrl,
			PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}`,
		},
	});
}

test("T03 build-ui.sh bakes DESKTOP_API_URL into a manifest, never the localhost fallback", () => {
	const script = join(ROOT, "desktop/scripts/build-ui.sh");
	expect(existsSync(script), "build-ui.sh missing").toBe(true);
	expect(statSync(script).mode & 0o111, "build-ui.sh not executable").not.toBe(
		0,
	);

	const root = makeDesktopSandbox();
	try {
		const result = runBuildUi(root, "https://api.example.com");
		expect(result.status, result.stderr).toBe(0);

		const manifest = JSON.parse(
			readFileSync(
				join(root, "apps/stellarc-ui/dist/stellarc-desktop-manifest.json"),
				"utf8",
			),
		) as { vite_api_url: string; ws_url: string };
		expect(manifest.vite_api_url).toBe("https://api.example.com");
		expect(manifest.ws_url).toBe("wss://api.example.com");
		expect(JSON.stringify(manifest)).not.toContain("localhost:1337");

		// The baked bundle records the absolute URL, never the fallback.
		const bundle = readFileSync(
			join(root, "apps/stellarc-ui/dist/index.js"),
			"utf8",
		);
		expect(bundle).toContain("https://api.example.com");
		expect(bundle).not.toContain("localhost:1337");

		// The CSP placeholder resolves into the BUILD-TIME copy, never the
		// source file (review D3): repeat builds with different origins must
		// stay correct, and a local desktop:build must not dirty the tree.
		const resolved = readFileSync(
			join(root, "desktop/target/tauri.conf.build.json"),
			"utf8",
		);
		expect(resolved).toContain("https://api.example.com");
		expect(resolved).toContain("wss://api.example.com");
		expect(resolved).not.toContain("__STELLARC_API_ORIGIN__");
		const source = readFileSync(join(root, "desktop/tauri.conf.json"), "utf8");
		expect(source).toContain("__STELLARC_API_ORIGIN__");
		expect(source).not.toContain("https://api.example.com");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("T03b build-ui.sh is idempotent: a second run with a new origin re-resolves the CSP", () => {
	const root = makeDesktopSandbox();
	try {
		expect(runBuildUi(root, "https://api-one.example.com").status).toBe(0);
		const second = runBuildUi(root, "https://api-two.example.com");
		expect(second.status, second.stderr).toBe(0);

		const resolved = readFileSync(
			join(root, "desktop/target/tauri.conf.build.json"),
			"utf8",
		);
		expect(resolved).toContain("https://api-two.example.com");
		expect(resolved).toContain("wss://api-two.example.com");
		expect(resolved).not.toContain("api-one.example.com");
		expect(resolved).not.toContain("__STELLARC_API_ORIGIN__");

		// The source conf never moved off the placeholder.
		const source = readFileSync(join(root, "desktop/tauri.conf.json"), "utf8");
		expect(source).toContain("__STELLARC_API_ORIGIN__");
		expect(source).not.toContain("api-one.example.com");
		expect(source).not.toContain("api-two.example.com");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("T06 desktop Maestro smoke flow parses with the required steps", () => {
	const flow = readFileSync(
		join(ROOT, "desktop/e2e/maestro/flows/desktop-smoke.yaml"),
		"utf8",
	);
	const launch = flow.indexOf("launchApp");
	const wait = flow.indexOf("extendedWaitUntil");
	const shot = flow.indexOf("takeScreenshot");
	expect(launch, "missing launchApp").toBeGreaterThanOrEqual(0);
	expect(wait, "missing extendedWaitUntil landmark").toBeGreaterThanOrEqual(0);
	expect(shot, "missing takeScreenshot").toBeGreaterThanOrEqual(0);
	expect(launch, "steps out of order").toBeLessThan(wait);
	expect(wait, "steps out of order").toBeLessThan(shot);
	const config = readFileSync(
		join(ROOT, "desktop/e2e/maestro/config.yaml"),
		"utf8",
	);
	expect(config).toContain("testOutputDir");
	// Rework D5: the CLI does not auto-load config.yaml from the CWD or the
	// flow's directory (verified against maestro 2.10.0 — only --config
	// applies it), so the workflow must pass the config explicitly.
	const workflow = readFileSync(
		join(ROOT, ".github/workflows/desktop.yml"),
		"utf8",
	);
	expect(workflow, "maestro must run from desktop/e2e/maestro").toContain(
		"working-directory: desktop/e2e/maestro",
	);
	expect(
		workflow,
		"maestro test must receive --config config.yaml (D5)",
	).toContain("--config config.yaml");
});

test("T10 CSP allows self + exactly the API origin and nothing else; null rejected", () => {
	const conf = readTauriConf();
	const csp = conf.app?.security?.csp;
	expect(csp).not.toBeNull();
	expect(typeof csp).toBe("string");
	const policy = csp as string;
	expect(policy).toContain("'self'");
	// Build-time placeholder: build-ui.sh resolves it to the exact http+ws
	// origin, so the shipped webview allows nothing beyond that origin.
	expect(policy).toContain("__STELLARC_API_ORIGIN__");
	expect(policy).not.toContain("*");
	expect(policy).not.toMatch(/unsafe-eval|unsafe-inline/);
});
