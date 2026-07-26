# Placeholder

`tauri_build::build()` validates the `resources` paths declared in
`tauri.conf.json` at compile time, so this directory must exist for
`cargo check`/`cargo test` to succeed on a fresh checkout.

The real contents are produced by `desktop/scripts/stage-ui.sh`, which runs as
the Tauri `beforeBuildCommand` and copies `ui/dist` here. Everything except
this README and `.gitkeep` is gitignored.

Do not add files here by hand.
