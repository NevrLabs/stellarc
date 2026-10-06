-- Fresh databases apply 0026 (journal order) before 0025 creates the table;
-- guard on existence so new installs succeed. Existing databases already
-- recorded this migration and never re-run it.
DO $$
BEGIN
  IF to_regclass('public.user_notification_preference') IS NOT NULL THEN
    UPDATE "user_notification_preference" SET "ntfy_token" = NULL
     WHERE "ntfy_token" IS NOT NULL AND "ntfy_token" NOT LIKE 'enc:v1:%';
    UPDATE "user_notification_preference" SET "gotify_token" = NULL
     WHERE "gotify_token" IS NOT NULL AND "gotify_token" NOT LIKE 'enc:v1:%';
    UPDATE "user_notification_preference" SET "webhook_secret" = NULL
     WHERE "webhook_secret" IS NOT NULL AND "webhook_secret" NOT LIKE 'enc:v1:%';
  END IF;
END $$;
