# Scout: cross-platform-ui — 2026-10-13

Beat: **cross-platform-ui**. Delta run over [2026-10-09](./2026-10-09-cross-platform-ui.md) (4 days): every radar row re-verified against primary sources, plus a closer look at the beat's least-covered maturity dimensions — **accessibility and IME on the chosen Tauri shell**.

Method: GitHub REST API (`gh api`), crates.io API, npm registry — primary sources only. Web search backend down a third consecutive run (`9router` unregistered); no claim below depends on it. Grounding unchanged: ADR 0009 §Target platforms — one React codebase, **Tauri 2** shell, web + desktop + mobile, no second UI stack; `desktop/Cargo.toml` floats `tauri = "2"`.

## Headline

Two things moved since Friday. First, **Tauri is building a CEF runtime**: a `tauri-runtime-cef` crate (3.0.0-alpha.5, 2026-10-01, five alphas since 2026-09-13) developed on the `feat/cef` branch with near-daily PRs through today. This is Tauri 3's answer to webview-engine fragmentation — and specifically to the weakness this beat keeps tracking: the tauri repo currently holds **67 open `webkitgtk` issues, 10 open IME issues, 10 open accessibility issues**, essentially all rooted in Linux's WebKitGTK. A Chromium runtime makes IME/text-input and a11y consistent across platforms for the first time in Tauri's history. It changes the Tauri 3 story from "nice private-API cleanup" to "fixes the worst platform-quality gap we'd inherit." Second, **GPUI Kit shipped three releases in two weeks** (v0.7.0 → v0.7.3, last on 2026-10-12) with explicit IME-editing, speech-input and accessibility work — the Rust-native path is compounding fast, and stays wrong for us.

Also this run: a concrete **accessibility gap in our own house** — the repo has **no axe/a11y scan anywhere** (verified: no `axe` in any `package.json` or `bun.lock`), while ADR 0009's four Playwright viewport projects check pixels and breakpoints but nothing about aria or keyboard. Proposal 1 fills it for one dependency.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | Patch `2.12.3` (2026-10-10): iOS release builds link under **Xcode 27** (Swift `@_cdecl` entry points marked `public` — they were being stripped, breaking release links); `Channel` messages keep delivering after an `onmessage` handler throws; NSIS silent/passive/update modes now honor `allowDowngrades: false`. 111.8k★ | 2.12.3 2026-10-10 (repo floats `tauri "2"`) | MIT / Apache-2.0 | 5 | **ADOPT** (keep) | The iOS fix lands right before NEVR-73's mobile bring-up spike — build the spike on ≥2.12.3 so Xcode 27 release builds aren't a false failure. The float still means every 2.x flows in unattended (NEVR-72's verification pass stands, `todo`) |
| **`tauri-runtime-cef`** (Tauri 3 CEF runtime) | New runtime backend: "Tauri runtime interface for Chromium Embedded Framework". Five 3.0.0 alphas (alpha.0 2026-09-13 → alpha.5 2026-10-01); `feat/cef` branch active through today (overlay-titlebar fix 2026-10-13); OSR support, hardened Chromium flags, Linux window class, winit-gtk4 migration | 3.0.0-alpha.5 2026-10-01 | MIT / Apache-2.0 (tauri repo) | 2 | **WATCH** (new row) | The strategic Tauri 3 item for us. Directly targets the Linux WebKitGTK hole (67 open `webkitgtk` / 10 IME / 10 a11y issues in tauri) that our desktop deb/appimage targets would inherit. Trigger stays "Tauri 3.0 stable", but the payoff line for NEVR-72 changes: it's not private-API removal, it's a consistent IME/a11y engine on Linux |
| **Tauri 3.0-alpha track** | alpha.4 (2026-10-01) still latest tagged for core; CLI at alpha.27 internally on `feat/cef`. Don't chase | 3.0.0-alpha.4 2026-10-01 | MIT / Apache-2.0 | 2 | **WATCH** | Unchanged verdict; see CEF row for why the trigger note sharpens |
| **GPUI Kit** (ex gpui-component) | **v0.7.0 → v0.7.3 in two weeks** (09-28 / 10-05 / 10-12; 0.7.2 yanked). Adds readonly **Diff viewer with Git history**, optional Fast backend, speech input, ColorSelect, Toolbar/TimeField; per-release `gpui-pre` snapshot pinning; release notes explicitly cite **IME editing, keyboard focus, accessibility, text selection** improvements and per-frame state-write fixes. 17.0k★ (16.6k Friday), pushed today | v0.7.3 2026-10-12 | Apache-2.0 (`LICENSE-APACHE` in repo; GitHub shows NOASSERTION) | 3 | **WATCH** | The compounding is real: a release cadence and a quality focus (IME, a11y, text) that directly attack the historical weakness of native-Rust UI. Still a second UI stack in a language we don't use — verdict unchanged. Trigger unchanged: 1.0 + synchronized `gpui` crate |
| **Lynx** | `@lynx-js/react` **0.127.0** (2026-10-10; was 0.126.2) — bindings still pre-1.0, still shipping weekly. Repo 15.2k★, pushed today | 4.1.0 / bindings 0.127.0 2026-10-10 | Apache-2.0 | 2 | **WATCH** | Unchanged: trigger remains bindings 1.0 + a desktop story |
| **Expo / React Native** | Expo SDK 57.0.28 (2026-10-12); RN 0.87.1 stable since 2026-08-26 | as of 2026-10-13 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names it) |
| **react-native-web** | No movement since 0.21.4 (2026-10-08) | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | No movement since 8.5.3 (2026-10-07) | 8.5.3 2026-10-07 | MIT | 4 | **REJECT** | Unchanged — Tauri mobile covers the same ground |
| **Dioxus** | `0.8.0-alpha.1` (2026-07-31) — the 0.8 line has been alpha-only for ~2.5 months; stable remains 0.7.10 | 0.8.0-alpha.1 2026-07-31 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged; cadence still slower than GPUI Kit's |
| **Flutter** | 180.0k★, pushed today — steady | active 2026-10-13 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | `2.0.3-beta.23` on the beta tag (latest stable 2.0.2, 2026-09-29) — still beta-first | 2.0.3-beta.23 | MIT | 2 | **REJECT** | Unchanged |
| **`@axe-core/playwright`** | axe wrappers for Playwright: `AxeBuilder.analyze()` per page, rules tunable per project. 4.13.0 (2026-08-11) wraps axe-core 4.14-line (4.14.0, 2026-10-05). Single dep, MPL-2.0, zero transitive deps beyond axe-core | 4.13.0 2026-08-11 | MPL-2.0 | 5 | **ADOPT** (proposal 1) | Fills the beat's own gap in our repo: ADR 0009's four viewport projects assert pixels and breakpoints, nothing asserts aria/keyboard. One spec file gives every frozen surface an a11y floor before more UI piles on top |

## Proposals

### 1. ADOPT — accessibility floor in the Playwright viewport suite
The cross-platform beat grades every framework on accessibility, and our own suite has none: no `axe` anywhere in the repo (checked `package.json`, `apps/stellarc-ui/package.json`, `bun.lock`), and `apps/stellarc-ui/e2e/` has exactly two specs (`frozen.spec.ts`, `responsive.spec.ts`), both pixel/viewport-shaped. Add `@axe-core/playwright` (MPL-2.0, one dependency, `shadcn add`-era React components are generally axe-clean so the floor should start green) and one `a11y.spec.ts` that runs `AxeBuilder.analyze()` on the desktop (1440×900) and mobile (390×844) projects against the same routes `frozen.spec.ts` covers, failing only on `[critical, serious]`. This makes "the responsive layer is part of the frozen surface" (ADR 0009) mean something for keyboard and screen-reader users too — before the desktop shell hardens around it.
*(Issue brief posted as a separate comment for Talos.)*

### 2. WATCH — sharpen the Tauri 3 trigger in NEVR-72 (no new issue)
`tauri-runtime-cef` rewrites the payoff line for the Tauri 3 migration spike already parked in NEVR-72 (`todo`). Update its brief when triaged: the reason to migrate is no longer just private-API removal — it's an optional Chromium runtime that addresses Linux WebKitGTK's IME/a11y/compat tail (67/10/10 open issues in the tauri repo today). No action now; the alpha cadence (5 releases in 3 weeks, PRs daily) says this is funded and real, not experimental. Radar row updated accordingly.

### 3. Correction for NEVR-73's scope — the 21 Maestro flows live in the v1 fork, not `dev`
The 2026-10-09 report proposed running "the 21 existing `.maestro` mobile flows" against a Tauri mobile shell. Those 21 flows are the **v1 Kaneo fork's** (ADR 0009 line 103: "v1 already has `.maestro/config.mobile.yaml` and 21 flows"). `dev` carries exactly **one** flow — `desktop/e2e/maestro/flows/desktop-smoke.yaml` (boot + screenshot). The NEVR-73 spike should budget for porting a representative subset of the v1 flows forward, not assume they exist in `dev`. Flagged here so Talos sizes the brief correctly; no repo change from this scout.

## Notable non-findings

- Web search provider down a **third** consecutive run (`9router` unregistered). GitHub + crates.io + npm carried the whole beat again.
- wry itself has **zero open IME issues** — the IME tail lives in the tauri repo's issue tracker against the WebKitGTK stack, not in the abstraction layer. Confirms the CEF runtime is aimed at exactly that.
- Tauri 2.12.3's cargo-audit output flags unmaintained transitive deps (`rustybuzz`, `ttf-parser`, `fxhash`, `paste`, `rustls-pemfile`) — all warnings, all allowed upstream; nothing actionable for us at our `tauri "2"` pin.
