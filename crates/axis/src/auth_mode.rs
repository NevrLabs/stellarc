use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthMode {
    Unconfigured,
    Authenticated,
    SingleUser,
}

impl AuthMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Unconfigured => "unconfigured",
            Self::Authenticated => "authenticated",
            Self::SingleUser => "single-user",
        }
    }
}

#[derive(Clone, Debug)]
pub struct AuthModeStore {
    path: PathBuf,
}

impl AuthModeStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn load(&self) -> Result<AuthMode> {
        let value = match std::fs::read_to_string(&self.path) {
            Ok(value) => value,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(AuthMode::Unconfigured)
            }
            Err(error) => {
                return Err(error).with_context(|| format!("reading {}", self.path.display()))
            }
        };
        match value.trim() {
            "authenticated" => Ok(AuthMode::Authenticated),
            "single-user" => Ok(AuthMode::SingleUser),
            other => bail!("unknown auth mode {other:?} in {}", self.path.display()),
        }
    }

    pub fn choose(&self, mode: AuthMode) -> Result<AuthMode> {
        if mode == AuthMode::Unconfigured {
            bail!("unconfigured is not a selectable auth mode");
        }
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        use std::io::Write;
        let mut file = options.open(&self.path).with_context(|| {
            format!("auth mode is already configured at {}", self.path.display())
        })?;
        writeln!(file, "{}", mode.as_str())?;
        file.sync_all()?;
        Ok(mode)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}
