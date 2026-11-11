import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The runtime plugin (router-plugin 1.168.48) takes the stable
// `autoCodeSplitting`; start-plugin-core 1.171.55's input schema still only
// types the deprecated `experimental.enableCodeSplitting` and rejects the
// stable flag. Runtime wins — asserted, with the comment as the paper trail.
const startConfig = {
	router: {
		autoCodeSplitting: true,
		// Keep co-located tests and non-route files out of the route tree.
		routeFileIgnorePattern: "\\.test\\.tsx?$",
	},
	// Prerender the SPA shell: routes render client-side (defaultSsr: false in
	// src/start.ts), but the document shell is generated at build so dist/client
	// is a loadable static app for Tauri / file:// / any static server.
	prerender: {
		enabled: true,
		crawlLinks: true,
		failOnError: true,
	},
} as Parameters<typeof tanstackStart>[0];

export default defineConfig(({ command }) => ({
	// Relative asset URLs in the built shell so it loads from file://, a static
	// server, or the Tauri webview (ADR 0014 §4: static SPA build). The dev
	// server needs the absolute base — its injected module URLs 404 under "./".
	base: command === "build" ? "./" : "/",
	// Keep generated SSR imports inside this build instead of resolving hoisted
	// transitive dependencies from an unrelated ancestor node_modules directory.
	ssr: { noExternal: true },
	plugins: [
		// MUST come before react()
		tanstackStart(startConfig),
		react(),
		tailwindcss(),
	],
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "./src"),
		},
	},
	server: {
		port: 5180,
		strictPort: true,
	},
	preview: {
		port: 5180,
		strictPort: true,
	},
}));
