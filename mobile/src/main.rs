// Desktop-dev entry for the mobile shell crate (not shipped; mirrors the
// desktop crate's main.rs so `cargo run` works while iterating locally).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    stellarc_mobile_lib::run()
}
