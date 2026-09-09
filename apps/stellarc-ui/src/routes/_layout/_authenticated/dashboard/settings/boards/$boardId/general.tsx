import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { BoardDefaultAssignee } from "@/components/board/board-default-assignee";
import { TasksImportExport } from "@/components/board/tasks-import-export.tsx";
import BoardIconPicker from "@/components/common/board-icon-picker";
import PageTitle from "@/components/page-title";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import useDeleteBoard from "@/hooks/mutations/board/use-delete-board";
import useUpdateBoard from "@/hooks/mutations/board/use-update-board";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";
import useBoardStore from "@/store/board.ts";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/boards/$boardId/general",
)({
  component: RouteComponent,
});

type BoardFormValues = {
  name: string;
  slug: string;
  description?: string;
  icon: string;
  subtaskDepthLimit: number;
};

type NormalizedBoardValues = {
  name: string;
  slug: string;
  description: string;
  icon: string;
  subtaskDepthLimit: number;
};

function normalizeBoardValues(data: BoardFormValues): NormalizedBoardValues {
  return {
    name: data.name.trim(),
    slug: data.slug.trim(),
    description: (data.description ?? "").trim(),
    icon: data.icon || "Layout",
    subtaskDepthLimit: data.subtaskDepthLimit,
  };
}

function RouteComponent() {
  const { t } = useTranslation();
  const boardSchema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .min(1, t("settings:boardGeneral.validation.nameRequired"))
          .min(2, t("settings:boardGeneral.validation.nameShort")),
        slug: z
          .string()
          .min(1, t("settings:boardGeneral.validation.keyRequired"))
          .min(2, t("settings:boardGeneral.validation.keyShort"))
          .max(8, t("settings:boardGeneral.validation.keyMax")),
        description: z.string().optional(),
        icon: z
          .string()
          .min(1, t("settings:boardGeneral.validation.iconRequired")),
        subtaskDepthLimit: z.number().int().min(1).max(4),
      }),
    [t],
  );

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const queuedSaveRef = useRef<BoardFormValues | null>(null);
  const lastSavedRef = useRef<NormalizedBoardValues | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { data: organization } = useActiveOrganization();
  const { boardId: rawBoardId } = useParams({ strict: false });
  const boardId = rawBoardId ?? "";
  const { data: fetchedBoard } = useGetTasks(boardId);
  const { board, setBoard } = useBoardStore();

  useEffect(() => {
    if (fetchedBoard) {
      setBoard(fetchedBoard);
    }
  }, [fetchedBoard, setBoard]);

  const { mutateAsync: updateBoard } = useUpdateBoard();
  const { mutateAsync: deleteBoard, isPending: isDeleting } = useDeleteBoard();
  const { canManageBoards, canDeleteBoards } = useOrganizationPermission();
  const canEdit = canManageBoards();
  const canDelete = canDeleteBoards();

  const boardForm = useForm<BoardFormValues>({
    resolver: standardSchemaResolver(boardSchema),
    mode: "onChange",
    defaultValues: {
      name: board?.name || "",
      slug: board?.slug || "",
      description: board?.description || "",
      icon: board?.icon || "Layout",
      subtaskDepthLimit: board?.subtaskDepthLimit ?? 4,
    },
  });

  useEffect(() => {
    if (!board) return;

    const nextValues = {
      name: board.name || "",
      slug: board.slug || "",
      description: board.description || "",
      icon: board.icon || "Layout",
      subtaskDepthLimit: board.subtaskDepthLimit ?? 4,
    };
    lastSavedRef.current = normalizeBoardValues(nextValues);

    if (boardForm.formState.isDirty) return;

    boardForm.reset(nextValues, {
      keepDirty: false,
      keepTouched: false,
      keepIsValid: true,
    });
  }, [board, boardForm]);

  const saveBoard = useCallback(
    async (data: BoardFormValues) => {
      if (!board?.id) return;

      const normalizedData = normalizeBoardValues(data);
      const nameChanged = lastSavedRef.current?.name !== normalizedData.name;
      const slugChanged = lastSavedRef.current?.slug !== normalizedData.slug;
      const descriptionChanged =
        lastSavedRef.current?.description !== normalizedData.description;
      const iconChanged = lastSavedRef.current?.icon !== normalizedData.icon;
      const subtaskDepthLimitChanged =
        lastSavedRef.current?.subtaskDepthLimit !==
        normalizedData.subtaskDepthLimit;
      const hasChanges =
        nameChanged ||
        slugChanged ||
        descriptionChanged ||
        iconChanged ||
        subtaskDepthLimitChanged;

      if (!hasChanges) return;

      if (isSavingRef.current) {
        queuedSaveRef.current = data;
        return;
      }

      isSavingRef.current = true;

      try {
        const updatePayload = {
          id: board.id,
          name: nameChanged ? normalizedData.name : board.name,
          slug: slugChanged ? normalizedData.slug : board.slug,
          description: descriptionChanged
            ? normalizedData.description
            : (board.description ?? ""),
          icon: iconChanged ? normalizedData.icon : (board.icon ?? "Layout"),
          isPublic: !!board.isPublic,
          subtaskDepthLimit: subtaskDepthLimitChanged
            ? normalizedData.subtaskDepthLimit
            : (board.subtaskDepthLimit ?? 4),
        };

        await updateBoard(updatePayload);

        boardForm.reset(normalizedData, { keepDirty: false });
        lastSavedRef.current = normalizedData;
        queuedSaveRef.current = null;

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["boards"] }),
          queryClient.invalidateQueries({
            queryKey: ["boards", organization?.id],
          }),
          queryClient.invalidateQueries({
            queryKey: ["boards", organization?.id, board.id],
          }),
        ]);
        toast.success(t("settings:boardGeneral.toastUpdated"));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("settings:boardGeneral.toastUpdateError"),
        );
      } finally {
        isSavingRef.current = false;

        if (queuedSaveRef.current) {
          const queuedData = queuedSaveRef.current;
          queuedSaveRef.current = null;
          await saveBoard(queuedData);
        }
      }
    },
    [
      board?.id,
      board?.isPublic,
      board?.name,
      board?.slug,
      board?.description,
      board?.icon,
      board?.subtaskDepthLimit,
      updateBoard,
      queryClient,
      organization?.id,
      boardForm,
      t,
    ],
  );

  const saveBoardRef = useRef(saveBoard);
  const boardFormRef = useRef(boardForm);
  saveBoardRef.current = saveBoard;
  boardFormRef.current = boardForm;

  const debouncedSave = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      const isValid = await boardForm.trigger();
      if (isValid) {
        // Always save latest values to avoid staleness while typing
        const latest = boardForm.getValues();
        saveBoard(latest as BoardFormValues);
      }
    }, 800);
  }, [boardForm, saveBoard]);

  useEffect(() => {
    if (!canEdit) return;
    // Do not gate on formState.isDirty here: after setValue (e.g. icon pick), the
    // watch callback can run before RHF updates isDirty, so the debounced save never runs.
    const subscription = boardForm.watch(() => {
      debouncedSave();
    });

    return () => subscription.unsubscribe();
  }, [boardForm, debouncedSave, canEdit]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      // Flush pending edits if the user navigates away before the debounce fires.
      void (async () => {
        const latest = boardFormRef.current.getValues() as BoardFormValues;
        const normalized = normalizeBoardValues(latest);
        const last = lastSavedRef.current;
        const hasPendingChanges =
          !last ||
          last.name !== normalized.name ||
          last.slug !== normalized.slug ||
          last.description !== normalized.description ||
          last.icon !== normalized.icon ||
          last.subtaskDepthLimit !== normalized.subtaskDepthLimit;
        if (!hasPendingChanges) return;

        const isValid = await boardFormRef.current.trigger();
        if (isValid) {
          await saveBoardRef.current(latest);
        }
      })();
    };
  }, []);

  const handleDeleteBoard = useCallback(async () => {
    if (!board?.id) return;

    try {
      await deleteBoard({ id: board.id });
      toast.success(t("settings:boardGeneral.toastDeleted"));

      await queryClient.invalidateQueries({ queryKey: ["boards"] });

      navigate({
        to: "/dashboard/organization/$organizationSlug",
        params: { organizationId: organization?.id || "" },
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:boardGeneral.toastDeleteError"),
      );
    }
  }, [board?.id, deleteBoard, queryClient, navigate, organization?.id, t]);

  return (
    <>
      <PageTitle title={t("settings:boardGeneral.pageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {t("settings:boardGeneral.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("settings:boardGeneral.subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:boardGeneral.boardInfoTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:boardGeneral.boardInfoSubtitle")}
            </p>
          </div>

          <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {t("settings:boardGeneral.iconLabel")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings:boardGeneral.iconHint")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <BoardIconPicker
                  align="end"
                  disabled={!canEdit}
                  onValueChange={(icon) =>
                    boardForm.setValue("icon", icon, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  searchPlaceholder={t(
                    "settings:boardGeneral.searchIconsPlaceholder",
                  )}
                  side="top"
                  showValue
                  triggerLabel={t("settings:boardGeneral.pickIconTitle")}
                  value={boardForm.watch("icon")}
                />
              </div>
            </div>

            <Separator />

            <Form {...boardForm}>
              <form className="space-y-4">
                <FormField
                  control={boardForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">
                            {t("settings:boardGeneral.boardNameLabel")}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {t("settings:boardGeneral.boardNameHint")}
                          </p>
                        </div>
                        <FormControl>
                          <Input
                            className="w-64"
                            placeholder={t(
                              "settings:boardGeneral.boardNamePlaceholder",
                            )}
                            disabled={!canEdit}
                            {...field}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={boardForm.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">
                            {t("settings:boardGeneral.keyLabel")}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {t("settings:boardGeneral.keyHint", {
                              slug: boardForm.watch("slug") || "ABC",
                            })}
                          </p>
                        </div>
                        <FormControl>
                          <Input
                            className="w-64"
                            placeholder={t(
                              "settings:boardGeneral.keyPlaceholder",
                            )}
                            disabled={!canEdit}
                            {...field}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={boardForm.control}
                  name="subtaskDepthLimit"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">
                            {t("settings:boardGeneral.subtaskDepthLimitLabel")}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {t("settings:boardGeneral.subtaskDepthLimitHint")}
                          </p>
                        </div>
                        <FormControl>
                          <Input
                            aria-label={t(
                              "settings:boardGeneral.subtaskDepthLimitLabel",
                            )}
                            className="w-20 text-center"
                            disabled={!canEdit}
                            max={4}
                            min={1}
                            type="number"
                            {...field}
                            onChange={(event) =>
                              field.onChange(event.target.valueAsNumber)
                            }
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={boardForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">
                            {t("settings:boardGeneral.descriptionLabel")}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {t("settings:boardGeneral.descriptionHint")}
                          </p>
                        </div>
                        <FormControl>
                          <Input
                            className="w-64"
                            placeholder={t(
                              "settings:boardGeneral.descriptionPlaceholder",
                            )}
                            disabled={!canEdit}
                            {...field}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {t("settings:boardGeneral.importExportTasks")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings:boardGeneral.importExportTasksDescription")}
                </p>
              </div>
              {board && <TasksImportExport board={board} />}
            </div>
          </div>
        </div>

        {/* Default Assignee — separate from the debounced form because it
            accepts nullable FK values and uses a principal selector, not
            text inputs. Saves immediately on change via a dedicated mutation. */}
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">Default Assignee</h2>
            <p className="text-xs text-muted-foreground">
              New tickets on this board are automatically assigned to this
              member or team when no assignee is chosen manually.
            </p>
          </div>
          <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Default assignee</p>
                <p className="text-xs text-muted-foreground">
                  {board?.defaultAssigneeId || board?.defaultAssigneeTeamId
                    ? "Applied to new tickets."
                    : "No default — new tickets start unassigned."}
                </p>
              </div>
              <BoardDefaultAssignee
                board={board}
                canEdit={canEdit}
                onUpdate={(updates) =>
                  updateBoard({
                    id: board!.id,
                    name: board!.name,
                    icon: board!.icon ?? "Layout",
                    slug: board!.slug,
                    description: board!.description ?? "",
                    isPublic: !!board!.isPublic,
                    ...updates,
                  })
                }
                onDone={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["tasks", board?.id],
                  })
                }
              />
            </div>
          </div>
        </div>

        {canDelete && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-md font-medium">
                {t("settings:boardGeneral.dangerZone")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("settings:boardGeneral.dangerZoneSubtitle")}
              </p>
            </div>

            <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {t("settings:boardGeneral.deleteBoard")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:boardGeneral.deleteBoardDescription")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive transition-colors"
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  disabled={!board}
                >
                  {t("settings:boardGeneral.deleteBoard")}
                </Button>
              </div>
            </div>
          </div>
        )}

        <AlertDialog
          open={isDeleteModalOpen}
          onOpenChange={setIsDeleteModalOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("settings:boardGeneral.deleteModalTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("settings:boardGeneral.deleteModalDescription", {
                  name: board?.name ?? "",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose>
                <Button variant="outline" size="sm">
                  {t("common:actions.cancel")}
                </Button>
              </AlertDialogClose>
              <AlertDialogClose
                onClick={handleDeleteBoard}
                disabled={isDeleting}
              >
                <Button variant="destructive" size="sm" disabled={isDeleting}>
                  {isDeleting
                    ? t("common:actions.deleting")
                    : t("settings:boardGeneral.deleteModalConfirm")}
                </Button>
              </AlertDialogClose>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
