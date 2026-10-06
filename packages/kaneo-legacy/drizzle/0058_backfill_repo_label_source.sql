UPDATE "label" AS l
SET "source" = 'repo'
WHERE l."task_id" IS NOT NULL
  AND l."source" = 'kaneo'
  AND EXISTS (
    SELECT 1
    FROM "external_link" AS el
    INNER JOIN "integration" AS i ON i."id" = el."integration_id"
    WHERE el."task_id" = l."task_id"
      AND el."resource_type" = 'issue'
      AND i."type" = 'github'
  );