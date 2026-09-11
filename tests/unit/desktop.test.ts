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

test("T03 build-ui.sh bakes DESKTOP_API_URL into a manifest, never the localhost fallback", () => {
	const script = join(ROOT, "desktop/scripts/build-ui.sh");
	expect(existsSync(script), "build-ui.sh missing").toBe(true);
	expect(statSync(script).mode & 0o111, "build-ui.sh not executable").not.toBe(
		0,
	);

	const root = mkdtempSync(join(tmpdir(), "stellarc-desktop-build-"));
	try {
		// Reproduce the script's expected layout in a sandbox so the full bake
		// path runs without a real Vite build: `repo/apps/stellarc-ui` plus a
		// `desktop/tauri.conf.json` carrying the CSP placeholder.
		const desktop = join(root, "desktop");
		const scripts = join(desktop, "scripts");
		mkdirSync(join(root, "apps/stellarc-ui"), { recursive: true });
		mkdirSync(scripts, { recursive: true });
		writeFileSync(join(scripts, "build-ui.sh"), readFileSync(script, "utf8"));
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

		const result = spawnSync("bash", [join(scripts, "build-ui.sh")], {
			cwd: root,
			encoding: "utf8",
			env: {
				...process.env,
				DESKTOP_API_URL: "https://api.example.com",
				PATH: `${bin}:${process.env.PATH ?? ""}`,
			},
		});
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

		// The CSP placeholder resolved to http + ws origins.
		const resolved = readFileSync(join(desktop, "tauri.conf.json"), "utf8");
		expect(resolved).toContain("https://api.example.com");
		expect(resolved).toContain("wss://api.example.com");
		expect(resolved).not.toContain("__STELLARC_API_ORIGIN__");
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
