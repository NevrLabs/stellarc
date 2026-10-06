-- Terminology rename: workspace->organization, project->board
-- Idempotent (follows upstream 0006_rename_active_workspace_to_organization.sql pattern).
-- All identifiers validated <=63 chars. Longest: organization_member_org_id_organization_id_fk (45).
-- Order matters: tables first, then columns, then constraints, then indexes.

-- ============ 1. TABLES ============
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workspace')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organization') THEN
    ALTER TABLE "workspace" RENAME TO "organization";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workspace_member')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organization_member') THEN
    ALTER TABLE "workspace_member" RENAME TO "organization_member";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workspace_role')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organization_role') THEN
    ALTER TABLE "workspace_role" RENAME TO "organization_role";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='project')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='board') THEN
    ALTER TABLE "project" RENAME TO "board";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_notification_workspace_project')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_notification_org_board') THEN
    ALTER TABLE "user_notification_workspace_project" RENAME TO "user_notification_org_board";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_notification_workspace_rule')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_notification_org_rule') THEN
    ALTER TABLE "user_notification_workspace_rule" RENAME TO "user_notification_org_rule";
  END IF;
END $$;

-- ============ 2. COLUMNS ============
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset' AND column_name='project_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset' AND column_name='board_id') THEN
    ALTER TABLE "asset" RENAME COLUMN "project_id" TO "board_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset' AND column_name='workspace_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='asset' AND column_name='organization_id') THEN
    ALTER TABLE "asset" RENAME COLUMN "workspace_id" TO "organization_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='column' AND column_name='project_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='column' AND column_name='board_id') THEN
    ALTER TABLE "column" RENAME COLUMN "project_id" TO "board_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integration' AND column_name='project_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integration' AND column_name='board_id') THEN
    ALTER TABLE "integration" RENAME COLUMN "project_id" TO "board_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invitation' AND column_name='workspace_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invitation' AND column_name='organization_id') THEN
    ALTER TABLE "invitation" RENAME COLUMN "workspace_id" TO "organization_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='label' AND column_name='workspace_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='label' AND column_name='organization_id') THEN
    ALTER TABLE "label" RENAME COLUMN "workspace_id" TO "organization_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='board' AND column_name='workspace_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='board' AND column_name='organization_id') THEN
    ALTER TABLE "board" RENAME COLUMN "workspace_id" TO "organization_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='task' AND column_name='project_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='task' AND column_name='board_id') THEN
    ALTER TABLE "task" RENAME COLUMN "project_id" TO "board_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='team' AND column_name='workspace_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='team' AND column_name='organization_id') THEN
    ALTER TABLE "team" RENAME COLUMN "workspace_id" TO "organization_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_notification_org_board' AND column_name='project_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_notification_org_board' AND column_name='board_id') THEN
    ALTER TABLE "user_notification_org_board" RENAME COLUMN "project_id" TO "board_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_notification_org_board' AND column_name='workspace_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_notification_org_board' AND column_name='organization_id') THEN
    ALTER TABLE "user_notification_org_board" RENAME COLUMN "workspace_id" TO "organization_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_notification_org_board' AND column_name='workspace_rule_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_notification_org_board' AND column_name='org_rule_id') THEN
    ALTER TABLE "user_notification_org_board" RENAME COLUMN "workspace_rule_id" TO "org_rule_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_notification_org_rule' AND column_name='project_mode')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_notification_org_rule' AND column_name='board_mode') THEN
    ALTER TABLE "user_notification_org_rule" RENAME COLUMN "project_mode" TO "board_mode";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_notification_org_rule' AND column_name='workspace_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_notification_org_rule' AND column_name='organization_id') THEN
    ALTER TABLE "user_notification_org_rule" RENAME COLUMN "workspace_id" TO "organization_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workflow_rule' AND column_name='project_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workflow_rule' AND column_name='board_id') THEN
    ALTER TABLE "workflow_rule" RENAME COLUMN "project_id" TO "board_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_member' AND column_name='workspace_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_member' AND column_name='organization_id') THEN
    ALTER TABLE "organization_member" RENAME COLUMN "workspace_id" TO "organization_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_role' AND column_name='workspace_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_role' AND column_name='organization_id') THEN
    ALTER TABLE "organization_role" RENAME COLUMN "workspace_id" TO "organization_id";
  END IF;
END $$;

-- ============ 3. CONSTRAINTS ============
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asset_project_id_project_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asset_board_id_board_id_fk') THEN
    ALTER TABLE "asset" RENAME CONSTRAINT "asset_project_id_project_id_fk" TO "asset_board_id_board_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asset_workspace_id_workspace_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='asset_organization_id_organization_id_fk') THEN
    ALTER TABLE "asset" RENAME CONSTRAINT "asset_workspace_id_workspace_id_fk" TO "asset_organization_id_organization_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='column_project_id_project_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='column_board_id_board_id_fk') THEN
    ALTER TABLE "column" RENAME CONSTRAINT "column_project_id_project_id_fk" TO "column_board_id_board_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='integration_project_id_project_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='integration_board_id_board_id_fk') THEN
    ALTER TABLE "integration" RENAME CONSTRAINT "integration_project_id_project_id_fk" TO "integration_board_id_board_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='integration_project_type_unique') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='integration_board_type_unique') THEN
    ALTER TABLE "integration" RENAME CONSTRAINT "integration_project_type_unique" TO "integration_board_type_unique";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invitation_workspace_id_workspace_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invitation_organization_id_organization_id_fk') THEN
    ALTER TABLE "invitation" RENAME CONSTRAINT "invitation_workspace_id_workspace_id_fk" TO "invitation_organization_id_organization_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='label_workspace_id_workspace_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='label_organization_id_organization_id_fk') THEN
    ALTER TABLE "label" RENAME CONSTRAINT "label_workspace_id_workspace_id_fk" TO "label_organization_id_organization_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_pkey') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='board_pkey') THEN
    ALTER TABLE "board" RENAME CONSTRAINT "project_pkey" TO "board_pkey";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_workspace_id_id_unique') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='board_organization_id_id_unique') THEN
    ALTER TABLE "board" RENAME CONSTRAINT "project_workspace_id_id_unique" TO "board_organization_id_id_unique";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_workspace_id_workspace_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='board_organization_id_organization_id_fk') THEN
    ALTER TABLE "board" RENAME CONSTRAINT "project_workspace_id_workspace_id_fk" TO "board_organization_id_organization_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_project_id_project_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_board_id_board_id_fk') THEN
    ALTER TABLE "task" RENAME CONSTRAINT "task_project_id_project_id_fk" TO "task_board_id_board_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_project_number_unique') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_board_number_unique') THEN
    ALTER TABLE "task" RENAME CONSTRAINT "task_project_number_unique" TO "task_board_number_unique";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_workspace_id_workspace_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_organization_id_organization_id_fk') THEN
    ALTER TABLE "team" RENAME CONSTRAINT "team_workspace_id_workspace_id_fk" TO "team_organization_id_organization_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_notification_workspace_project_pkey') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unob_pkey') THEN
    ALTER TABLE "user_notification_org_board" RENAME CONSTRAINT "user_notification_workspace_project_pkey" TO "unob_pkey";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_notification_workspace_project_rule_project_unique') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unob_rule_board_unique') THEN
    ALTER TABLE "user_notification_org_board" RENAME CONSTRAINT "user_notification_workspace_project_rule_project_unique" TO "unob_rule_board_unique";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_notification_workspace_project_workspace_id_project_id_pro') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unob_org_board_fk') THEN
    ALTER TABLE "user_notification_org_board" RENAME CONSTRAINT "user_notification_workspace_project_workspace_id_project_id_pro" TO "unob_org_board_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_notification_workspace_project_workspace_id_workspace_id_f') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unob_org_fk') THEN
    ALTER TABLE "user_notification_org_board" RENAME CONSTRAINT "user_notification_workspace_project_workspace_id_workspace_id_f" TO "unob_org_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_notification_workspace_project_workspace_id_workspace_rule') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unob_org_rule_fk') THEN
    ALTER TABLE "user_notification_org_board" RENAME CONSTRAINT "user_notification_workspace_project_workspace_id_workspace_rule" TO "unob_org_rule_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_notification_workspace_rule_pkey') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unor_pkey') THEN
    ALTER TABLE "user_notification_org_rule" RENAME CONSTRAINT "user_notification_workspace_rule_pkey" TO "unor_pkey";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_notification_workspace_rule_user_id_user_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unor_user_id_user_id_fk') THEN
    ALTER TABLE "user_notification_org_rule" RENAME CONSTRAINT "user_notification_workspace_rule_user_id_user_id_fk" TO "unor_user_id_user_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_notification_workspace_rule_user_workspace_unique') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unor_user_org_unique') THEN
    ALTER TABLE "user_notification_org_rule" RENAME CONSTRAINT "user_notification_workspace_rule_user_workspace_unique" TO "unor_user_org_unique";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_notification_workspace_rule_workspace_id_id_unique') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unor_org_id_id_unique') THEN
    ALTER TABLE "user_notification_org_rule" RENAME CONSTRAINT "user_notification_workspace_rule_workspace_id_id_unique" TO "unor_org_id_id_unique";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_notification_workspace_rule_workspace_id_workspace_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unor_org_id_organization_id_fk') THEN
    ALTER TABLE "user_notification_org_rule" RENAME CONSTRAINT "user_notification_workspace_rule_workspace_id_workspace_id_fk" TO "unor_org_id_organization_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='workflow_rule_project_id_project_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='workflow_rule_board_id_board_id_fk') THEN
    ALTER TABLE "workflow_rule" RENAME CONSTRAINT "workflow_rule_project_id_project_id_fk" TO "workflow_rule_board_id_board_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='workspace_pkey') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organization_pkey') THEN
    ALTER TABLE "organization" RENAME CONSTRAINT "workspace_pkey" TO "organization_pkey";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='workspace_slug_unique') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organization_slug_unique') THEN
    ALTER TABLE "organization" RENAME CONSTRAINT "workspace_slug_unique" TO "organization_slug_unique";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='workspace_member_pkey') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organization_member_pkey') THEN
    ALTER TABLE "organization_member" RENAME CONSTRAINT "workspace_member_pkey" TO "organization_member_pkey";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='workspace_member_user_id_user_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organization_member_user_id_user_id_fk') THEN
    ALTER TABLE "organization_member" RENAME CONSTRAINT "workspace_member_user_id_user_id_fk" TO "organization_member_user_id_user_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='workspace_member_workspace_id_workspace_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organization_member_org_id_organization_id_fk') THEN
    ALTER TABLE "organization_member" RENAME CONSTRAINT "workspace_member_workspace_id_workspace_id_fk" TO "organization_member_org_id_organization_id_fk";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='workspace_role_pkey') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organization_role_pkey') THEN
    ALTER TABLE "organization_role" RENAME CONSTRAINT "workspace_role_pkey" TO "organization_role_pkey";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='workspace_role_workspace_id_workspace_id_fk') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='organization_role_org_id_organization_id_fk') THEN
    ALTER TABLE "organization_role" RENAME CONSTRAINT "workspace_role_workspace_id_workspace_id_fk" TO "organization_role_org_id_organization_id_fk";
  END IF;
END $$;

-- ============ 4. INDEXES ============
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='asset_projectId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='asset_boardId_idx') THEN
    ALTER INDEX "asset_projectId_idx" RENAME TO "asset_boardId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='asset_workspaceId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='asset_organizationId_idx') THEN
    ALTER INDEX "asset_workspaceId_idx" RENAME TO "asset_organizationId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='column_projectId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='column_boardId_idx') THEN
    ALTER INDEX "column_projectId_idx" RENAME TO "column_boardId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='integration_projectId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='integration_boardId_idx') THEN
    ALTER INDEX "integration_projectId_idx" RENAME TO "integration_boardId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='invitation_workspaceId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='invitation_organizationId_idx') THEN
    ALTER INDEX "invitation_workspaceId_idx" RENAME TO "invitation_organizationId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='label_workspace_id_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='label_organization_id_idx') THEN
    ALTER INDEX "label_workspace_id_idx" RENAME TO "label_organization_id_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='label_workspace_name_unique') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='label_organization_name_unique') THEN
    ALTER INDEX "label_workspace_name_unique" RENAME TO "label_organization_name_unique";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='task_projectId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='task_boardId_idx') THEN
    ALTER INDEX "task_projectId_idx" RENAME TO "task_boardId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='team_workspaceId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='team_organizationId_idx') THEN
    ALTER INDEX "team_workspaceId_idx" RENAME TO "team_organizationId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='unwp_workspaceId_workspaceRuleId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='unob_organizationId_orgRuleId_idx') THEN
    ALTER INDEX "unwp_workspaceId_workspaceRuleId_idx" RENAME TO "unob_organizationId_orgRuleId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='user_notification_workspace_project_projectId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='unob_boardId_idx') THEN
    ALTER INDEX "user_notification_workspace_project_projectId_idx" RENAME TO "unob_boardId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='user_notification_workspace_project_ruleId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='unob_ruleId_idx') THEN
    ALTER INDEX "user_notification_workspace_project_ruleId_idx" RENAME TO "unob_ruleId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='user_notification_workspace_project_workspaceId_projectId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='unob_organizationId_boardId_idx') THEN
    ALTER INDEX "user_notification_workspace_project_workspaceId_projectId_idx" RENAME TO "unob_organizationId_boardId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='user_notification_workspace_rule_userId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='unor_userId_idx') THEN
    ALTER INDEX "user_notification_workspace_rule_userId_idx" RENAME TO "unor_userId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='user_notification_workspace_rule_workspaceId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='unor_organizationId_idx') THEN
    ALTER INDEX "user_notification_workspace_rule_workspaceId_idx" RENAME TO "unor_organizationId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='workflow_rule_projectId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='workflow_rule_boardId_idx') THEN
    ALTER INDEX "workflow_rule_projectId_idx" RENAME TO "workflow_rule_boardId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='workspace_member_userId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='organization_member_userId_idx') THEN
    ALTER INDEX "workspace_member_userId_idx" RENAME TO "organization_member_userId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='workspace_member_workspaceId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='organization_member_organizationId_idx') THEN
    ALTER INDEX "workspace_member_workspaceId_idx" RENAME TO "organization_member_organizationId_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='workspace_role_role_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='organization_role_role_idx') THEN
    ALTER INDEX "workspace_role_role_idx" RENAME TO "organization_role_role_idx";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='workspace_role_workspaceId_idx') AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='organization_role_organizationId_idx') THEN
    ALTER INDEX "workspace_role_workspaceId_idx" RENAME TO "organization_role_organizationId_idx";
  END IF;
END $$;

