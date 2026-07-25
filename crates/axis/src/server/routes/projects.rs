//! Project (context container) routes (`/api/projects/**`).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;

use super::support::append_and_apply_events;
use crate::server::dto::ProjectDto;
use crate::server::principal::OrgScope;
use crate::server::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/projects", get(list_projects).post(create_project))
        .route(
            "/api/projects/{id}",
            get(get_project).patch(patch_project).delete(delete_project),
        )
        .route("/api/projects/{id}/layout", put(put_project_layout))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateProjectBody {
    name: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PatchProjectBody {
    name: Option<String>,
    vaults: Option<Vec<String>>,
    repos: Option<Vec<String>>,
    boards: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PutProjectLayoutBody {
    layout: serde_json::Value,
}

const MAX_LAYOUT_BYTES: usize = 64 * 1024;

async fn apply_existing_project_event(
    state: &AppState,
    scope: &Option<axum::extract::Extension<OrgScope>>,
    project_id: &str,
    event: crate::event::Event,
) -> Result<Option<ProjectDto>, Response> {
    let mut views = state.views.write().await;
    if views.projects.get(project_id).is_none_or(|project| {
        scope
            .as_ref()
            .is_some_and(|scope| project.org_id != scope.0.organization_id)
    }) {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "not_found", "message": "project not found" })),
        )
            .into_response());
    }
    if let Err(error) = state.log.append(&event) {
        tracing::error!(%error, project_id, "failed to persist project event");
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "failed to persist event").into_response());
    }
    views.apply(&event);
    Ok(views.projects.get(project_id).map(ProjectDto::from_row))
}

pub(crate) async fn put_project_layout(
    State(state): State<AppState>,
    scope: Option<axum::extract::Extension<OrgScope>>,
    Path(id): Path<String>,
    Json(body): Json<PutProjectLayoutBody>,
) -> Response {
    if serde_json::to_vec(&body.layout).map_or(true, |bytes| bytes.len() > MAX_LAYOUT_BYTES) {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({ "error": "layout_too_large", "message": "layout exceeds 64 KiB" })),
        )
            .into_response();
    }
    let event = crate::event::Event::ProjectLayoutUpdated {
        project_id: id.clone(),
        layout: body.layout,
        updated_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_secs_f64())
            .unwrap_or(0.0),
    };
    match apply_existing_project_event(&state, &scope, &id, event).await {
        Ok(Some(project)) => Json(project).into_response(),
        Ok(None) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        Err(response) => response,
    }
}

pub(crate) async fn list_projects(
    State(state): State<AppState>,
    scope: Option<axum::extract::Extension<OrgScope>>,
) -> Response {
    let views = state.views.read().await;
    let rows: Vec<ProjectDto> = views
        .projects
        .list()
        .into_iter()
        .filter(|row| {
            scope
                .as_ref()
                .is_none_or(|scope| row.org_id == scope.0.organization_id)
        })
        .map(ProjectDto::from_row)
        .collect();
    Json(json!({ "projects": rows, "total": rows.len() })).into_response()
}

pub(crate) async fn get_project(
    State(state): State<AppState>,
    scope: Option<axum::extract::Extension<OrgScope>>,
    Path(id): Path<String>,
) -> Response {
    let views = state.views.read().await;
    match views.projects.get(&id) {
        Some(row)
            if scope
                .as_ref()
                .is_none_or(|scope| row.org_id == scope.0.organization_id) =>
        {
            Json(ProjectDto::from_row(row)).into_response()
        }
        None | Some(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "not_found", "message": "project not found" })),
        )
            .into_response(),
    }
}

pub(crate) async fn create_project(
    State(state): State<AppState>,
    scope: Option<axum::extract::Extension<OrgScope>>,
    Json(body): Json<CreateProjectBody>,
) -> Response {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "invalid", "message": "name is required" })),
        )
            .into_response();
    }
    let project_id = uuid::Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0);
    let event = crate::event::Event::ProjectCreated {
        project_id: project_id.clone(),
        name: name.clone(),
        created_at: now,
    };
    // Persist manifest to disk (best-effort; event is the source of truth).
    let _ = state.projects.create(&project_id, &name, now);
    let mut events = vec![event];
    if let Some(scope) = scope {
        events.push(crate::event::Event::ProjectOrganizationAssigned {
            project_id: project_id.clone(),
            organization_id: scope.0.organization_id,
        });
    }
    if let Err(response) = append_and_apply_events(&state, &events).await {
        return response;
    }
    let views = state.views.read().await;
    match views.projects.get(&project_id) {
        Some(row) => (StatusCode::CREATED, Json(ProjectDto::from_row(row))).into_response(),
        None => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub(crate) async fn patch_project(
    State(state): State<AppState>,
    scope: Option<axum::extract::Extension<OrgScope>>,
    Path(id): Path<String>,
    Json(body): Json<PatchProjectBody>,
) -> Response {
    let manifest_name = body.name.clone();
    let manifest_vaults = body.vaults.clone();
    let manifest_repos = body.repos.clone();
    let manifest_boards = body.boards.clone();
    let event = crate::event::Event::ProjectUpdated {
        project_id: id.clone(),
        name: body.name,
        vaults: body.vaults,
        repos: body.repos,
        boards: body.boards,
    };
    match apply_existing_project_event(&state, &scope, &id, event).await {
        Ok(Some(project)) => {
            // The event log is authoritative; the manifest is a convenience mirror.
            let _ = state.projects.update(
                &id,
                manifest_name.as_deref(),
                manifest_vaults.as_deref(),
                manifest_repos.as_deref(),
                manifest_boards.as_deref(),
            );
            Json(project).into_response()
        }
        Ok(None) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        Err(response) => response,
    }
}

pub(crate) async fn delete_project(
    State(state): State<AppState>,
    scope: Option<axum::extract::Extension<OrgScope>>,
    Path(id): Path<String>,
) -> Response {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0);
    let event = crate::event::Event::ProjectDeleted {
        project_id: id.clone(),
        deleted_at: now,
    };
    match apply_existing_project_event(&state, &scope, &id, event).await {
        Ok(None) => StatusCode::NO_CONTENT.into_response(),
        Ok(Some(_)) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        Err(response) => response,
    }
}
