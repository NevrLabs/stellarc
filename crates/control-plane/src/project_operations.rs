//! Typed read-only project operations shared by agent-facing adapters.

use std::fs;
use std::path::{Component, Path};

use serde::{Deserialize, Serialize};

use crate::auth_store::AuthStore;
use crate::projects::ProjectStore;
use crate::server::dto::CardDto;
use crate::views::{CardFilters, ViewManager};

pub const PROJECT_OPERATION_IDS: [&str; 6] = [
    "project.context.list",
    "project.context.read",
    "project.board.list",
    "project.card.list",
    "project.card.read",
    "project.card.comments",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationContext {
    pub session_id: String,
    pub acting_user_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCapabilitySet {
    pub allowed_project_refs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case")]
pub enum ProjectOperation {
    #[serde(rename = "project.context.list")]
    ContextList { project_ref: String },
    #[serde(rename = "project.context.read")]
    ContextRead { project_ref: String, path: String },
    #[serde(rename = "project.board.list")]
    BoardList { project_ref: String },
    #[serde(rename = "project.card.list")]
    CardList {
        project_ref: String,
        board_ref: String,
    },
    #[serde(rename = "project.card.read")]
    CardRead {
        project_ref: String,
        card_ref: String,
    },
    #[serde(rename = "project.card.comments")]
    CardComments {
        project_ref: String,
        card_ref: String,
    },
}

impl ProjectOperation {
    pub fn project_ref(&self) -> &str {
        match self {
            Self::ContextList { project_ref }
            | Self::ContextRead { project_ref, .. }
            | Self::BoardList { project_ref }
            | Self::CardList { project_ref, .. }
            | Self::CardRead { project_ref, .. }
            | Self::CardComments { project_ref, .. } => project_ref,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextFile {
    pub path: String,
    pub markdown: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCard {
    #[serde(flatten)]
    pub fields: CardDto,
    pub description_markdown: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum ProjectOperationResult {
    ContextPaths(Vec<String>),
    ContextFile(ContextFile),
    Boards(Vec<String>),
    Cards(Vec<CardDto>),
    Card(Box<ProjectCard>),
    Comments(Vec<serde_json::Value>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationErrorCode {
    CapabilityDenied,
    NotFound,
    BackendUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OperationError {
    pub code: OperationErrorCode,
    pub message: String,
}

impl OperationError {
    fn denied(message: impl Into<String>) -> Self {
        Self {
            code: OperationErrorCode::CapabilityDenied,
            message: message.into(),
        }
    }

    fn not_found(resource: &str) -> Self {
        Self {
            code: OperationErrorCode::NotFound,
            message: format!("{resource} not found"),
        }
    }

    fn backend(error: impl std::fmt::Display) -> Self {
        Self {
            code: OperationErrorCode::BackendUnavailable,
            message: error.to_string(),
        }
    }
}

pub struct ProjectOperations<'a> {
    views: &'a ViewManager,
    projects: &'a ProjectStore,
    auth: &'a AuthStore,
}

impl<'a> ProjectOperations<'a> {
    pub fn new(views: &'a ViewManager, projects: &'a ProjectStore, auth: &'a AuthStore) -> Self {
        Self {
            views,
            projects,
            auth,
        }
    }

    /// Recomputed from live session edges for every admission. ADR 0030 starts
    /// with the primary edge; context-project edges extend this list later.
    pub fn capabilities_for_session(&self, session_id: &str) -> ProjectCapabilitySet {
        ProjectCapabilitySet {
            allowed_project_refs: self
                .views
                .sessions
                .get(session_id)
                .and_then(|session| session.project_id.clone())
                .into_iter()
                .collect(),
        }
    }

    pub fn execute(
        &self,
        context: &OperationContext,
        operation: ProjectOperation,
    ) -> Result<ProjectOperationResult, OperationError> {
        let project = self
            .views
            .projects
            .get(operation.project_ref())
            .ok_or_else(|| OperationError::not_found("project"))?;
        let session = self
            .views
            .sessions
            .get(&context.session_id)
            .ok_or_else(|| OperationError::denied("session has no project capability set"))?;
        if !self
            .capabilities_for_session(&context.session_id)
            .allowed_project_refs
            .contains(&project.project_id)
        {
            return Err(OperationError::denied(
                "project is outside the session capability set",
            ));
        }
        if session.org_id != project.org_id
            || !self
                .auth
                .user_has_organization(&context.acting_user_id, &project.org_id)
                .map_err(OperationError::backend)?
        {
            return Err(OperationError::denied(
                "current user access to project is denied",
            ));
        }

        match operation {
            ProjectOperation::ContextList { project_ref } => self
                .list_context(&project_ref)
                .map(ProjectOperationResult::ContextPaths),
            ProjectOperation::ContextRead { project_ref, path } => self
                .read_context(&project_ref, &path)
                .map(ProjectOperationResult::ContextFile),
            ProjectOperation::BoardList { .. } => {
                Ok(ProjectOperationResult::Boards(project.boards.clone()))
            }
            ProjectOperation::CardList { board_ref, .. } => {
                self.require_board(project.boards.as_slice(), &board_ref)?;
                Ok(ProjectOperationResult::Cards(
                    self.views
                        .cards
                        .list(&CardFilters {
                            organization_id: Some(project.org_id.clone()),
                            board_id: Some(board_ref),
                            status: None,
                        })
                        .into_iter()
                        .map(CardDto::from_row)
                        .collect(),
                ))
            }
            ProjectOperation::CardRead { card_ref, .. } => self
                .read_card(&project.project_id, &project.boards, &card_ref)
                .map(Box::new)
                .map(ProjectOperationResult::Card),
            ProjectOperation::CardComments { card_ref, .. } => {
                self.read_card(&project.project_id, &project.boards, &card_ref)?;
                // Legacy Hall cards have no comment backend yet. Empty is the
                // canonical read result until ADR 0026 board providers land.
                Ok(ProjectOperationResult::Comments(Vec::new()))
            }
        }
    }

    fn require_board(&self, boards: &[String], board_ref: &str) -> Result<(), OperationError> {
        if boards.iter().any(|board| board == board_ref) {
            Ok(())
        } else {
            Err(OperationError::not_found("board"))
        }
    }

    fn read_card(
        &self,
        project_ref: &str,
        boards: &[String],
        card_ref: &str,
    ) -> Result<ProjectCard, OperationError> {
        let card = self
            .views
            .cards
            .get(card_ref)
            .ok_or_else(|| OperationError::not_found("card"))?;
        self.require_board(boards, &card.board_id)?;
        let description = self
            .projects
            .project_dir(project_ref)
            .join("boards")
            .join(&card.board_id)
            .join("cards")
            .join(format!("{}.md", card.card_id));
        let description_markdown = match fs::read_to_string(description) {
            Ok(markdown) => markdown,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(error) => return Err(OperationError::backend(error)),
        };
        Ok(ProjectCard {
            fields: CardDto::from_row(card),
            description_markdown,
        })
    }

    fn list_context(&self, project_ref: &str) -> Result<Vec<String>, OperationError> {
        let root = self.projects.project_dir(project_ref);
        let mut paths = Vec::new();
        for relative in ["README.md", "context", "docs"] {
            collect_context_paths(&root, Path::new(relative), &mut paths)?;
        }
        paths.sort();
        Ok(paths)
    }

    fn read_context(&self, project_ref: &str, path: &str) -> Result<ContextFile, OperationError> {
        if !allowed_context_path(path) {
            return Err(OperationError::denied(
                "path is outside project context content",
            ));
        }
        let root = self.projects.project_dir(project_ref);
        let full = root.join(path);
        let metadata = fs::symlink_metadata(&full).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                OperationError::not_found("context file")
            } else {
                OperationError::backend(error)
            }
        })?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(OperationError::denied("context path is not a regular file"));
        }
        if metadata.len() > 1024 * 1024 {
            return Err(OperationError::denied("context file exceeds 1 MiB"));
        }
        let markdown = fs::read_to_string(full).map_err(OperationError::backend)?;
        Ok(ContextFile {
            path: path.to_string(),
            markdown,
        })
    }
}

fn allowed_context_path(path: &str) -> bool {
    let path = Path::new(path);
    if path.extension().and_then(|extension| extension.to_str()) != Some("md")
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return false;
    }
    path == Path::new("README.md") || path.starts_with("context") || path.starts_with("docs")
}

fn collect_context_paths(
    root: &Path,
    relative: &Path,
    output: &mut Vec<String>,
) -> Result<(), OperationError> {
    let full = root.join(relative);
    let metadata = match fs::symlink_metadata(&full) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(OperationError::backend(error)),
    };
    if metadata.file_type().is_symlink() {
        return Ok(());
    }
    if metadata.is_file() {
        let relative = relative.to_string_lossy().replace('\\', "/");
        if allowed_context_path(&relative) {
            output.push(relative);
        }
        return Ok(());
    }
    if !metadata.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(full).map_err(OperationError::backend)? {
        let entry = entry.map_err(OperationError::backend)?;
        collect_context_paths(root, &relative.join(entry.file_name()), output)?;
    }
    Ok(())
}
