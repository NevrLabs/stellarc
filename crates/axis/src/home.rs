//! Home-directory resolution.
//!
//! `HOME` is a Unix convention; Windows uses `USERPROFILE`. Axis had three
//! independent `env::var("HOME")` call sites, so the Windows desktop bundle
//! failed at startup with "HOME is not set" before it could open a window.
//! `dirs::home_dir` handles both (it consults `USERPROFILE` and then
//! `SHGetKnownFolderPath` on Windows), and it is already in the dependency
//! graph via tauri.

use anyhow::{Context, Result};
use std::path::PathBuf;

/// The user's home directory.
///
/// `HOME` wins when set, so existing Unix overrides and tests keep working;
/// otherwise fall back to the platform's own notion of home.
pub fn home_dir() -> Result<PathBuf> {
    if let Some(home) = std::env::var_os("HOME").filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(home));
    }
    dirs::home_dir()
        .context("could not determine the home directory (set HOME, or USERPROFILE on Windows)")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `HOME` must still take precedence — tests and Unix deployments set it.
    /// Also asserts the fallback resolves, which is the Windows path.
    #[test]
    fn home_env_wins_and_fallback_resolves() {
        // Not `#[serial]`-guarded: this is the only test touching HOME.
        let original = std::env::var_os("HOME");

        std::env::set_var("HOME", "/tmp/stellarc-home-test");
        assert_eq!(
            home_dir().expect("HOME set"),
            PathBuf::from("/tmp/stellarc-home-test")
        );

        // Empty must not be accepted as a valid home.
        std::env::set_var("HOME", "");
        let fallback = home_dir();

        match original {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }

        assert!(
            fallback.is_ok(),
            "empty HOME must fall through to the platform home, got {fallback:?}"
        );
    }
}
