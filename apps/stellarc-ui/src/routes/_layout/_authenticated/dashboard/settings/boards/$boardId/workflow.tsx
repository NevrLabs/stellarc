import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import ColumnEditor from "@/components/board/column-editor";
import WorkflowEditor from "@/components/board/workflow-editor";
import PageTitle from "@/components/page-title";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/boards/$boardId/workflow",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { boardId } = Route.useParams();

  return (
    <>
      <PageTitle title={t("settings:boardWorkflow.pageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {t("settings:boardWorkflow.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("settings:boardWorkflow.subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:boardWorkflow.columnsTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:boardWorkflow.columnsDescription")}
            </p>
          </div>
          <ColumnEditor boardId={boardId} />
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:boardWorkflow.automationTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:boardWorkflow.automationDescription")}
            </p>
          </div>
          <WorkflowEditor boardId={boardId} />
        </div>
      </div>
    </>
  );
}
