import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import PageTitle from "@/components/page-title";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import useDeleteOrganization from "@/hooks/mutations/organization/use-delete-organization";
import useTransferOrganizationOwnership from "@/hooks/mutations/organization/use-transfer-organization-ownership";
import useUpdateOrganization from "@/hooks/mutations/organization/use-update-organization";
import useUpdateOrganizationSlug from "@/hooks/mutations/organization/use-update-organization-slug";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetFullOrganization from "@/hooks/queries/organization/use-get-full-organization";
import useIdentityAliases from "@/hooks/queries/organization/use-identity-aliases";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/general",
)({
  component: RouteComponent,
});

type OrganizationFormValues = {
  name: string;
  description?: string;
};

type NormalizedOrganizationValues = {
  name: string;
  description: string;
};

function normalizeOrganizationValues(
  data: OrganizationFormValues,
): NormalizedOrganizationValues {
  return {
    name: data.name.trim(),
    description: (data.description ?? "").trim(),
  };
}

/** Better Auth persists description as an organization additional field (DB column), not only inside metadata. */
function getOrganizationDescription(
  organization:
    | { description?: string | null; metadata?: unknown }
    | null
    | undefined,
): string {
  if (!organization) return "";
  if (typeof organization.description === "string") {
    return organization.description;
  }
  if (
    typeof organization.metadata === "object" &&
    organization.metadata &&
    "description" in organization.metadata
  ) {
    return String(
      (organization.metadata as { description?: unknown }).description ?? "",
    );
  }
  return "";
}

function RouteComponent() {
  const { t } = useTranslation();
  const organizationSchema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .min(1, t("settings:organizationGeneral.validation.nameRequired"))
          .min(2, t("settings:organizationGeneral.validation.nameShort")),
        description: z.string().optional(),
      }),
    [t],
  );

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const queuedSaveRef = useRef<OrganizationFormValues | null>(null);
  const lastSavedRef = useRef<NormalizedOrganizationValues | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedNewOwnerId, setSelectedNewOwnerId] = useState<string>("");
  const [organizationSlug, setOrganizationSlug] = useState("");

  const { user: currentUser } = useAuth();
  const { data: organization } = useActiveOrganization();
  const { data: fullOrganization } = useGetFullOrganization({
    organizationId: organization?.id,
  });
  const { data: identityAliases } = useIdentityAliases(organization?.id);
  const { mutateAsync: updateOrganization } = useUpdateOrganization();
  const { mutateAsync: updateOrganizationSlug, isPending: isUpdatingSlug } =
    useUpdateOrganizationSlug();
  const { mutateAsync: deleteOrganization, isPending: isDeleting } =
    useDeleteOrganization();
  const { mutateAsync: transferOwnership, isPending: isTransferring } =
    useTransferOrganizationOwnership();
  const { canManageOrganization, canDeleteOrganization, isOwner } =
    useOrganizationPermission();
  const canEdit = canManageOrganization();
  const canDelete = canDeleteOrganization();
  const organizationDescription = getOrganizationDescription(organization);
  const isInstanceAdmin = currentUser?.role === "admin";

  // Ownership transfer is owner-only. Eligible recipients are any current
  // member who isn't the owner themselves.
  const members = fullOrganization?.members ?? [];
  const currentOwnerMember = members.find((m) => m.role === "owner");
  const eligibleNewOwners = members.filter(
    (m) => m.role !== "owner" && m.userId !== currentUser?.id,
  );
  const selectedMember = eligibleNewOwners.find(
    (m) => m.id === selectedNewOwnerId,
  );

  const organizationForm = useForm<OrganizationFormValues>({
    resolver: standardSchemaResolver(organizationSchema),
    mode: "onChange",
    defaultValues: {
      name: organization?.name || "",
      description: organizationDescription,
    },
  });

  useEffect(() => {
    if (!organization) return;

    setOrganizationSlug(organization.slug ?? "");

    const nextValues = {
      name: organization.name || "",
      description: organizationDescription,
    };
    lastSavedRef.current = normalizeOrganizationValues(nextValues);

    if (!organizationForm.formState.isDirty) {
      organizationForm.reset(nextValues);
    }
  }, [organization, organizationDescription, organizationForm]);

  const handleUpdateSlug = useCallback(async () => {
    if (!organization?.id || !isInstanceAdmin) return;
    try {
      const updated = await updateOrganizationSlug({
        organizationId: organization.id,
        slug: organizationSlug.trim(),
      });
      setOrganizationSlug(updated.slug);
      toast.success(
        t("settings:organizationGeneral.slugUpdated", {
          defaultValue: "Organization slug updated",
        }),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:organizationGeneral.slugUpdateError", {
              defaultValue: "Failed to update organization slug",
            }),
      );
    }
  }, [
    isInstanceAdmin,
    organization?.id,
    organizationSlug,
    t,
    updateOrganizationSlug,
  ]);

  const saveOrganization = useCallback(
    async (data: OrganizationFormValues) => {
      if (!organization?.id) return;

      const normalizedData = normalizeOrganizationValues(data);
      const nameChanged = lastSavedRef.current?.name !== normalizedData.name;
      const descriptionChanged =
        lastSavedRef.current?.description !== normalizedData.description;
      const hasChanges = nameChanged || descriptionChanged;

      if (!hasChanges) return;

      if (isSavingRef.current) {
        queuedSaveRef.current = data;
        return;
      }

      isSavingRef.current = true;

      try {
        const updatePayload: {
          organizationId: string;
          name?: string;
          description?: string;
        } = {
          organizationId: organization.id,
        };

        if (nameChanged) {
          updatePayload.name = normalizedData.name;
        }

        if (descriptionChanged) {
          updatePayload.description = normalizedData.description;
        }

        await updateOrganization(updatePayload);

        organizationForm.reset(normalizedData, { keepDirty: false });
        lastSavedRef.current = normalizedData;
        queuedSaveRef.current = null;

        await queryClient.invalidateQueries({
          queryKey: ["active-organization"],
        });
        toast.success(t("settings:organizationGeneral.toastUpdated"));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("settings:organizationGeneral.toastUpdateError"),
        );
      } finally {
        isSavingRef.current = false;

        if (queuedSaveRef.current) {
          const queuedData = queuedSaveRef.current;
          queuedSaveRef.current = null;
          await saveOrganization(queuedData);
        }
      }
    },
    [organization, updateOrganization, queryClient, organizationForm, t],
  );

  const handleTransferOwnership = useCallback(async () => {
    if (!organization?.id || !currentOwnerMember || !selectedMember) return;

    try {
      await transferOwnership({
        organizationId: organization.id,
        newOwnerMemberId: selectedMember.id,
        currentOwnerMemberId: currentOwnerMember.id,
      });
      toast.success(
        t("settings:organizationGeneral.transferOwnership.toastSuccess", {
          defaultValue: "Ownership transferred",
        }),
      );
      setIsTransferModalOpen(false);
      setSelectedNewOwnerId("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:organizationGeneral.transferOwnership.toastError", {
              defaultValue: "Failed to transfer ownership",
            }),
      );
    }
  }, [
    organization?.id,
    currentOwnerMember,
    selectedMember,
    transferOwnership,
    t,
  ]);

  const handleDeleteOrganization = useCallback(async () => {
    if (!organization?.id) return;

    try {
      await deleteOrganization({ organizationId: organization.id });
      toast.success(t("settings:organizationGeneral.toastDeleted"));

      // Invalidate all organization-related queries
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await queryClient.invalidateQueries({
        queryKey: ["active-organization"],
      });

      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:organizationGeneral.toastDeleteError"),
      );
    }
  }, [organization?.id, deleteOrganization, queryClient, navigate, t]);

  const debouncedSave = useCallback(
    (data: OrganizationFormValues) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(() => {
        saveOrganization(data);
      }, 1000);
    },
    [saveOrganization],
  );

  useEffect(() => {
    if (!canEdit) return;
    const subscription = organizationForm.watch(() => {
      if (
        organizationForm.formState.isDirty &&
        organizationForm.formState.isValid
      ) {
        debouncedSave(organizationForm.getValues());
      }
    });

    return () => subscription.unsubscribe();
  }, [organizationForm, debouncedSave, canEdit]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <PageTitle title={t("settings:organizationGeneral.pageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {t("settings:organizationGeneral.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("settings:organizationGeneral.subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:organizationGeneral.organizationInfoTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:organizationGeneral.organizationInfoSubtitle")}
            </p>
          </div>

          <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
            <Form {...organizationForm}>
              <form className="space-y-4">
                <FormField
                  control={organizationForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">
                            {t("settings:organizationGeneral.nameLabel")}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {t("settings:organizationGeneral.nameHint")}
                          </p>
                        </div>
                        <FormControl>
                          <Input
                            className="w-64"
                            placeholder={t(
                              "settings:organizationGeneral.namePlaceholder",
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

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm font-medium">
                      {t("settings:organizationGeneral.slugLabel", {
                        defaultValue: "Organization slug",
                      })}
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      {isInstanceAdmin
                        ? t("settings:organizationGeneral.slugAdminHint", {
                            defaultValue:
                              "Used in ticket URLs. Changing it preserves the previous slug as an alias.",
                          })
                        : t("settings:organizationGeneral.slugReadOnlyHint", {
                            defaultValue:
                              "Used in ticket URLs. Only a system administrator can change it.",
                          })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={t("settings:organizationGeneral.slugLabel", {
                        defaultValue: "Organization slug",
                      })}
                      className="w-64 font-mono"
                      value={organizationSlug}
                      readOnly={!isInstanceAdmin}
                      onChange={(event) =>
                        setOrganizationSlug(event.target.value)
                      }
                    />
                    {isInstanceAdmin ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          isUpdatingSlug ||
                          organizationSlug.trim() === organization?.slug
                        }
                        onClick={handleUpdateSlug}
                      >
                        {isUpdatingSlug
                          ? t("settings:organizationGeneral.slugSaving")
                          : t("settings:organizationGeneral.slugSave")}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3 rounded-md border border-border bg-background/40 p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {t("settings:organizationGeneral.activeAliasesTitle")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("settings:organizationGeneral.activeAliasesHint")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium">
                      {t(
                        "settings:organizationGeneral.organizationSlugAliases",
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <code className="rounded bg-muted px-2 py-1 text-xs">
                        {identityAliases?.organization.currentSlug ??
                          organization?.slug}
                        {" · "}
                        {t("settings:organizationGeneral.currentAlias")}
                      </code>
                      {identityAliases?.organization.aliases.map((alias) => (
                        <code
                          key={alias}
                          className="rounded border border-border px-2 py-1 text-xs"
                        >
                          {alias}
                        </code>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium">
                      {t("settings:organizationGeneral.ticketPrefixAliases")}
                    </p>
                    <div className="space-y-2">
                      {identityAliases?.boards.map((board) => (
                        <div
                          key={board.boardId}
                          className="flex items-start justify-between gap-4"
                        >
                          <span className="text-xs text-muted-foreground">
                            {board.boardName}
                          </span>
                          <div className="flex flex-wrap justify-end gap-2">
                            <code className="rounded bg-muted px-2 py-1 text-xs">
                              {board.currentKey}
                              {" · "}
                              {t("settings:organizationGeneral.currentAlias")}
                            </code>
                            {board.aliases.map((alias) => (
                              <code
                                key={alias}
                                className="rounded border border-border px-2 py-1 text-xs"
                              >
                                {alias}
                              </code>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <Separator />

                <FormField
                  control={organizationForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-medium">
                            {t("settings:organizationGeneral.descriptionLabel")}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {t("settings:organizationGeneral.descriptionHint")}
                          </p>
                        </div>
                        <FormControl>
                          <Input
                            className="w-64"
                            placeholder={t(
                              "settings:organizationGeneral.descriptionPlaceholder",
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
          </div>
        </div>

        {isOwner ? (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-md font-medium">
                {t("settings:organizationGeneral.transferOwnership.title", {
                  defaultValue: "Transfer ownership",
                })}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("settings:organizationGeneral.transferOwnership.subtitle", {
                  defaultValue:
                    "Hand this organization over to another member. You'll be demoted to admin and lose owner-only abilities.",
                })}
              </p>
            </div>

            <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-medium">
                    {t(
                      "settings:organizationGeneral.transferOwnership.pickerLabel",
                      { defaultValue: "New owner" },
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {eligibleNewOwners.length === 0
                      ? t(
                          "settings:organizationGeneral.transferOwnership.noEligibleMembers",
                          {
                            defaultValue:
                              "Invite at least one other member before you can transfer ownership.",
                          },
                        )
                      : t(
                          "settings:organizationGeneral.transferOwnership.pickerHint",
                          {
                            defaultValue:
                              "They become the sole owner of this organization.",
                          },
                        )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedNewOwnerId}
                    onValueChange={(value) => {
                      if (typeof value === "string") {
                        setSelectedNewOwnerId(value);
                      }
                    }}
                    disabled={eligibleNewOwners.length === 0}
                  >
                    <SelectTrigger size="sm" className="w-56">
                      <SelectValue
                        placeholder={t(
                          "settings:organizationGeneral.transferOwnership.pickerPlaceholder",
                          { defaultValue: "Select a member" },
                        )}
                      >
                        {selectedMember
                          ? selectedMember.user.name ||
                            selectedMember.user.email
                          : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleNewOwners.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.user.name} ({m.user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={!selectedNewOwnerId || isTransferring}
                    onClick={() => setIsTransferModalOpen(true)}
                  >
                    {t(
                      "settings:organizationGeneral.transferOwnership.button",
                      {
                        defaultValue: "Transfer",
                      },
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {canDelete && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-md font-medium">
                {t("settings:organizationGeneral.dangerZone")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("settings:organizationGeneral.dangerZoneSubtitle")}
              </p>
            </div>

            <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {t("settings:organizationGeneral.deleteOrganization")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "settings:organizationGeneral.deleteOrganizationDescription",
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive transition-colors"
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                >
                  {t("settings:organizationGeneral.deleteOrganization")}
                </Button>
              </div>
            </div>
          </div>
        )}

        <AlertDialog
          open={isTransferModalOpen}
          onOpenChange={setIsTransferModalOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t(
                  "settings:organizationGeneral.transferOwnership.dialogTitle",
                  {
                    defaultValue: "Transfer ownership?",
                  },
                )}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t(
                  "settings:organizationGeneral.transferOwnership.dialogDescription",
                  {
                    defaultValue:
                      "{{name}} will become the sole owner of {{organization}}. You'll keep admin access but lose owner-only abilities like deleting the organization or transferring it again.",
                    name:
                      selectedMember?.user.name ||
                      selectedMember?.user.email ||
                      "",
                    organization: organization?.name ?? "",
                  },
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose disabled={isTransferring}>
                <Button variant="outline" size="sm" disabled={isTransferring}>
                  {t("common:actions.cancel")}
                </Button>
              </AlertDialogClose>
              <AlertDialogClose
                onClick={handleTransferOwnership}
                disabled={isTransferring || !selectedMember}
              >
                <Button size="sm" disabled={isTransferring}>
                  {isTransferring
                    ? t(
                        "settings:organizationGeneral.transferOwnership.transferring",
                        { defaultValue: "Transferring…" },
                      )
                    : t(
                        "settings:organizationGeneral.transferOwnership.confirm",
                        {
                          defaultValue: "Transfer ownership",
                        },
                      )}
                </Button>
              </AlertDialogClose>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={isDeleteModalOpen}
          onOpenChange={setIsDeleteModalOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("settings:organizationGeneral.deleteModalTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("settings:organizationGeneral.deleteModalDescription", {
                  name: organization?.name ?? "",
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
                onClick={handleDeleteOrganization}
                disabled={isDeleting}
              >
                <Button variant="destructive" size="sm" disabled={isDeleting}>
                  {isDeleting
                    ? t("common:actions.deleting")
                    : t("settings:organizationGeneral.deleteModalConfirm")}
                </Button>
              </AlertDialogClose>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
