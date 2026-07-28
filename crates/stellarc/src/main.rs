//! `stellarc` — single entrypoint for both node roles.
//!
//! One binary, one `cargo binstall stellarc`, one PATH entry. Which role a node
//! holds is a runtime argument, not a separate artifact:
//!
//! ```text
//! stellarc axis                   # central role: event log, views, REST/WS, scheduler
//! stellarc orbit                  # per-host role: owns agent runtimes (ACP children)
//! stellarc orbit --axis iroh:<id>
//! ```
//!
//! Each role's `entry::run` carries its own `#[tokio::main]`, so it is a plain
//! sync call from here and this dispatcher owns no runtime of its own.
//!
//! Both roles parse their flags by scanning argv for `--name` tokens, so the
//! leading role word needs no argv surgery — it is a positional token neither
//! role looks at.

use anyhow::Result;

const USAGE: &str = "\
stellarc — distributed agent control plane

USAGE:
    stellarc <ROLE> [ROLE ARGS...]

ROLES:
    axis     central role — event log, views, search, REST/WS API, scheduler
    orbit    per-host role — owns agent runtimes (ACP children)
    setup    configure installation-local settings

Run `stellarc <ROLE> --help` for role-specific flags.
";

fn setup() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let mode = args
        .windows(2)
        .find(|pair| pair[0] == "--auth")
        .map(|pair| pair[1].as_str())
        .ok_or_else(|| anyhow::anyhow!("usage: stellarc setup --auth authenticated|single-user"))?;
    let mode = match mode {
        "authenticated" => stellarc_axis::auth_mode::AuthMode::Authenticated,
        "single-user" => stellarc_axis::auth_mode::AuthMode::SingleUser,
        _ => {
            return Err(anyhow::anyhow!(
                "auth mode must be `authenticated` or `single-user`"
            ))
        }
    };
    let home = stellarc_axis::entry::stellarc_home()?;
    let store = stellarc_axis::auth_mode::AuthModeStore::new(home.join("auth-mode"));
    store.choose(mode)?;
    println!("authentication mode: {}", mode.as_str());
    Ok(())
}

fn main() -> Result<()> {
    match std::env::args().nth(1).as_deref() {
        Some("axis") => stellarc_axis::entry::run(),
        Some("orbit") => stellarc_orbit::entry::run(),
        Some("setup") => setup(),
        Some("--version") | Some("-V") => {
            println!("stellarc {}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        None | Some("--help") | Some("-h") => {
            print!("{USAGE}");
            Ok(())
        }
        Some(other) => {
            eprintln!("stellarc: unknown role `{other}`\n{USAGE}");
            std::process::exit(2);
        }
    }
}

#[cfg(test)]
mod tests {
    /// The role dispatch contract: both roles discover flags by scanning argv for
    /// `--name` tokens, which is what makes it safe to leave the role word in
    /// place. If a role ever starts reading positional args, this breaks and the
    /// dispatcher must strip argv[1] before handing over.
    #[test]
    fn role_word_is_not_mistaken_for_a_flag() {
        let argv = ["stellarc", "orbit", "--node-id", "fx-02"];
        let flags: Vec<&str> = argv
            .iter()
            .copied()
            .filter(|a| a.starts_with("--"))
            .collect();
        assert_eq!(flags, ["--node-id"]);
        assert!(!argv[1].starts_with("--"), "role word must stay positional");
    }
}
