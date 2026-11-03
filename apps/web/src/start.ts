import { createStart } from "@tanstack/react-start";

/*
 * SPA semantics (ADR 0014 §4). Deliberate deviation, with evidence:
 *
 * The operator brief said `createStart(() => ({ defaultSsr: false }))`, but in
 * the current published Start build (react-start 1.169.4, start-server-core
 * 1.169.45, router-core 1.171.39) every sub-`true` SSR configuration — global
 * `defaultSsr: false`, per-route `ssr: false`, and per-route `ssr: 'data-only'`
 * — makes the served/prerendered document a bootstrap-only shell (no entry
 * <script> rendered, no mount, no error) and the app never boots. Verified by
 * loading the built output on a static server: modules all load 200, React
 * never mounts; with route SSR at the default the same build boots and
 * hydrates.
 *
 * The ADR's actual requirements still hold:
 *  - the build is a static SPA (prerender.enabled) loadable by Tauri or any
 *    static server — no runtime server dependency;
 *  - runtime navigation is client-side (TanStack Router SPA behaviour after
 *    hydration);
 *  - no server functions for domain data — Effect HttpApi remains the API;
 *  - the selective-SSR hook stays available per route for share/login pages.
 *
 * Revisit `defaultSsr: false` when upstream fixes shell boot.
 */
export const startInstance = createStart(() => ({}));
