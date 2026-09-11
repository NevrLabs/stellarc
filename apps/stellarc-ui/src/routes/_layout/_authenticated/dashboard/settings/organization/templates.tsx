import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, FileText, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import PageTitle from "@/components/page-title";
import type { TaskTemplateData } from "@/components/task/task-template-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  CardAction,
  CardDescription,
  CardFrame,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "@/components/ui/sheet";
import { resolveLabelColor } from "@/constants/label-colors";
import { getApiUrl } from "@/fetchers/get-api-url";
import useGetLabelsByOrganization from "@/hooks/queries/label/use-get-labels-by-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { isTemplateDateOffset } from "@/lib/task-template-date-offset";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/templates",
)({ component: RouteComponent });

type Template = { id: string; name: string; data: TaskTemplateData };
const empty: TaskTemplateData = {
  title: "",
  description: null,
  priority: "no-priority",
  startDate: null,
  dueDate: null,
  status: null,
  labels: [],
  startDateOffset: null,
  dueDateOffset: null,
};

function RouteComponent() {
  const { organization, canManageOrganization } = useOrganizationPermission();
  const canEdit = canManageOrganization();
  const organizationId = organization?.id ?? "";
  const queryClient = useQueryClient();
  const queryKey = ["task-templates", organizationId];
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [data, setData] = useState(empty);
  const [labelSearch, setLabelSearch] = useState("");
  const { data: organizationLabels = [] } =
    useGetLabelsByOrganization(organizationId);
  const startOffsetValid = isTemplateDateOffset(data.startDateOffset ?? "");
  const dueOffsetValid = isTemplateDateOffset(data.dueDateOffset ?? "");
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey,
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const response = await fetch(
        getApiUrl(`task-template/organization/${organizationId}`),
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to load templates");
      return response.json();
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        getApiUrl(
          `task-template/organization/${organizationId}${editingId ? `/${editingId}` : ""}`,
        ),
        {
          method: editingId ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), data }),
        },
      );
      if (!response.ok) throw new Error("Failed to save template");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      setOpen(false);
      setEditingId(null);
      setName("");
      setData(empty);
      toast.success(editingId ? "Template updated" : "Template created");
    },
    onError: () => toast.error("Failed to save template"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(
        getApiUrl(`task-template/organization/${organizationId}/${id}`),
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to delete template");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success("Template deleted");
    },
  });

  return (
    <>
      <PageTitle title="Task templates" />
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Task templates</h1>
            <span className="rounded-full border border-border/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Beta
            </span>
          </div>
          <p className="text-muted-foreground">
            Reusable starting values for tickets in this organization.
          </p>
        </div>
        <CardFrame>
          <CardHeader>
            <div>
              <CardTitle>Templates</CardTitle>
              <CardDescription>
                Create and manage reusable ticket templates.
              </CardDescription>
            </div>
            <CardAction>
              <Button
                disabled={!canEdit}
                onClick={() => {
                  setEditingId(null);
                  setName("");
                  setData(empty);
                  setLabelSearch("");
                  setOpen(true);
                }}
              >
                <Plus className="size-4" />
                New template
              </Button>
            </CardAction>
          </CardHeader>
          <CardPanel className="divide-y p-0">
            {templates.map((template) => (
              <div
                className="flex items-center gap-3 px-4 py-3"
                key={template.id}
              >
                <FileText className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {template.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {template.data.title || "Untitled ticket"}
                  </p>
                </div>
                <Button
                  aria-label={`Edit ${template.name}`}
                  disabled={!canEdit}
                  onClick={() => {
                    setEditingId(template.id);
                    setName(template.name);
                    setData(template.data);
                    setLabelSearch("");
                    setOpen(true);
                  }}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  aria-label={`Delete ${template.name}`}
                  disabled={!canEdit}
                  onClick={() => setDeleting(template)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {!templates.length && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No templates yet.
              </div>
            )}
          </CardPanel>
        </CardFrame>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md md:max-w-xl lg:max-w-3xl">
          <SheetHeader className="shrink-0 border-b border-border px-4 py-2.5">
            <SheetTitle>
              {editingId ? "Edit task template" : "New task template"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Set reusable defaults. Every value can still be changed after
              applying the template.
            </SheetDescription>
          </SheetHeader>
          <SheetPanel className="min-h-0 flex-1 overflow-y-auto pb-24">
            <div className="space-y-3 px-4 py-4">
              <Label className="sr-only" htmlFor="template-title">
                Ticket title
              </Label>
              <Input
                id="template-title"
                className="h-auto border-0 bg-transparent px-0 py-1 text-xl font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-ring/50"
                value={data.title}
                onChange={(event) =>
                  setData({ ...data, title: event.target.value })
                }
                placeholder="Ticket title"
              />
              <div className="flex items-center gap-3">
                <Label
                  className="w-28 shrink-0 text-xs text-muted-foreground"
                  htmlFor="template-name"
                >
                  Template name
                </Label>
                <Input
                  id="template-name"
                  className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Template name"
                />
              </div>
            </div>
            <div className="border-y border-border bg-sidebar px-4 py-3">
              <p className="sr-only">Properties</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="template-status">Status</Label>
                  <Input
                    id="template-status"
                    value={data.status ?? ""}
                    onChange={(event) =>
                      setData({ ...data, status: event.target.value || null })
                    }
                    placeholder="To Do"
                  />
                  <p className="text-xs text-muted-foreground">
                    Match a target board column name or slug.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-priority">Priority</Label>
                  <select
                    id="template-priority"
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={data.priority ?? "no-priority"}
                    onChange={(event) =>
                      setData({ ...data, priority: event.target.value })
                    }
                  >
                    <option value="no-priority">No priority</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="template-start">Start date offset</Label>
                  <Input
                    aria-describedby="template-start-help"
                    aria-invalid={!startOffsetValid}
                    id="template-start"
                    value={data.startDateOffset ?? ""}
                    onChange={(event) =>
                      setData({
                        ...data,
                        startDate: null,
                        startDateOffset: event.target.value || null,
                      })
                    }
                    placeholder="+7d"
                  />
                  <p
                    className={
                      startOffsetValid
                        ? "text-xs text-muted-foreground"
                        : "text-xs text-destructive"
                    }
                    id="template-start-help"
                  >
                    Use +/−N followed by m, h, d, or w.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-due">Due date offset</Label>
                  <Input
                    aria-describedby="template-due-help"
                    aria-invalid={!dueOffsetValid}
                    id="template-due"
                    value={data.dueDateOffset ?? ""}
                    onChange={(event) =>
                      setData({
                        ...data,
                        dueDate: null,
                        dueDateOffset: event.target.value || null,
                      })
                    }
                    placeholder="+14d"
                  />
                  <p
                    className={
                      dueOffsetValid
                        ? "text-xs text-muted-foreground"
                        : "text-xs text-destructive"
                    }
                    id="template-due-help"
                  >
                    Use +/−N followed by m, h, d, or w.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Labels</Label>
                <Popover onOpenChange={(open) => !open && setLabelSearch("")}>
                  <PopoverTrigger
                    render={
                      <Button
                        className="h-auto min-h-9 w-full justify-start gap-2 px-3 py-1.5 font-normal"
                        variant="outline"
                      />
                    }
                  >
                    <Tags className="size-4 shrink-0 text-muted-foreground" />
                    {data.labels?.length ? (
                      <span className="flex flex-wrap gap-1">
                        {data.labels.map((name) => (
                          <span
                            className="flex max-w-32 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                            key={name}
                          >
                            <span
                              className="size-1.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor: resolveLabelColor(
                                  organizationLabels.find(
                                    (label) => label.name === name,
                                  )?.color ?? "gray",
                                ),
                              }}
                            />
                            <span className="truncate">{name}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Add labels…</span>
                    )}
                  </PopoverTrigger>
                  <PopoverPopup
                    align="start"
                    className="w-[min(18rem,var(--available-width))] flex-col p-0"
                  >
                    <Input
                      aria-label="Search labels"
                      autoFocus
                      className="m-2 w-[calc(100%-1rem)]"
                      onChange={(event) => setLabelSearch(event.target.value)}
                      placeholder="Search labels…"
                      value={labelSearch}
                    />
                    <div className="max-h-64 overflow-y-auto border-t p-1">
                      {organizationLabels
                        .filter(
                          (label) =>
                            !label.taskId &&
                            label.name
                              .toLowerCase()
                              .includes(labelSearch.toLowerCase()),
                        )
                        .map((label) => {
                          const selected =
                            data.labels?.includes(label.name) ?? false;
                          return (
                            <button
                              aria-pressed={selected}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                              key={label.id}
                              onClick={() =>
                                setData({
                                  ...data,
                                  labels: selected
                                    ? (data.labels ?? []).filter(
                                        (name) => name !== label.name,
                                      )
                                    : [...(data.labels ?? []), label.name],
                                })
                              }
                              type="button"
                            >
                              <span
                                className="size-2.5 rounded-full"
                                style={{
                                  backgroundColor: resolveLabelColor(
                                    label.color,
                                  ),
                                }}
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {label.name}
                              </span>
                              {selected ? <Check className="size-4" /> : null}
                            </button>
                          );
                        })}
                      {!organizationLabels.some(
                        (label) =>
                          !label.taskId &&
                          label.name
                            .toLowerCase()
                            .includes(labelSearch.toLowerCase()),
                      ) ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                          No labels found.
                        </p>
                      ) : null}
                    </div>
                  </PopoverPopup>
                </Popover>
              </div>
            </div>
            <div className="space-y-3 px-4 py-4">
              <Label
                className="text-sm font-medium"
                htmlFor="template-description"
              >
                Description
              </Label>
              <textarea
                id="template-description"
                className="min-h-36 w-full resize-y rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                value={data.description ?? ""}
                onChange={(event) =>
                  setData({ ...data, description: event.target.value || null })
                }
                placeholder="Add a description, steps, or acceptance criteria…"
              />
            </div>
          </SheetPanel>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !name.trim() ||
                save.isPending ||
                !startOffsetValid ||
                !dueOffsetValid
              }
              onClick={() => save.mutate()}
            >
              {editingId ? "Save changes" : "Create template"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `“${deleting.name}” will be permanently deleted.`
                : "This template will be permanently deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                deleting &&
                remove.mutate(deleting.id, {
                  onSuccess: () => setDeleting(null),
                })
              }
            >
              Delete template
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
