import { useQueryClient } from "@tanstack/react-query";
import { Check, Github, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { resolveLabelColor } from "@/constants/label-colors";
import useCreateLabel from "@/hooks/mutations/label/use-create-label";
import useDeleteLabel from "@/hooks/mutations/label/use-delete-label";
import useGetGithubIntegration from "@/hooks/queries/github-integration/use-get-github-integration";
import useGetLabelsByOrganization from "@/hooks/queries/label/use-get-labels-by-organization";
import useGetLabelsByTask from "@/hooks/queries/label/use-get-labels-by-task";

import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import {
  canSelectLabelSource,
  isRepoLabel,
  labelSourceAttribute,
} from "./label-source";

/**
 * Local copy carries a `key` for the i18n colour names in the swatch picker.
 * Rendering a stored colour goes through `resolveLabelColor` (#169) so that
 * GitHub-synced hex labels don't all collapse to grey here.
 */
const labelColors = [
  { value: "gray", key: "stone", color: "var(--color-stone-500)" },
  { value: "dark-gray", key: "slate", color: "var(--color-slate-500)" },
  { value: "purple", key: "lavender", color: "var(--color-violet-500)" },
  { value: "teal", key: "sage", color: "var(--color-emerald-600)" },
  { value: "green", key: "forest", color: "var(--color-green-600)" },
  { value: "yellow", key: "amber", color: "var(--color-amber-600)" },
  { value: "orange", key: "terracotta", color: "var(--color-orange-600)" },
  { value: "pink", key: "rose", color: "var(--color-rose-600)" },
  { value: "red", key: "crimson", color: "var(--color-red-600)" },
  // #175: additional hues.
  { value: "blossom", key: "blossom", color: "var(--color-pink-500)" },
  { value: "honey", key: "honey", color: "var(--color-amber-500)" },
  { value: "lime", key: "lime", color: "var(--color-lime-600)" },
  { value: "emerald", key: "emerald", color: "var(--color-emerald-500)" },
  { value: "lagoon", key: "lagoon", color: "var(--color-cyan-600)" },
  { value: "sky", key: "sky", color: "var(--color-sky-500)" },
  { value: "ocean", key: "ocean", color: "var(--color-blue-600)" },
  { value: "indigo", key: "indigo", color: "var(--color-indigo-500)" },
  { value: "violet", key: "violet", color: "var(--color-violet-600)" },
  { value: "orchid", key: "orchid", color: "var(--color-fuchsia-500)" },
  { value: "cocoa", key: "cocoa", color: "var(--color-amber-800)" },
];

type LabelColor =
  | "gray"
  | "dark-gray"
  | "purple"
  | "teal"
  | "green"
  | "yellow"
  | "orange"
  | "pink"
  | "red"
  | "blossom"
  | "honey"
  | "lime"
  | "emerald"
  | "lagoon"
  | "sky"
  | "ocean"
  | "indigo"
  | "violet"
  | "orchid"
  | "cocoa";

type TaskLabelsPopoverProps = {
  task: Task;
  organizationId: string;
  children: React.ReactNode;
  triggerNativeButton?: boolean;
};

type PopoverStep = "select" | "color";

export function LabelSourceIndicator({
  source,
  label,
}: {
  source: string | null | undefined;
  label: string;
}) {
  if (!isRepoLabel(source)) return null;

  return (
    <Github
      aria-label={label}
      className="ml-auto size-3.5 shrink-0 text-muted-foreground"
      title={label}
    />
  );
}

export default function TaskLabelsPopover({
  task,
  organizationId,
  children,
  triggerNativeButton = true,
}: TaskLabelsPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<PopoverStep>("select");
  const [searchValue, setSearchValue] = useState("");
  const [selectedColor, setSelectedColor] = useState<LabelColor>("gray");
  const [newLabelName, setNewLabelName] = useState("");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { mutateAsync: createLabel } = useCreateLabel();
  const { mutateAsync: deleteLabel } = useDeleteLabel();
  // Attaching/removing labels from a task is a task mutation; creating a new
  // organization label needs the label capability. We gate the popover trigger
  // on whichever is required: any flow needs at least task-edit since the
  // result lives on the task.
  const { canManageTasks, canManageLabels } = useOrganizationPermission();
  const canEdit = canManageTasks();
  const canCreateLabels = canManageLabels();

  const { data: taskLabels = [] } = useGetLabelsByTask(task.id);
  const { data: boardIntegration } = useGetGithubIntegration(task.boardId);
  const { data: organizationLabels = [] } = useGetLabelsByOrganization(
    organizationId,
    { includeRepo: true },
  );

  const taskLabelNames = useMemo(
    () => taskLabels.map((label) => label.name),
    [taskLabels],
  );

  const filteredLabels = useMemo(() => {
    const searchFiltered = organizationLabels.filter(
      (label) =>
        canSelectLabelSource(label.source, Boolean(boardIntegration)) &&
        label.name.toLowerCase().includes(searchValue.toLowerCase()),
    );

    const labelMap = new Map<string, (typeof organizationLabels)[0]>();
    for (const label of searchFiltered) {
      const existing = labelMap.get(label.name);
      if (!existing || (label.taskId === null && existing.taskId !== null)) {
        labelMap.set(label.name, label);
      }
    }

    return Array.from(labelMap.values());
  }, [organizationLabels, searchValue, boardIntegration]);

  const isCreatingNewLabel = useMemo(
    () =>
      searchValue &&
      !organizationLabels.some(
        (label) => label.name.toLowerCase() === searchValue.toLowerCase(),
      ),
    [organizationLabels, searchValue],
  );

  useEffect(() => {
    if (open && step === "select" && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [open, step]);

  const resetPopover = () => {
    setStep("select");
    setSearchValue("");
    setNewLabelName("");
    setSelectedColor("gray");
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(resetPopover, 200);
  };

  const handleToggleLabel = async (labelId: string) => {
    try {
      const organizationLabel = organizationLabels.find(
        (l) => l.id === labelId,
      );
      if (!organizationLabel) return;

      const isCurrentlyAssigned = taskLabelNames.includes(
        organizationLabel.name,
      );

      if (isCurrentlyAssigned) {
        // Remove label from task - find by name since IDs are different
        const taskLabel = taskLabels.find(
          (l) => l.name === organizationLabel.name,
        );
        if (taskLabel?.id) {
          await deleteLabel({ id: taskLabel.id });
          toast.success(t("tasks:popover.labels.removeSuccess"));
        }
      } else {
        // Add label to task
        await createLabel({
          name: organizationLabel.name,
          color: organizationLabel.color as LabelColor,
          taskId: task.id,
          organizationId,
        });
        toast.success(t("tasks:popover.labels.addSuccess"));
      }

      await queryClient.invalidateQueries({
        queryKey: ["tasks", task.boardId],
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:popover.labels.updateError"),
      );
    }
  };

  const handleCreateNewClick = () => {
    setNewLabelName(searchValue);
    setStep("color");
  };

  const handleColorSelect = async (color: LabelColor) => {
    setSelectedColor(color);

    // Create the label immediately
    if (!newLabelName.trim()) return;

    try {
      // First create the label in the organization
      await createLabel({
        name: newLabelName.trim(),
        color: color,
        organizationId,
      });

      // Then assign it to the task
      await createLabel({
        name: newLabelName.trim(),
        color: color,
        taskId: task.id,
        organizationId,
      });

      await queryClient.invalidateQueries({
        queryKey: ["tasks", task.boardId],
      });

      toast.success(t("tasks:popover.labels.createSuccess"));
      handleClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:popover.labels.createError"),
      );
    }
  };

  const renderSelectStep = () => (
    <div className="w-auto">
      <div className="flex items-center gap-2 p-2 border-b border-border">
        <Search className="w-3 h-3 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder={t("tasks:popover.labels.searchPlaceholder")}
          className="border-none p-0 h-auto focus-visible:ring-0 shadow-none !bg-transparent"
        />
      </div>

      <div className="py-1">
        {filteredLabels.length === 0 && searchValue.length === 0 && (
          <span className="text-xs text-muted-foreground px-2">
            {t("tasks:popover.labels.empty")}
          </span>
        )}
        {filteredLabels.map((label) => (
          <button
            key={label.id}
            type="button"
            data-label-source={labelSourceAttribute(label.source)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent/50 text-left"
            onClick={() => handleToggleLabel(label.id)}
          >
            <div className="flex-shrink-0 w-3 flex justify-center">
              {taskLabelNames.includes(label.name) && (
                <Check className="w-3 h-3" />
              )}
            </div>
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: resolveLabelColor(label.color),
              }}
            />
            <span className="max-w-20 truncate">{label.name}</span>
            <LabelSourceIndicator
              source={label.source}
              label={t("tasks:popover.labels.repoSource")}
            />
          </button>
        ))}

        {canCreateLabels && isCreatingNewLabel && filteredLabels.length > 0 && (
          <div className="border-t border-border my-1" />
        )}
        {canCreateLabels && isCreatingNewLabel && (
          <button
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent/50 text-left"
            onClick={handleCreateNewClick}
          >
            <div className="flex-shrink-0 w-3 flex justify-center">
              <Plus className="w-3 h-3" />
            </div>
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: resolveLabelColor(selectedColor),
              }}
            />
            <span className="truncate">
              {t("tasks:popover.labels.create", { name: searchValue })}
            </span>
          </button>
        )}
      </div>
    </div>
  );

  const renderColorStep = () => (
    <div className="w-auto">
      <div className="flex items-center justify-between p-2 border-b border-border">
        <span className="text-xs font-medium">
          {t("tasks:popover.labels.chooseColor")}
        </span>
        <button
          type="button"
          onClick={() => setStep("select")}
          className="w-4 h-4 flex items-center justify-center hover:bg-accent/50 rounded"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="py-1">
        {labelColors.map((color) => (
          <button
            key={color.value}
            type="button"
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent/50 text-left",
              selectedColor === color.value && "bg-accent/30",
            )}
            onClick={() => handleColorSelect(color.value as LabelColor)}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: color.color }}
            />
            <span className="truncate">
              {t(`tasks:popover.labels.colors.${color.key}`)}
            </span>
            {selectedColor === color.value && (
              <Check className="w-3 h-3 ml-auto" />
            )}
          </button>
        ))}
      </div>
    </div>
  );

  // No task-edit permission → no label changes at all. The trigger renders
  // as a plain element so users still see the existing labels.
  if (!canEdit) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild nativeButton={triggerNativeButton}>
        {children}
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        {step === "select" && renderSelectStep()}
        {step === "color" && renderColorStep()}
      </PopoverContent>
    </Popover>
  );
}
