use std::sync::Arc;

use olympus_control_plane::auth_store::AuthStore;
use olympus_control_plane::event::Event;
use olympus_control_plane::project_operations::{
    OperationContext, OperationErrorCode, ProjectOperation, ProjectOperationResult,
    ProjectOperations,
};
use olympus_control_plane::projects::ProjectStore;
use olympus_control_plane::views::ViewManager;

struct Fixture {
    auth: Arc<AuthStore>,
    projects: ProjectStore,
    views: ViewManager,
    user_id: String,
}

impl Fixture {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap().keep();
        let auth = Arc::new(AuthStore::open_in_memory().unwrap());
        auth.bootstrap_admin("owner", "password-123", "acme", "Acme")
            .unwrap();
        let user = auth.authenticate("owner", "password-123").unwrap().unwrap();
        let org = auth
            .organizations_for_user(&user.user_id)
            .unwrap()
            .remove(0);
        let projects = ProjectStore::new(root.join("acme"));
        projects.create("primary", "Primary", 1.0).unwrap();
        std::fs::create_dir_all(projects.project_dir("primary").join("context")).unwrap();
        std::fs::write(
            projects.project_dir("primary").join("README.md"),
            "# Primary\n",
        )
        .unwrap();
        std::fs::write(
            projects
                .project_dir("primary")
                .join("context/conventions.md"),
            "# Conventions\n",
        )
        .unwrap();

        let mut views = ViewManager::new();
        for event in [
            Event::ProjectCreated {
                project_id: "primary".into(),
                name: "Primary".into(),
                created_at: 1.0,
            },
            Event::ProjectOrganizationAssigned {
                project_id: "primary".into(),
                organization_id: org.id.clone(),
            },
            Event::ProjectCreated {
                project_id: "other".into(),
                name: "Other".into(),
                created_at: 1.0,
            },
            Event::ProjectOrganizationAssigned {
                project_id: "other".into(),
                organization_id: org.id.clone(),
            },
            Event::ProjectUpdated {
                project_id: "primary".into(),
                name: None,
                vaults: None,
                repos: None,
                boards: Some(vec!["board-a".into()]),
            },
            Event::SessionCreated {
                session_id: "session-a".into(),
                hermes_id: "hermes-a".into(),
                source: "olympus".into(),
                model: None,
                title: None,
                started_at: 1.0,
                message_count: 0,
                input_tokens: 0,
                output_tokens: 0,
                agent: None,
                node: None,
            },
            Event::SessionOrganizationAssigned {
                session_id: "session-a".into(),
                organization_id: org.id,
            },
            Event::SessionProjectAttached {
                session_id: "session-a".into(),
                project_id: "primary".into(),
                attached_at: 1.0,
            },
            Event::CardCreated {
                card_id: "card-a".into(),
                board_id: "board-a".into(),
                title: "Ship it".into(),
                created_at: 1.0,
            },
        ] {
            views.apply(&event);
        }

        Self {
            auth,
            projects,
            views,
            user_id: user.user_id,
        }
    }

    fn service(&self) -> ProjectOperations<'_> {
        ProjectOperations::new(&self.views, &self.projects, &self.auth)
    }

    fn context(&self) -> OperationContext {
        OperationContext {
            session_id: "session-a".into(),
            acting_user_id: self.user_id.clone(),
        }
    }
}

#[test]
fn primary_project_read_operations_share_one_authorization_seam() {
    let fixture = Fixture::new();
    let service = fixture.service();
    let context = fixture.context();
    assert_eq!(
        service
            .capabilities_for_session("session-a")
            .allowed_project_refs,
        vec!["primary"]
    );

    let cases = [
        ProjectOperation::ContextList {
            project_ref: "primary".into(),
        },
        ProjectOperation::ContextRead {
            project_ref: "primary".into(),
            path: "context/conventions.md".into(),
        },
        ProjectOperation::BoardList {
            project_ref: "primary".into(),
        },
        ProjectOperation::CardList {
            project_ref: "primary".into(),
            board_ref: "board-a".into(),
        },
        ProjectOperation::CardRead {
            project_ref: "primary".into(),
            card_ref: "card-a".into(),
        },
        ProjectOperation::CardComments {
            project_ref: "primary".into(),
            card_ref: "card-a".into(),
        },
    ];

    for operation in cases {
        service.execute(&context, operation).unwrap();
    }
    assert!(matches!(
        service
            .execute(
                &context,
                ProjectOperation::ContextRead {
                    project_ref: "primary".into(),
                    path: "README.md".into(),
                },
            )
            .unwrap(),
        ProjectOperationResult::ContextFile(file) if file.markdown == "# Primary\n"
    ));
}

#[test]
fn project_ref_outside_primary_scope_is_capability_denied() {
    let fixture = Fixture::new();
    let error = fixture
        .service()
        .execute(
            &fixture.context(),
            ProjectOperation::BoardList {
                project_ref: "other".into(),
            },
        )
        .unwrap_err();
    assert_eq!(error.code, OperationErrorCode::CapabilityDenied);
}

#[test]
fn current_user_access_is_rechecked_on_every_call() {
    let fixture = Fixture::new();
    let org_id = fixture
        .views
        .projects
        .get("primary")
        .unwrap()
        .org_id
        .clone();
    fixture
        .auth
        .revoke_organization_membership(&fixture.user_id, &org_id)
        .unwrap();
    let error = fixture
        .service()
        .execute(
            &fixture.context(),
            ProjectOperation::BoardList {
                project_ref: "primary".into(),
            },
        )
        .unwrap_err();
    assert_eq!(error.code, OperationErrorCode::CapabilityDenied);
}

#[test]
fn unknown_project_board_card_and_context_file_are_not_found() {
    let fixture = Fixture::new();
    let context = fixture.context();
    let service = fixture.service();
    for operation in [
        ProjectOperation::BoardList {
            project_ref: "missing".into(),
        },
        ProjectOperation::CardList {
            project_ref: "primary".into(),
            board_ref: "missing".into(),
        },
        ProjectOperation::CardRead {
            project_ref: "primary".into(),
            card_ref: "missing".into(),
        },
        ProjectOperation::ContextRead {
            project_ref: "primary".into(),
            path: "context/missing.md".into(),
        },
    ] {
        let error = service.execute(&context, operation).unwrap_err();
        assert_eq!(error.code, OperationErrorCode::NotFound);
    }
}

#[test]
fn context_read_rejects_paths_outside_promoted_project_content() {
    let fixture = Fixture::new();
    for path in ["project.json", "../secret.md", "repos/private.md"] {
        let error = fixture
            .service()
            .execute(
                &fixture.context(),
                ProjectOperation::ContextRead {
                    project_ref: "primary".into(),
                    path: path.into(),
                },
            )
            .unwrap_err();
        assert_eq!(error.code, OperationErrorCode::CapabilityDenied);
    }
}
