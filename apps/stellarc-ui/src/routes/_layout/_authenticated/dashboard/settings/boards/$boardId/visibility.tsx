import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { ResourceGrantEditor } from "@/components/resource-grant-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import useUpdateBoard from "@/hooks/mutations/board/use-update-board";
import useGetBoard from "@/hooks/queries/board/use-get-board";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/boards/$boardId/visibility",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { boardId } = useParams({ strict: false });
  const { data: organization } = useActiveOrganization();
  const { data: board } = useGetBoard({
    id: boardId || "",
    organizationId: organization?.id || "",
  });

  const queryClient = useQueryClient();
  const { mutateAsync: updateBoard } = useUpdateBoard();
  const { hasPermission } = useOrganizationPermission();
  const savingRef = useRef(false);
  // `board:share` isn't in CAPABILITIES (only admin/owner/custom roles
  // with it can flip visibility), so use the generic server check. Result
  // isn't cached, but visibility is a rarely-toggled setting page.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void hasPermission({ board: ["share"] }).then((ok) => {
      if (!cancelled) setCanShare(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [hasPermission]);

  const handleToggle = useCallback(async () => {
    if (!board) return;
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await updateBoard({
        id: board.id,
        name: board.name,
        slug: board.slug,
        description: board.description || "",
        icon: board.icon || "Layout",
        isPublic: !board.isPublic,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["boards"] }),
        queryClient.invalidateQueries({
          queryKey: ["boards", organization?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["boards", organization?.id, board.id],
        }),
      ]);
      toast.success(t("settings:boardVisibility.toastUpdated"));
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("settings:boardVisibility.toastUpdateError"),
      );
    } finally {
      savingRef.current = false;
    }
  }, [board, updateBoard, queryClient, organization?.id, t]);

  const origin = window.location.origin;

  const publicUrl = board?.id ? `${origin}/public-board/${board.id}` : "";

  return (
    <>
      <PageTitle title={t("settings:boardVisibility.pageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {t("settings:boardVisibility.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("settings:boardVisibility.subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:boardVisibility.sectionTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:boardVisibility.sectionSubtitle")}
            </p>
          </div>

          <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  {t("settings:boardVisibility.publicAccess")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings:boardVisibility.publicAccessHint")}
                </p>
              </div>
              <Switch
                checked={!!board?.isPublic}
                onCheckedChange={canShare ? handleToggle : undefined}
                disabled={!canShare}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  {t("settings:boardVisibility.publicUrl")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings:boardVisibility.publicUrlHint")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={publicUrl} className="w-96" />
                <Button
                  size="sm"
                  onClick={() => {
                    if (!publicUrl) return;
                    navigator.clipboard
                      .writeText(publicUrl)
                      .then(() =>
                        toast.success(
                          t("settings:boardVisibility.copiedToast"),
                        ),
                      );
                  }}
                >
                  {t("settings:boardVisibility.copy")}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {board?.id && organization?.id ? (
          <ResourceGrantEditor
            organizationId={organization.id}
            resourceType="board"
            resourceId={board.id}
            disabled={!canShare}
          />
        ) : null}
      </div>
    </>
  );
}
