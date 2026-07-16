//! Declarative package manifests and pre-execution validation (ADR 0012).

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

pub const OLYMPUS_API_VERSION: &str = "0.1";
pub const DEV_UNSIGNED: &str = "dev-unsigned";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PackageManifest {
    pub package: PackageMetadata,
    pub compatibility: Compatibility,
    #[serde(default)]
    pub capabilities: CapabilityReview,
    #[serde(default)]
    pub contributions: Contributions,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PackageMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub license: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Compatibility {
    pub olympus_api: String,
    #[serde(default)]
    pub platforms: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CapabilityReview {
    #[serde(default)]
    pub required: BTreeSet<String>,
}

/// Typed contribution tables. Definitions remain schema/protocol data, never a
/// Rust ABI. `definition` is class-specific TOML converted losslessly to JSON.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Contributions {
    #[serde(default)]
    pub activity_provider: Vec<Contribution>,
    #[serde(default)]
    pub trigger_provider: Vec<Contribution>,
    #[serde(default)]
    pub resource_provider: Vec<Contribution>,
    #[serde(default)]
    pub session_tool_provider: Vec<Contribution>,
    #[serde(default)]
    pub runtime_adapter: Vec<Contribution>,
    #[serde(default)]
    pub embedded_app: Vec<Contribution>,
    #[serde(default)]
    pub indexer_extractor: Vec<Contribution>,
    #[serde(default)]
    pub policy_provider: Vec<Contribution>,
    #[serde(default)]
    pub view_provider: Vec<Contribution>,
    #[serde(default)]
    pub storage_provider: Vec<Contribution>,
    #[serde(default)]
    pub skill: Vec<Contribution>,
    #[serde(default)]
    pub workflow_template: Vec<Contribution>,
    /// Managed binary apps (APP-1, ADR 0015). Typed separately because
    /// runtime/entrypoint/health/env are trust-boundary fields that must not
    /// flow through generic definition blobs.
    #[serde(default)]
    pub apps: Vec<AppContribution>,
}

// ── APP-1 typed contribution ──────────────────────────────────────────────

/// Runtime kind for a managed app. Container is parsed but rejected at activation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AppRuntimeKind {
    Binary,
    Container,
}

/// A managed binary app declared in a package manifest (APP-1, ADR 0015).
/// All fields are trust-boundary fields and must be validated before activation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AppContribution {
    /// App id: valid slug, must be globally unique across all installed packages.
    pub id: String,
    /// Runtime kind; only `binary` is supported in APP-1.
    pub runtime: AppRuntimeKind,
    /// Relative entrypoint path within the package root (e.g. "bin/server").
    /// Must be relative, no parent-dir traversal.
    pub entrypoint: String,
    /// Dynamic listen mode ("dynamic" is the only v1 value).
    pub listen: String,
    /// HTTP health check path (must start with `/`).
    pub health_path: String,
    /// Env var declarations. Keys are safe identifiers; values may use
    /// exactly `${app_state}` template; `PORT` is reserved.
    #[serde(default)]
    pub env: std::collections::BTreeMap<String, String>,
    /// Optional memory limit in bytes.
    #[serde(default)]
    pub memory_max: Option<u64>,
    /// Capability ids this app consumes (must be a subset of
    /// package.capabilities.required).
    #[serde(default)]
    pub required_capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Contribution {
    pub id: String,
    #[serde(default)]
    pub provides: BTreeSet<String>,
    #[serde(default)]
    pub state_namespaces: Vec<String>,
    #[serde(default)]
    pub definition: toml::Table,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ValidationStage {
    Schema,
    Compatibility,
    CapabilityReview,
    Signature,
    Collision,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub stages: Vec<ValidationStage>,
    pub requested_capabilities: BTreeSet<String>,
    pub trust: String,
}

impl PackageManifest {
    pub fn parse_toml(source: &str) -> Result<Self> {
        toml::from_str(source).context("parsing package manifest TOML")
    }

    pub fn validate_schema(&self) -> Result<()> {
        for (label, value) in [
            ("package.id", self.package.id.as_str()),
            ("package.name", self.package.name.as_str()),
            ("package.version", self.package.version.as_str()),
            ("package.publisher", self.package.publisher.as_str()),
            ("package.license", self.package.license.as_str()),
        ] {
            anyhow::ensure!(!value.trim().is_empty(), "{label} must be non-empty");
        }
        anyhow::ensure!(valid_id(&self.package.id), "invalid package.id");
        anyhow::ensure!(
            valid_version(&self.package.version),
            "invalid package.version"
        );
        let mut ids = BTreeSet::new();
        for (_, contribution) in self.contributions.all() {
            anyhow::ensure!(
                valid_id(&contribution.id),
                "invalid contribution id {}",
                contribution.id
            );
            anyhow::ensure!(
                ids.insert(contribution.id.clone()),
                "duplicate contribution id {}",
                contribution.id
            );
            for capability in &contribution.provides {
                validate_capability(capability)?;
            }
            for namespace in &contribution.state_namespaces {
                anyhow::ensure!(
                    namespace.starts_with("plugin-state://"),
                    "invalid plugin state namespace {namespace}"
                );
            }
        }
        // App contributions share the global id namespace.
        for app in &self.contributions.apps {
            anyhow::ensure!(valid_id(&app.id), "invalid app id {}", app.id);
            anyhow::ensure!(
                ids.insert(app.id.clone()),
                "duplicate contribution id {}",
                app.id
            );
            validate_app_contribution(app)?;
        }
        for capability in &self.capabilities.required {
            validate_capability(capability)?;
        }
        Ok(())
    }

    pub fn validate_compatibility(&self, olympus_api: &str, platform: &str) -> Result<()> {
        let requested = self.compatibility.olympus_api.trim();
        anyhow::ensure!(
            requested == "*"
                || requested == olympus_api
                || requested
                    .strip_prefix('^')
                    .is_some_and(|v| v == olympus_api),
            "package requires Olympus API {requested}, host is {olympus_api}"
        );
        anyhow::ensure!(
            self.compatibility.platforms.is_empty()
                || self
                    .compatibility
                    .platforms
                    .iter()
                    .any(|p| p == "*" || p == platform),
            "package does not support platform {platform}"
        );
        Ok(())
    }

    pub fn unsupported_classes(&self) -> Vec<&'static str> {
        let c = &self.contributions;
        [
            ("trigger_provider", !c.trigger_provider.is_empty()),
            ("resource_provider", !c.resource_provider.is_empty()),
            ("runtime_adapter", !c.runtime_adapter.is_empty()),
            ("embedded_app", !c.embedded_app.is_empty()),
            ("indexer_extractor", !c.indexer_extractor.is_empty()),
            ("policy_provider", !c.policy_provider.is_empty()),
            ("view_provider", !c.view_provider.is_empty()),
            ("storage_provider", !c.storage_provider.is_empty()),
            // APP-1: binary apps are schema-valid but not yet activatable.
            // Remove this gate in the same changeset that adds Hall lifecycle dispatch.
            ("apps", !c.apps.is_empty()),
        ]
        .into_iter()
        .filter_map(|(name, present)| present.then_some(name))
        .collect()
    }

    pub fn provided_capabilities(&self) -> BTreeSet<String> {
        self.contributions
            .all()
            .into_iter()
            .flat_map(|(_, c)| c.provides.iter().cloned())
            .collect()
    }
}

impl Contributions {
    pub fn all(&self) -> Vec<(&'static str, &Contribution)> {
        let groups: [(&str, &Vec<Contribution>); 12] = [
            ("activity_provider", &self.activity_provider),
            ("trigger_provider", &self.trigger_provider),
            ("resource_provider", &self.resource_provider),
            ("session_tool_provider", &self.session_tool_provider),
            ("runtime_adapter", &self.runtime_adapter),
            ("embedded_app", &self.embedded_app),
            ("indexer_extractor", &self.indexer_extractor),
            ("policy_provider", &self.policy_provider),
            ("view_provider", &self.view_provider),
            ("storage_provider", &self.storage_provider),
            ("skill", &self.skill),
            ("workflow_template", &self.workflow_template),
        ];
        // `apps` uses `AppContribution` and is iterated separately in validate_schema.
        groups
            .into_iter()
            .flat_map(|(kind, values)| values.iter().map(move |value| (kind, value)))
            .collect()
    }
}

pub fn validate_install(
    manifest: &PackageManifest,
    active_capabilities: &BTreeMap<String, String>,
    bindings: &BTreeMap<String, String>,
) -> Result<ValidationReport> {
    manifest.validate_schema()?;
    manifest.validate_compatibility(OLYMPUS_API_VERSION, std::env::consts::OS)?;
    let requested_capabilities = manifest.capabilities.required.clone();
    let provided_capabilities = manifest.provided_capabilities();
    for (capability, provider) in bindings {
        anyhow::ensure!(
            provided_capabilities.contains(capability),
            "binding {capability} does not name a capability provided by this package"
        );
        anyhow::ensure!(
            provider == &manifest.package.id
                || active_capabilities.get(capability) == Some(provider),
            "binding {capability} selects unknown provider {provider}"
        );
    }
    for capability in provided_capabilities {
        if let Some(owner) = active_capabilities.get(&capability) {
            anyhow::ensure!(
                owner == &manifest.package.id
                    || bindings
                        .get(&capability)
                        .is_some_and(|bound| { bound == &manifest.package.id || bound == owner }),
                "capability collision: {capability} is already provided by {owner}"
            );
        }
    }
    Ok(ValidationReport {
        stages: vec![
            ValidationStage::Schema,
            ValidationStage::Compatibility,
            ValidationStage::CapabilityReview,
            ValidationStage::Signature,
            ValidationStage::Collision,
        ],
        requested_capabilities,
        trust: DEV_UNSIGNED.into(),
    })
}

pub fn digest_path(path: &Path) -> Result<String> {
    let mut files = Vec::new();
    collect_files(path, path, &mut files)?;
    files.sort();
    let mut hasher = blake3::Hasher::new();
    for relative in files {
        hasher.update(relative.to_string_lossy().as_bytes());
        hasher.update(&[0]);
        hasher.update(
            &std::fs::read(path.join(&relative))
                .with_context(|| format!("reading {}", relative.display()))?,
        );
        hasher.update(&[0]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

fn collect_files(root: &Path, path: &Path, output: &mut Vec<PathBuf>) -> Result<()> {
    if path.is_file() {
        output.push(path.strip_prefix(root)?.to_path_buf());
        return Ok(());
    }
    for entry in std::fs::read_dir(path)
        .with_context(|| format!("reading package directory {}", path.display()))?
    {
        let entry = entry?;
        let metadata = entry.file_type()?;
        anyhow::ensure!(
            !metadata.is_symlink(),
            "package directory contains symlink: {}",
            entry.path().display()
        );
        collect_files(root, &entry.path(), output)?;
    }
    Ok(())
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.split('.').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        })
}

fn valid_version(value: &str) -> bool {
    let core = value.split_once('-').map_or(value, |(core, _)| core);
    let parts: Vec<_> = core.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
}

fn validate_capability(value: &str) -> Result<()> {
    let authority = value
        .split_once(':')
        .map_or(value, |(authority, _)| authority);
    anyhow::ensure!(valid_id(authority), "invalid capability id {value}");
    Ok(())
}

/// Validate fields of an AppContribution that are trust-boundary inputs.
fn validate_app_contribution(app: &AppContribution) -> Result<()> {
    // listen must be exactly "dynamic" for APP-1.
    anyhow::ensure!(
        app.listen == "dynamic",
        "app {}: listen must be 'dynamic' in APP-1, got '{}'",
        app.id,
        app.listen
    );
    // Reject container runtime at schema time so callers get a clear error.
    if let AppRuntimeKind::Container = app.runtime {
        anyhow::bail!(
            "app {}: container runtime is not supported in APP-1",
            app.id
        );
    }
    // Entrypoint must be relative, no traversal.
    let ep = std::path::Path::new(&app.entrypoint);
    anyhow::ensure!(
        !ep.is_absolute(),
        "app {}: entrypoint must be relative",
        app.id
    );
    for component in ep.components() {
        anyhow::ensure!(
            matches!(component, std::path::Component::Normal(_)),
            "app {}: entrypoint contains path traversal",
            app.id
        );
    }
    // Health path must start with `/`, no CR/LF.
    anyhow::ensure!(
        app.health_path.starts_with('/')
            && !app.health_path.contains('\r')
            && !app.health_path.contains('\n'),
        "app {}: health_path must start with '/' and contain no CR/LF",
        app.id
    );
    // Env keys validation.
    for key in app.env.keys() {
        anyhow::ensure!(
            !key.is_empty()
                && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                && !key.starts_with(|c: char| c.is_ascii_digit()),
            "app {}: invalid env key '{key}'",
            app.id
        );
        anyhow::ensure!(
            key != "PORT",
            "app {}: PORT is reserved (envoy-owned)",
            app.id
        );
    }
    // Env value template validation: only ${app_state} allowed.
    for (key, value) in &app.env {
        if value.contains("${") {
            let expanded = value.replace("${app_state}", "");
            anyhow::ensure!(
                !expanded.contains("${"),
                "app {}: unknown template token in env.{key} value",
                app.id
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(extra: &str) -> PackageManifest {
        PackageManifest::parse_toml(&format!(
            r#"
[package]
id = "acme.tools"
name = "Acme tools"
version = "1.2.3"
publisher = "acme"
license = "MIT"
[compatibility]
olympus_api = "0.1"
platforms = ["*"]
[capabilities]
required = ["job.run"]
{extra}
"#
        ))
        .unwrap()
    }

    #[test]
    fn parses_all_typed_classes() {
        let parsed = manifest(
            r#"
[[contributions.session_tool_provider]]
id = "git"
provides = ["git.query"]
[contributions.session_tool_provider.definition]
command = "git-mcp"
[[contributions.skill]]
id = "review"
[contributions.skill.definition]
dir = "skills/review"
[[contributions.activity_provider]]
id = "build"
[[contributions.workflow_template]]
id = "release"
[[contributions.storage_provider]]
id = "db"
"#,
        );
        assert_eq!(parsed.contributions.all().len(), 5);
        assert_eq!(parsed.unsupported_classes(), vec!["storage_provider"]);
    }

    #[test]
    fn validation_pipeline_rejects_compat_and_collisions() {
        let package =
            manifest("[[contributions.activity_provider]]\nid='runner'\nprovides=['job.run']");
        let mut active = BTreeMap::new();
        active.insert("job.run".into(), "core.jobs".into());
        assert!(validate_install(&package, &active, &BTreeMap::new())
            .unwrap_err()
            .to_string()
            .contains("collision"));
        let mut bindings = BTreeMap::new();
        bindings.insert("job.run".into(), "acme.tools".into());
        assert_eq!(
            validate_install(&package, &active, &bindings)
                .unwrap()
                .trust,
            DEV_UNSIGNED
        );

        let unique =
            manifest("[[contributions.activity_provider]]\nid='runner'\nprovides=['ci.run']");
        let invalid_binding = BTreeMap::from([("ci.run".into(), "ghost.provider".into())]);
        assert!(validate_install(&unique, &active, &invalid_binding)
            .unwrap_err()
            .to_string()
            .contains("binding"));
    }

    #[test]
    fn directory_digest_is_order_independent_and_content_sensitive() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("b"), "two").unwrap();
        std::fs::write(dir.path().join("a"), "one").unwrap();
        let first = digest_path(dir.path()).unwrap();
        std::fs::write(dir.path().join("a"), "changed").unwrap();
        assert_ne!(first, digest_path(dir.path()).unwrap());
    }

    /// Every extension class parses, round-trips through the Contributions::all()
    /// iterator, and produces a valid manifest.
    #[test]
    fn all_ten_extension_classes_round_trip() {
        let toml = r#"
[package]
id = "acme.full"
name = "Acme full"
version = "0.1.0"
publisher = "acme"
license = "MIT"
[compatibility]
olympus_api = "*"
platforms = ["linux"]

[[contributions.activity_provider]]
id = "activity.a"
[[contributions.trigger_provider]]
id = "trigger.b"
[[contributions.resource_provider]]
id = "resource.c"
[[contributions.session_tool_provider]]
id = "mcp.d"
[contributions.session_tool_provider.definition]
command = "my-mcp"
[[contributions.runtime_adapter]]
id = "adapter.e"
[[contributions.embedded_app]]
id = "app.f"
[[contributions.indexer_extractor]]
id = "index.g"
[[contributions.policy_provider]]
id = "policy.h"
[[contributions.view_provider]]
id = "view.i"
[[contributions.storage_provider]]
id = "store.j"
[[contributions.skill]]
id = "skill.k"
[[contributions.workflow_template]]
id = "wf.l"
"#;
        let parsed = PackageManifest::parse_toml(toml).expect("parse all extension classes");
        // All 12 items (10 ADR 0012 classes + skill + workflow_template) appear.
        assert_eq!(parsed.contributions.all().len(), 12);

        // validate_schema must accept each (only id format matters here; we
        // use dot-separated slug ids to keep them valid).
        parsed
            .validate_schema()
            .expect("schema valid for all classes");

        // Re-serialise to JSON and back to Rust to confirm serde symmetry.
        let json = serde_json::to_string(&parsed).expect("serialize");
        let back: PackageManifest = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed, back);
    }

    /// Invalid contribution ids must produce an explicit validation error.
    #[test]
    fn invalid_contribution_id_rejected() {
        let toml_bad_id = r#"
[package]
id = "acme.tools"
name = "Acme tools"
version = "1.0.0"
publisher = "acme"
license = "MIT"
[compatibility]
olympus_api = "*"

[[contributions.activity_provider]]
id = "bad id with spaces"
"#;
        let parsed = PackageManifest::parse_toml(toml_bad_id).expect("parse");
        let err = parsed.validate_schema().unwrap_err().to_string();
        assert!(err.contains("invalid contribution id"), "got: {err}");
    }

    /// Duplicate contribution ids across extension classes must be caught.
    #[test]
    fn duplicate_contribution_id_rejected() {
        let toml_dup = r#"
[package]
id = "acme.tools"
name = "Acme tools"
version = "1.0.0"
publisher = "acme"
license = "MIT"
[compatibility]
olympus_api = "*"

[[contributions.activity_provider]]
id = "dup"
[[contributions.skill]]
id = "dup"
"#;
        let parsed = PackageManifest::parse_toml(toml_dup).expect("parse");
        let err = parsed.validate_schema().unwrap_err().to_string();
        assert!(err.contains("duplicate contribution id"), "got: {err}");
    }

    /// A manifest with an unknown field at the top-level must fail to parse
    /// (deny_unknown_fields enforces the contract boundary).
    #[test]
    fn unknown_top_level_field_rejected() {
        let toml_unknown = r#"
[package]
id = "acme.tools"
name = "Acme"
version = "1.0.0"
publisher = "acme"
license = "MIT"
extra_field = "boom"
[compatibility]
olympus_api = "*"
"#;
        assert!(
            PackageManifest::parse_toml(toml_unknown).is_err(),
            "unknown field should fail to parse"
        );
    }

    /// State namespace must start with plugin-state:// or be rejected.
    #[test]
    fn invalid_state_namespace_rejected() {
        let toml = r#"
[package]
id = "acme.tools"
name = "Acme"
version = "1.0.0"
publisher = "acme"
license = "MIT"
[compatibility]
olympus_api = "*"

[[contributions.activity_provider]]
id = "runner"
state_namespaces = ["bad://acme"]
"#;
        let parsed = PackageManifest::parse_toml(toml).expect("parse");
        let err = parsed.validate_schema().unwrap_err().to_string();
        assert!(err.contains("invalid plugin state namespace"), "got: {err}");
    }

    /// validate_compatibility must reject mismatched olympus_api and non-matching platforms.
    #[test]
    fn compatibility_rejects_incompatible_api_and_platform() {
        struct Case {
            api: &'static str,
            platform: &'static str,
            ok: bool,
        }
        let cases = [
            Case {
                api: "0.1",
                platform: "linux",
                ok: true,
            },
            Case {
                api: "*",
                platform: "linux",
                ok: true,
            },
            Case {
                api: "^0.1",
                platform: "linux",
                ok: true,
            },
            Case {
                api: "99.0",
                platform: "linux",
                ok: false,
            },
            Case {
                api: "0.1",
                platform: "windows",
                ok: false,
            },
        ];
        for case in &cases {
            let toml = format!(
                r#"
[package]
id = "acme.compat"
name = "Acme compat"
version = "1.0.0"
publisher = "acme"
license = "MIT"
[compatibility]
olympus_api = "{api}"
platforms = ["linux"]
"#,
                api = case.api,
            );
            let pkg = PackageManifest::parse_toml(&toml).expect("parse");
            let result = pkg.validate_compatibility("0.1", case.platform);
            assert_eq!(
                result.is_ok(),
                case.ok,
                "api={} platform={} expected ok={}: {:?}",
                case.api,
                case.platform,
                case.ok,
                result
            );
        }
    }

    /// validate_install returns dev-unsigned trust and does NOT auto-grant or activate.
    #[test]
    fn install_returns_dev_unsigned_without_granting_or_activating() {
        let pkg = manifest("");
        let report = validate_install(&pkg, &BTreeMap::new(), &BTreeMap::new()).unwrap();
        assert_eq!(report.trust, DEV_UNSIGNED);
        // requested capabilities are surfaced but NOT granted — callers must check separately.
        assert!(report.requested_capabilities.contains("job.run"));
    }

    /// Unsupported extension classes are correctly named by unsupported_classes().
    #[test]
    fn unsupported_classes_enumerated_correctly() {
        // workflow_template and activity_provider are v1-supported; storage_provider is not.
        let toml = r#"
[package]
id = "acme.mixed"
name = "Acme mixed"
version = "0.1.0"
publisher = "acme"
license = "MIT"
[compatibility]
olympus_api = "*"

[[contributions.session_tool_provider]]
id = "mcp.a"
[[contributions.skill]]
id = "skill.b"
[[contributions.workflow_template]]
id = "wf.c"
[[contributions.activity_provider]]
id = "act.d"
[[contributions.storage_provider]]
id = "store.e"
[[contributions.trigger_provider]]
id = "trig.f"
"#;
        let pkg = PackageManifest::parse_toml(toml).expect("parse");
        let unsupported = pkg.unsupported_classes();
        assert!(unsupported.contains(&"storage_provider"), "{unsupported:?}");
        assert!(unsupported.contains(&"trigger_provider"), "{unsupported:?}");
        // v1-supported classes must not appear.
        assert!(
            !unsupported.contains(&"session_tool_provider"),
            "{unsupported:?}"
        );
        assert!(!unsupported.contains(&"skill"), "{unsupported:?}");
        assert!(
            !unsupported.contains(&"workflow_template"),
            "{unsupported:?}"
        );
        assert!(
            !unsupported.contains(&"activity_provider"),
            "{unsupported:?}"
        );
    }

    // ── APP-1 contribution tests ──────────────────────────────────────────

    fn app_manifest(app_toml: &str) -> PackageManifest {
        PackageManifest::parse_toml(&format!(
            r#"
[package]
id = "acme.appkg"
name = "Acme app"
version = "1.0.0"
publisher = "acme"
license = "MIT"
[compatibility]
olympus_api = "*"
{app_toml}
"#
        ))
        .unwrap()
    }

    const VALID_APP: &str = r#"
[[contributions.apps]]
id = "acme.server"
runtime = "binary"
entrypoint = "bin/server"
listen = "dynamic"
health_path = "/health"
"#;

    #[test]
    fn apps_parse_and_validate() {
        let pkg = app_manifest(VALID_APP);
        pkg.validate_schema().expect("valid app must pass schema");
        assert_eq!(pkg.contributions.apps.len(), 1);
        let app = &pkg.contributions.apps[0];
        assert_eq!(app.id, "acme.server");
        assert_eq!(app.entrypoint, "bin/server");
    }

    #[test]
    fn apps_appear_in_unsupported_until_lifecycle_lands() {
        let pkg = app_manifest(VALID_APP);
        pkg.validate_schema().expect("schema valid");
        let unsupported = pkg.unsupported_classes();
        // Apps are in unsupported_classes until Hall lifecycle dispatch is added.
        assert!(unsupported.contains(&"apps"), "{unsupported:?}");
    }

    #[test]
    fn app_id_participates_in_duplicate_check() {
        let toml = r#"
[[contributions.activity_provider]]
id = "acme.server"

[[contributions.apps]]
id = "acme.server"
runtime = "binary"
entrypoint = "bin/app"
listen = "dynamic"
health_path = "/ok"
"#;
        let pkg = app_manifest(toml);
        let err = pkg.validate_schema().unwrap_err().to_string();
        assert!(err.contains("duplicate contribution id"), "got: {err}");
    }

    #[test]
    fn app_container_runtime_rejected() {
        let toml = r#"
[[contributions.apps]]
id = "acme.container-app"
runtime = "container"
entrypoint = "image:latest"
listen = "dynamic"
health_path = "/health"
"#;
        let pkg = app_manifest(toml);
        let err = pkg.validate_schema().unwrap_err().to_string();
        assert!(err.contains("container runtime"), "got: {err}");
    }

    #[test]
    fn app_invalid_listen_rejected() {
        let toml = r#"
[[contributions.apps]]
id = "acme.app"
runtime = "binary"
entrypoint = "bin/server"
listen = "fixed:8080"
health_path = "/health"
"#;
        let pkg = app_manifest(toml);
        let err = pkg.validate_schema().unwrap_err().to_string();
        assert!(err.contains("dynamic"), "got: {err}");
    }

    #[test]
    fn app_entrypoint_traversal_rejected() {
        let toml = r#"
[[contributions.apps]]
id = "acme.app"
runtime = "binary"
entrypoint = "../escape"
listen = "dynamic"
health_path = "/health"
"#;
        let pkg = app_manifest(toml);
        let err = pkg.validate_schema().unwrap_err().to_string();
        assert!(err.contains("traversal"), "got: {err}");
    }

    #[test]
    fn app_port_env_key_reserved() {
        let toml = r#"
[[contributions.apps]]
id = "acme.app"
runtime = "binary"
entrypoint = "bin/server"
listen = "dynamic"
health_path = "/health"

[contributions.apps.env]
PORT = "8080"
"#;
        let pkg = app_manifest(toml);
        let err = pkg.validate_schema().unwrap_err().to_string();
        assert!(err.contains("PORT"), "got: {err}");
    }

    #[test]
    fn app_unknown_template_token_rejected() {
        let toml = r#"
[[contributions.apps]]
id = "acme.app"
runtime = "binary"
entrypoint = "bin/server"
listen = "dynamic"
health_path = "/health"

[contributions.apps.env]
DATA_DIR = "${unknown}"
"#;
        let pkg = app_manifest(toml);
        let err = pkg.validate_schema().unwrap_err().to_string();
        assert!(err.contains("unknown template token"), "got: {err}");
    }

    #[test]
    fn app_valid_env_template_passes() {
        let toml = r#"
[[contributions.apps]]
id = "acme.app"
runtime = "binary"
entrypoint = "bin/server"
listen = "dynamic"
health_path = "/health"

[contributions.apps.env]
DATA_DIR = "${app_state}/data"
LOG_LEVEL = "info"
"#;
        let pkg = app_manifest(toml);
        pkg.validate_schema().expect("valid env template must pass");
    }

    #[test]
    fn app_round_trips_json() {
        let pkg = app_manifest(VALID_APP);
        pkg.validate_schema().expect("valid");
        let json = serde_json::to_string(&pkg).expect("serialize");
        let back: PackageManifest = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(pkg, back);
    }
}
