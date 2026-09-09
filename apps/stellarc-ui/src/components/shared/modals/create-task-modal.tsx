import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { produce } from "immer";
import {
  CalendarIcon,
  Check,
  Plus,
  Search,
  Tag,
  UserIcon,
  Users,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import PrincipalPickerList from "@/components/principal-picker-list";
import TitleTokenSuggestions, {
  TitleTokenHint,
  type TitleTokenOption,
} from "@/components/shared/modals/title-token-suggestions";
import CreateTaskTopbar from "@/components/task/create-task-topbar";

/*
  KFL-86: the TipTap/ProseMirror stack is ~760KB of source and was landing in
  the ENTRY chunk, because this modal is mounted from the board, list, backlog
  and search surfaces — so every route, including login, paid for an editor it
  never showed. Loading it lazily moves it into its own chunk that is fetched
  only when someone actually opens the create-ticket modal.
*/
const TaskDescriptionEditor = lazy(
  () => import("@/components/task/task-description-editor"),
);

import { formatTaskMarkdown } from "@/components/task/task-markdown";
import TaskStatusPopover from "@/components/task/task-status-popover";
import TaskTemplateMenu from "@/components/task/task-template-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { resolveLabelColor } from "@/constants/label-colors";
import { shortcuts } from "@/constants/shortcuts";
import useCreateLabel from "@/hooks/mutations/label/use-create-label";
import useAssignMilestoneToTask from "@/hooks/mutations/milestone/use-assign-milestone-to-task";
import useCreateTask from "@/hooks/mutations/task/use-create-task";
import { useDeleteTask } from "@/hooks/mutations/task/use-delete-task";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import useCreateTaskRelation from "@/hooks/mutations/task-relation/use-create-task-relation";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import useGetLabelsByOrganization from "@/hooks/queries/label/use-get-labels-by-organization";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { useGetOrganizationPrincipals } from "@/hooks/queries/organization-members/use-get-organization-principals";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { authClient } from "@/lib/auth-client";
import { getAvatarTone } from "@/lib/avatar-tone";
import { cn } from "@/lib/cn";
import { formatDateMedium } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import {
  buildPrincipalPickerOptions,
  resolvePrincipalSelection,
} from "@/lib/principal-picker-options";

import { getPriorityIcon } from "@/lib/priority";
import { resolveTemplateDate } from "@/lib/task-template-date-offset";
import {
  commitTitleToken,
  findActiveTitleToken,
  type TitleToken,
} from "@/lib/title-token-autocomplete";
import { toast } from "@/lib/toast";
import useBoardStore from "@/store/board";
import useTaskDraftStore from "@/store/task-draft";
import type Task from "@/types/task";

export function resolveCreateTaskBoardId(
  explicitBoardId: string | undefined,
  routeBoardId: string | null,
  selectedBoardId: string,
) {
  return explicitBoardId || routeBoardId || selectedBoardId;
}

type CreateTaskModalProps = {
  open: boolean;
  onClose: () => void;
  status?: string;
  boardId?: string;
  /**
   * Pre-selects a parent task so the created task becomes its subtask.
   * Subtask creation reuses this modal instead of a bespoke inline input and
   * passes the ticket it was opened from (KFL-126).
   */
  initialParentTaskId?: string | null;
};

type Priority = "no-priority" | "low" | "medium" | "high" | "urgent";

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

type Label = {
  id: string;
  name: string;
  color: string;
  taskId: string | null;
  organizationId: string;
  createdAt: string;
};

type PopoverStep = "select" | "color";

export function focusTaskTitleFromShortcut(
  event: KeyboardEvent,
  titleInput: HTMLInputElement | null,
  open: boolean,
) {
  if (!open) return false;

  const target = event.target;
  const isTyping =
    target instanceof Element &&
    (target.closest('input, textarea, [contenteditable="true"]') !== null ||
      (target instanceof HTMLElement && target.isContentEditable));

  if (
    event.key.toLowerCase() !== shortcuts.task.focusTitle ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    isTyping
  ) {
    return false;
  }

  event.preventDefault();
  titleInput?.focus();
  return true;
}

function normalizeTask(
  task: Partial<Task> &
    Pick<Task, "id" | "title" | "status" | "boardId" | "createdAt">,
): Task {
  return {
    ...task,
    number: task.number ?? null,
    description: task.description ?? null,
    priority: task.priority ?? null,
    startDate: task.startDate ?? null,
    dueDate: task.dueDate ?? null,
    position: task.position ?? 0,
    userId: task.userId ?? null,
    assigneeId: task.assigneeId ?? task.userId ?? null,
    assigneeName: task.assigneeName ?? null,
    assigneeImage: task.assigneeImage ?? null,
    labels: task.labels ?? [],
    externalLinks: task.externalLinks ?? [],
  };
}

function CreateTaskModal({
  open,
  onClose,
  status,
  boardId,
  initialParentTaskId = null,
}: CreateTaskModalProps) {
  const { t } = useTranslation();
  const { board, setBoard } = useBoardStore();

  const labelColors = useMemo(
    () =>
      [
        {
          value: "gray" as LabelColor,
          labelKey: "stone" as const,
          color: "var(--color-stone-500)",
        },
        {
          value: "dark-gray" as LabelColor,
          labelKey: "slate" as const,
          color: "var(--color-slate-500)",
        },
        {
          value: "purple" as LabelColor,
          labelKey: "lavender" as const,
          color: "var(--color-violet-500)",
        },
        {
          value: "teal" as LabelColor,
          labelKey: "sage" as const,
          color: "var(--color-emerald-600)",
        },
        {
          value: "green" as LabelColor,
          labelKey: "forest" as const,
          color: "var(--color-green-600)",
        },
        {
          value: "yellow" as LabelColor,
          labelKey: "amber" as const,
          color: "var(--color-amber-600)",
        },
        {
          value: "orange" as LabelColor,
          labelKey: "terracotta" as const,
          color: "var(--color-orange-600)",
        },
        {
          value: "pink" as LabelColor,
          labelKey: "rose" as const,
          color: "var(--color-rose-600)",
        },
        {
          value: "red" as LabelColor,
          labelKey: "crimson" as const,
          color: "var(--color-red-600)",
        },
        {
          value: "blossom" as LabelColor,
          labelKey: "blossom" as const,
          color: "var(--color-pink-500)",
        },
        {
          value: "honey" as LabelColor,
          labelKey: "honey" as const,
          color: "var(--color-amber-500)",
        },
        {
          value: "lime" as LabelColor,
          labelKey: "lime" as const,
          color: "var(--color-lime-600)",
        },
        {
          value: "emerald" as LabelColor,
          labelKey: "emerald" as const,
          color: "var(--color-emerald-500)",
        },
        {
          value: "lagoon" as LabelColor,
          labelKey: "lagoon" as const,
          color: "var(--color-cyan-600)",
        },
        {
          value: "sky" as LabelColor,
          labelKey: "sky" as const,
          color: "var(--color-sky-500)",
        },
        {
          value: "ocean" as LabelColor,
          labelKey: "ocean" as const,
          color: "var(--color-blue-600)",
        },
        {
          value: "indigo" as LabelColor,
          labelKey: "indigo" as const,
          color: "var(--color-indigo-500)",
        },
        {
          value: "violet" as LabelColor,
          labelKey: "violet" as const,
          color: "var(--color-violet-600)",
        },
        {
          value: "orchid" as LabelColor,
          labelKey: "orchid" as const,
          color: "var(--color-fuchsia-500)",
        },
        {
          value: "cocoa" as LabelColor,
          labelKey: "cocoa" as const,
          color: "var(--color-amber-800)",
        },
      ].map(({ labelKey, ...rest }) => ({
        ...rest,
        label: t(`common:modals.createTask.labelColors.${labelKey}`),
      })),
    [t],
  );
  const location = useLocation();
  const { data: organization } = useActiveOrganization();
  const { data: organizationMembers } = useGetActiveOrganizationMembers(
    organization?.id || "",
  );
  // KFL-160: the assignee picker needs `kind` to group agents separately;
  // listMembers strips it, so the picker reads principals instead.
  const { data: organizationPrincipals } = useGetOrganizationPrincipals(
    organization?.id || "",
  );
  const { data: organizationTeams } = useQuery({
    queryKey: ["organization-teams", organization?.id, "create-task"],
    enabled: Boolean(organization?.id),
    queryFn: async () => {
      const result = await authClient.organization.listTeams({
        query: { organizationId: organization!.id },
      });
      if (result.error)
        throw new Error(result.error.message || "Failed to load teams");
      return result.data ?? [];
    },
  });
  const { mutateAsync: createLabel } = useCreateLabel();
  const { data: organizationLabels = [] } = useGetLabelsByOrganization(
    organization?.id || "",
  );
  const { canCreateTasks, canManageLabels } = useOrganizationPermission();
  const canCreateTaskCapability = canCreateTasks();
  const canCreateLabelCapability = canManageLabels();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const descriptionRef = useRef("");
  const [priority, setPriority] = useState<Priority>("no-priority");
  const [assigneeId, setAssigneeId] = useState("");
  const [assigneeTeamId, setAssigneeTeamId] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [createMore, setCreateMore] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const [parentTaskId, setParentTaskId] = useState<string | null>(
    initialParentTaskId,
  );
  const [draftTask, setDraftTask] = useState<Task | null>(null);

  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelsStep, setLabelsStep] = useState<PopoverStep>("select");
  const [searchValue, setSearchValue] = useState("");
  const [selectedColor, setSelectedColor] = useState<LabelColor>("gray");
  const [newLabelName, setNewLabelName] = useState("");

  const { data: boards = [] } = useGetBoards({
    organizationId: organization?.id || "",
  });
  const routeBoardSlug =
    location.pathname.match(/\/board\/([^/]+)/)?.[1] ?? null;
  // Resolve the URL segment (slug like "KFL" or legacy UUID) to a board UUID.
  // While boards are loading, only pass through values that already look like
  // IDs — otherwise useGetColumns and friends fire with the raw slug and 400.
  const routeBoardId = routeBoardSlug
    ? (boards.find(
        (b) =>
          b.slug?.toLowerCase() === routeBoardSlug.toLowerCase() ||
          b.id === routeBoardSlug,
      )?.id ??
      (/^[a-z0-9]{20,}$/i.test(routeBoardSlug) ? routeBoardSlug : null))
    : null;
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [boardPickerOpen, setBoardPickerOpen] = useState(false);
  const [boardSearch, setBoardSearch] = useState("");
  const resolvedBoardId = resolveCreateTaskBoardId(
    boardId,
    routeBoardId,
    selectedBoardId,
  );
  const resolvedBoard = boards.find(
    (candidate) => candidate.id === resolvedBoardId,
  );
  const selectedBoard = boards.find(
    (candidate) => candidate.id === selectedBoardId,
  );
  const visibleBoards = boards.filter((candidate) =>
    candidate.name.toLowerCase().includes(boardSearch.trim().toLowerCase()),
  );
  const { data: templateColumns = [] } = useGetColumns(resolvedBoardId);
  const [templateStatus, setTemplateStatus] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  // #72: inline `#`/`@`/`>` autocomplete state for the title field.
  const [titleToken, setTitleToken] = useState<TitleToken | null>(null);
  const titleTokenKeyHandlerRef = useRef<
    ((event: React.KeyboardEvent<HTMLInputElement>) => boolean) | null
  >(null);
  const draftCreationPromiseRef = useRef<Promise<Task> | null>(null);
  const didSubmitRef = useRef(false);
  const didDiscardRef = useRef(false);
  const restoredForRef = useRef<string | null>(null);
  // Tracks which seeded parent the current opening already applied, so
  // reopening re-seeds but clearing the parent mid-edit is not undone.
  const seededParentRef = useRef<string | null | undefined>(undefined);

  const { saveDraft, clearDraft } = useTaskDraftStore();
  // Keyed per board+column so two columns don't fight over one draft. Subtask
  // creation adds the parent, so a half-typed subtask never resurfaces in the
  // plain "New task" modal (and vice versa).
  const draftKey = `${resolvedBoardId || "no-board"}:${status ?? "default"}${
    initialParentTaskId ? `:parent:${initialParentTaskId}` : ""
  }`;

  const { mutateAsync: createTask } = useCreateTask();
  const { mutateAsync: updateTask } = useUpdateTask();
  const { mutateAsync: deleteTask } = useDeleteTask();
  const { mutateAsync: assignMilestone } = useAssignMilestoneToTask();
  const { mutateAsync: createRelation } = useCreateTaskRelation();

  const filteredLabels = (() => {
    const searchFiltered = organizationLabels.filter((label) =>
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
  })();

  const isCreatingNewLabel =
    searchValue &&
    !organizationLabels.some(
      (label) => label.name.toLowerCase() === searchValue.toLowerCase(),
    );

  const clearFormState = () => {
    setTitle("");
    setDescription("");
    descriptionRef.current = "";
    setPriority("no-priority");
    setTemplateStatus(null);
    setAssigneeId("");
    setStartDate(undefined);
    setDueDate(undefined);
    setCreateMore(false);
    setLabels([]);
    setLabelsStep("select");
    setSearchValue("");
    setSelectedColor("gray");
    setNewLabelName("");
    setMilestoneId(null);
    setParentTaskId(initialParentTaskId);
    draftCreationPromiseRef.current = null;
    didSubmitRef.current = false;
    setDraftTask(null);
  };

  const hasDraftContent = Boolean(
    title.trim() ||
      descriptionRef.current.trim() ||
      assigneeId ||
      startDate ||
      dueDate ||
      labels.length > 0 ||
      priority !== "no-priority" ||
      draftTask,
  );

  /**
   * Closing preserves unsubmitted work instead of destroying it. The
   * server-side `draftTask` is kept too — it owns any uploaded images, so
   * deleting it would orphan them. Use "Discard draft" to throw it away.
   */
  const handleClose = () => {
    if (!didSubmitRef.current && !didDiscardRef.current && hasDraftContent) {
      saveDraft(draftKey, {
        title,
        description: descriptionRef.current,
        priority,
        assigneeId,
        startDate: startDate ? startDate.toISOString() : null,
        dueDate: dueDate ? dueDate.toISOString() : null,
        labels,
        draftTask,
        savedAt: Date.now(),
      });
    }

    restoredForRef.current = null;
    didDiscardRef.current = false;
    clearFormState();
    onClose();
  };

  /** Explicit user intent to throw the draft away, including its placeholder task. */
  const handleDiscardDraft = () => {
    const abandoned = draftTask;
    didDiscardRef.current = true;
    clearDraft(draftKey);
    handleClose();

    if (abandoned) {
      void deleteTask(abandoned.id).catch(() => {
        // ignore cleanup failures for abandoned empty drafts
      });
    }
  };

  const syncTaskIntoBoard = useCallback(
    (task: Task) => {
      if (!board) return;

      const updatedBoard = produce(board, (draft) => {
        let existingTask:
          | (typeof draft.columns)[number]["tasks"][number]
          | undefined;

        for (const column of draft.columns ?? []) {
          const taskIndex = column.tasks.findIndex(
            (columnTask) => columnTask.id === task.id,
          );

          if (taskIndex !== -1) {
            existingTask = column.tasks[taskIndex];
            column.tasks.splice(taskIndex, 1);
            break;
          }
        }

        if (task.status === "planned" || task.status === "archived") {
          return;
        }

        const targetColumn = draft.columns?.find(
          (column) => column.id === task.status,
        );
        if (!targetColumn) return;

        targetColumn.tasks.push({
          ...existingTask,
          ...task,
          assigneeId: task.userId,
          assigneeName:
            organizationMembers?.members?.find(
              (member) => member.userId === task.userId,
            )?.user?.name ??
            existingTask?.assigneeName ??
            null,
          assigneeImage:
            organizationMembers?.members?.find(
              (member) => member.userId === task.userId,
            )?.user?.image ??
            existingTask?.assigneeImage ??
            null,
          position: task.position ?? 0,
        });
      });

      setBoard(updatedBoard);
    },
    [board, setBoard, organizationMembers?.members],
  );

  const ensureDraftTask = useCallback(async () => {
    if (draftTask) {
      return draftTask.id;
    }

    if (draftCreationPromiseRef.current) {
      const pendingTask = await draftCreationPromiseRef.current;
      return pendingTask.id;
    }

    if (!resolvedBoardId) {
      toast.error(t("common:modals.createTask.chooseBoardForImages"));
      return null;
    }

    const draftStatus = "planned";
    const draftPromise = createTask({
      title: title.trim() || t("common:modals.createTask.untitledTask"),
      description: formatTaskMarkdown(description),
      userId: assigneeId,
      teamId: assigneeTeamId,
      priority,
      boardId: resolvedBoardId,
      startDate: startDate ? startDate.toISOString() : undefined,
      dueDate: dueDate ? dueDate.toISOString() : undefined,
      status: draftStatus,
    }).then((task) => normalizeTask(task));

    draftCreationPromiseRef.current = draftPromise;

    try {
      const createdTask = await draftPromise;
      setDraftTask(createdTask);
      return createdTask.id;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("common:modals.createTask.prepareTaskError"),
      );
      return null;
    } finally {
      draftCreationPromiseRef.current = null;
    }
  }, [
    assigneeId,
    assigneeTeamId,
    createTask,
    description,
    draftTask,
    startDate,
    dueDate,
    priority,
    resolvedBoardId,
    title,
    t,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !resolvedBoardId || !organization?.id) return;

    try {
      const taskStatus = templateStatus ?? status ?? "to-do";
      didSubmitRef.current = true;

      const savedTask = draftTask
        ? normalizeTask(
            await updateTask({
              ...draftTask,
              title: title.trim(),
              description: formatTaskMarkdown(description),
              userId: assigneeId || null,
              teamId: assigneeTeamId || null,
              status: taskStatus,
              priority,
              startDate: startDate ? startDate.toISOString() : null,
              dueDate: dueDate ? dueDate.toISOString() : null,
              boardId: resolvedBoardId,
            }),
          )
        : normalizeTask(
            await createTask({
              title: title.trim(),
              description: formatTaskMarkdown(description),
              userId: assigneeId,
              teamId: assigneeTeamId,
              priority,
              boardId: resolvedBoardId,
              startDate: startDate ? startDate.toISOString() : undefined,
              dueDate: dueDate ? dueDate.toISOString() : undefined,
              status: taskStatus,
            }),
          );

      for (const label of labels) {
        try {
          await createLabel({
            name: label.name,
            color: label.color,
            taskId: savedTask.id,
            organizationId: organization.id,
          });
        } catch (error) {
          console.error("Failed to create label:", error);
        }
      }

      // Milestone and parent task are chosen before the task exists, so both
      // are applied right after creation.
      if (milestoneId) {
        try {
          await assignMilestone({
            boardId: resolvedBoardId,
            taskId: savedTask.id,
            milestoneId,
          });
        } catch (error) {
          console.error("Failed to assign milestone:", error);
        }
      }

      if (parentTaskId) {
        try {
          await createRelation({
            sourceTaskId: parentTaskId,
            targetTaskId: savedTask.id,
            relationType: "subtask",
          });
        } catch (error) {
          console.error("Failed to link parent task:", error);
        }
      }

      setDraftTask(savedTask);
      syncTaskIntoBoard(savedTask);
      // The draft became a real task; it must not resurface on reopen.
      clearDraft(draftKey);
      toast.success(
        draftTask
          ? t("common:modals.createTask.successUpdated")
          : t("common:modals.createTask.successCreated"),
      );

      if (createMore) {
        setTitle("");
        setDescription("");
        setPriority("no-priority");
        setAssigneeId("");
        setStartDate(undefined);
        setDueDate(undefined);
        setLabels([]);
        setLabelsStep("select");
        setSearchValue("");
        setSelectedColor("gray");
        setNewLabelName("");
        setMilestoneId(null);
        // "Create more" keeps the seeded parent so a run of subtasks all land
        // under the same ticket.
        setParentTaskId(initialParentTaskId);
        draftCreationPromiseRef.current = null;
        didSubmitRef.current = false;
        setDraftTask(null);
      } else {
        handleClose();
      }
    } catch (error) {
      didSubmitRef.current = false;
      toast.error(
        error instanceof Error
          ? error.message
          : t("common:modals.createTask.createError"),
      );
    }
  };

  useEffect(() => {
    if (!open) {
      restoredForRef.current = null;

      return;
    }
    // Restore once per opening, and never clobber in-progress typing.
    if (restoredForRef.current === draftKey) return;
    restoredForRef.current = draftKey;

    const saved = useTaskDraftStore.getState().getDraft(draftKey);
    if (!saved) return;

    setTitle(saved.title ?? "");
    setDescription(saved.description ?? "");
    descriptionRef.current = saved.description ?? "";
    setPriority((saved.priority as Priority) ?? "no-priority");
    setAssigneeId(saved.assigneeId ?? "");
    setStartDate(saved.startDate ? new Date(saved.startDate) : undefined);
    setDueDate(saved.dueDate ? new Date(saved.dueDate) : undefined);
    setLabels((saved.labels as Label[]) ?? []);
    setDraftTask((saved.draftTask as Task | null) ?? null);
  }, [open, draftKey]);

  /**
   * Seeds the parent-task selector when the modal is opened from a ticket's
   * Sub-tasks section. The modal instance is usually kept mounted, so the
   * initial `useState` value alone would not pick up a parent chosen after
   * mount. Seeded once per opening so the user can still clear the parent.
   */
  useEffect(() => {
    if (!open) {
      seededParentRef.current = undefined;
      return;
    }
    if (seededParentRef.current === initialParentTaskId) return;
    seededParentRef.current = initialParentTaskId;
    setParentTaskId(initialParentTaskId);
  }, [open, initialParentTaskId]);

  const priorityOptions = useMemo(
    () =>
      (["no-priority", "low", "medium", "high", "urgent"] as const).map(
        (value) => ({
          value,
          label: t(`tasks:priority.${value}`),
        }),
      ),
    [t],
  );

  const selectedPriority = priorityOptions.find((p) => p.value === priority);

  const selectedStatus = templateStatus ?? status;
  const selectedUser = organizationMembers?.members?.find(
    (u) => u.userId === assigneeId,
  );
  const selectedTeam = organizationTeams?.find((t) => t.id === assigneeTeamId);

  // #72: the option set the inline title picker shows for the active sigil.
  const titleTokenOptions = useMemo<TitleTokenOption[]>(() => {
    if (!titleToken) return [];

    if (titleToken.kind === "label") {
      const alreadyAdded = new Set(labels.map((label) => label.name));
      // Labels exist per-task as well as per-organization, so the raw list
      // repeats names. Dedupe by name and prefer the organization-level row.
      const byName = new Map<string, (typeof organizationLabels)[number]>();
      for (const label of organizationLabels) {
        if (alreadyAdded.has(label.name)) continue;
        const existing = byName.get(label.name);
        if (!existing || (label.taskId === null && existing.taskId !== null)) {
          byName.set(label.name, label);
        }
      }
      return [...byName.values()].map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
      }));
    }

    if (titleToken.kind === "user") {
      return (organizationMembers?.members ?? []).map((member) => ({
        id: member.userId,
        name: member.user?.name || member.user?.email || member.userId,
      }));
    }

    return priorityOptions.map((option) => ({
      id: option.value,
      name: option.label,
      icon: getPriorityIcon(option.value),
    }));
  }, [
    titleToken,
    labels,
    organizationLabels,
    organizationMembers?.members,
    priorityOptions,
  ]);

  /**
   * #72: Enter (or a click) turns the typed token into a real field value and
   * removes it from the title — the label/assignee/priority is not part of the
   * task's name.
   */
  const handleTitleTokenCommit = useCallback(
    (option: TitleTokenOption) => {
      const input = titleInputRef.current;
      const token = titleToken;
      if (!token) return;

      const caret = input?.selectionStart ?? title.length;
      const next = commitTitleToken(title, token, caret);

      if (token.kind === "label") {
        const picked = organizationLabels.find(
          (label) => label.id === option.id,
        );
        if (picked && !labels.some((label) => label.name === picked.name)) {
          setLabels((current) => [...current, picked]);
        }
      } else if (token.kind === "user") {
        setAssigneeId(option.id);
      } else {
        setPriority(option.id as Priority);
      }

      setTitle(next.title);
      setTitleToken(null);
      // Restore the caret where the token used to be, so typing continues
      // naturally instead of jumping to the end of the title.
      requestAnimationFrame(() => {
        input?.focus();
        input?.setSelectionRange(next.caret, next.caret);
      });
    },
    [title, titleToken, organizationLabels, labels],
  );

  const handleTitleChange = useCallback((value: string, caret: number) => {
    setTitle(value);
    setTitleToken(findActiveTitleToken(value, caret));
  }, []);

  useEffect(() => {
    if (labelsOpen && labelsStep === "select" && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [labelsOpen, labelsStep]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      if (focusTaskTitleFromShortcut(e, titleInputRef.current, open)) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (title.trim() && resolvedBoardId && organization?.id) {
          const form = document.querySelector("form");
          if (form) {
            form.dispatchEvent(
              new Event("submit", { cancelable: true, bubbles: true }),
            );
          }
        }
      }
    },
    [open, title, resolvedBoardId, organization?.id],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const resetLabelsPopover = () => {
    setLabelsStep("select");
    setSearchValue("");
    setNewLabelName("");
    setSelectedColor("gray");
  };

  const handleLabelsClose = () => {
    setLabelsOpen(false);
    setTimeout(resetLabelsPopover, 200);
  };

  const toggleLabel = (labelName: string) => {
    const existingLabel = labels.find((l) => l.name === labelName);
    if (existingLabel) {
      setLabels(labels.filter((l) => l.name !== labelName));
    } else {
      const organizationLabel = organizationLabels.find(
        (l) => l.name === labelName,
      );
      if (organizationLabel) {
        setLabels([
          ...labels,
          {
            id: organizationLabel.id,
            name: organizationLabel.name,
            color: organizationLabel.color,
            taskId: null,
            organizationId: organizationLabel.organizationId || "",
            createdAt: organizationLabel.createdAt,
          },
        ]);
      }
    }
  };

  const handleCreateNewClick = () => {
    setNewLabelName(searchValue);
    setLabelsStep("color");
  };

  const handleColorSelect = async (color: LabelColor) => {
    setSelectedColor(color);

    if (!newLabelName.trim() || !organization?.id) return;

    try {
      const createdLabel = await createLabel({
        name: newLabelName.trim(),
        color: color,
        organizationId: organization.id,
      });

      const newLabel: Label = {
        id: createdLabel.id,
        name: createdLabel.name,
        color: createdLabel.color,
        taskId: createdLabel.taskId ?? null,
        organizationId: createdLabel.organizationId ?? organization.id,
        createdAt: createdLabel.createdAt,
      };

      setLabels([...labels, newLabel]);
      toast.success(t("common:modals.createTask.labelCreated"));
      handleLabelsClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("common:modals.createTask.labelCreateError"),
      );
    }
  };

  const removeLabel = (labelName: string) => {
    setLabels(labels.filter((l) => l.name !== labelName));
  };

  // Defense-in-depth: if the user lacks task-create permission, don't render
  // the modal even if a stale trigger somehow opens it (e.g., keyboard
  // shortcut after the capability has changed).
  if (!canCreateTaskCapability) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="kaneo-create-task-modal max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        showCloseButton={false}
      >
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle asChild>
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="text-muted-foreground font-semibold tracking-wider text-sm">
                    {!boardId && !routeBoardId ? (
                      <Dialog
                        open={boardPickerOpen}
                        onOpenChange={setBoardPickerOpen}
                      >
                        <DialogTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={t(
                                "settings:boardSwitcher.selectBoard",
                              )}
                              className="h-7 px-2 text-sm"
                            >
                              {selectedBoard?.name ??
                                t("settings:boardSwitcher.selectBoard")}
                            </Button>
                          }
                        />
                        <DialogContent className="max-w-3xl p-0">
                          <DialogHeader className="border-b px-5 py-4">
                            <DialogTitle>
                              {t("settings:boardSwitcher.selectBoard")}
                            </DialogTitle>
                            <DialogDescription>
                              {t("settings:boardSwitcher.searchBoards")}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 border-b p-3">
                              <Search
                                className="size-4 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <Input
                                value={boardSearch}
                                onChange={(event) =>
                                  setBoardSearch(event.target.value)
                                }
                                placeholder={t(
                                  "settings:boardSwitcher.searchBoards",
                                )}
                                aria-label={t(
                                  "settings:boardSwitcher.selectBoard",
                                )}
                                className="h-8"
                              />
                            </div>
                            <div className="max-h-80 overflow-y-auto p-2">
                              {visibleBoards.map((candidate) => (
                                <button
                                  key={candidate.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedBoardId(candidate.id);
                                    setBoardPickerOpen(false);
                                    setBoardSearch("");
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                                >
                                  <Check
                                    className={cn(
                                      "size-4 shrink-0",
                                      candidate.id === selectedBoardId
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">
                                    {candidate.name}
                                  </span>
                                </button>
                              ))}
                              {visibleBoards.length === 0 ? (
                                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                                  {t("settings:boardSwitcher.noBoards")}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      resolvedBoard?.slug?.toUpperCase()
                    )}
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className="text-foreground font-medium text-sm">
                    {t("common:modals.createTask.title")}
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </DialogTitle>
            {organization?.id ? (
              <TaskTemplateMenu
                organizationId={organization.id}
                onApply={({ data }) => {
                  setTitle(data.title);
                  setDescription(data.description ?? "");
                  setPriority((data.priority as Priority) ?? "no-priority");
                  const statusHint = data.status?.toLowerCase();
                  setTemplateStatus(
                    statusHint
                      ? (templateColumns.find(
                          (column) =>
                            column.id.toLowerCase() === statusHint ||
                            column.slug?.toLowerCase() === statusHint ||
                            column.name.toLowerCase() === statusHint,
                        )?.slug ?? null)
                      : null,
                  );
                  setLabels(
                    organizationLabels.filter((label) =>
                      data.labels?.includes(label.name),
                    ),
                  );
                  setStartDate(
                    resolveTemplateDate(data.startDate, data.startDateOffset),
                  );
                  setDueDate(
                    resolveTemplateDate(data.dueDate, data.dueDateOffset),
                  );
                }}
              />
            ) : null}
          </div>
          <DialogDescription className="sr-only">
            {t("common:modals.createTask.description")}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0 space-y-6"
        >
          <div
            className="flex-1 min-h-0 overflow-y-auto space-y-6 px-6"
            data-testid="create-task-scroll-body"
          >
            {resolvedBoardId && (
              <CreateTaskTopbar
                boardId={resolvedBoardId}
                milestoneId={milestoneId}
                onMilestoneChange={setMilestoneId}
                parentTaskId={parentTaskId}
                onParentTaskChange={setParentTaskId}
              />
            )}
            {/*
              #72: title, picker anchor and hint are ONE unit. The parent uses
              `space-y-6`, which inserted a 24px gap between each of them —
              that gap was never the input's padding, which is why capping the
              padding alone never closed it.
            */}
            <div className="flex flex-col">
              <Input
                ref={titleInputRef}
                unstyled
                value={title}
                onChange={(e) =>
                  handleTitleChange(
                    e.target.value,
                    e.target.selectionStart ?? e.target.value.length,
                  )
                }
                onKeyDown={(e) => {
                  // #72: while a token picker is open it owns Arrow/Enter/Escape.
                  // Space is deliberately not intercepted, so typing a space
                  // leaves the sigil as plain title text.
                  if (titleTokenKeyHandlerRef.current?.(e)) return;
                }}
                onBlur={() => setTitleToken(null)}
                autoFocus
                placeholder={t("common:modals.createTask.taskTitlePlaceholder")}
                className="w-full !mb-0 [&_[data-slot=input]]:h-auto [&_[data-slot=input]]:px-0 [&_[data-slot=input]]:pt-3 [&_[data-slot=input]]:pb-0 [&_[data-slot=input]]:text-2xl [&_[data-slot=input]]:leading-tight [&_[data-slot=input]]:font-semibold [&_[data-slot=input]]:tracking-tight [&_[data-slot=input]]:text-foreground [&_[data-slot=input]]:placeholder:text-muted-foreground [&_[data-slot=input]]:outline-none"
                required
              />
              {/*
              #72: zero-height anchor directly under the title input, so the
              picker floats over the modal body without shifting it AND opens
              flush against the title rather than below the hint line.
            */}
              <div className="relative h-0">
                <TitleTokenSuggestions
                  onCommit={handleTitleTokenCommit}
                  onDismiss={() => setTitleToken(null)}
                  onRegisterKeyHandler={(handler) => {
                    titleTokenKeyHandlerRef.current = handler;
                  }}
                  options={titleTokenOptions}
                  token={titleToken}
                />
              </div>
              <TitleTokenHint hidden={titleToken !== null} />
            </div>

            <div className="min-h-[200px]">
              {/*
                The fallback reserves the same min-height as the editor so the
                modal does not jump when the lazy chunk resolves.
              */}
              <Suspense
                fallback={
                  <div className="min-h-[200px] rounded-md border border-border/60 bg-muted/20" />
                }
              >
                <TaskDescriptionEditor
                  value={description}
                  onChange={(value) => {
                    descriptionRef.current = value;
                    setDescription(value);
                  }}
                  placeholder={t(
                    "common:modals.createTask.descriptionPlaceholder",
                  )}
                  taskId={draftTask?.id}
                  ensureTaskId={ensureDraftTask}
                />
              </Suspense>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 flex-col items-stretch gap-3 border-t border-border bg-background px-6 py-4 sm:flex-col">
            {/* #180: properties and actions share one footer surface. */}
            <div
              className="space-y-2"
              data-testid="create-task-sticky-properties"
            >
              {labels.length > 0 && (
                <div
                  className="relative z-10 mb-2 flex flex-wrap gap-1.5"
                  data-testid="create-task-selected-labels"
                >
                  {labels.map((label) => (
                    <Badge
                      key={label.name}
                      color={label.color}
                      variant="outline"
                      className="h-6! cursor-pointer gap-1.5 px-2 py-0! leading-none transition-colors hover:bg-accent/50"
                      onClick={() => removeLabel(label.name)}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: resolveLabelColor(label.color),
                        }}
                      />
                      <span className="max-w-20 truncate leading-none">
                        {label.name}
                      </span>
                    </Badge>
                  ))}
                </div>
              )}

              {/*
              #180: the property chips (status, dates, priority, assignee,
              labels) are the last child of the scrolling body, so on a long
              description they scrolled out of reach. Pinning them to the bottom
              of the scroll area keeps them available while typing, without
              restructuring the popovers they own.
            */}
              <div className="relative z-10 flex flex-wrap items-center gap-2">
                <TaskStatusPopover
                  boardId={resolvedBoardId}
                  value={selectedStatus}
                  onChange={setTemplateStatus}
                />

                {/* Start and due date belong together, so they are grouped in
                  their own row instead of being separated by the other
                  property pills as the flex row wraps (#71). */}
                <div
                  className="flex items-center gap-2"
                  data-testid="create-task-date-fields"
                >
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border border-border hover:bg-accent/50",
                          startDate
                            ? "bg-accent/30 text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        <span>
                          {startDate
                            ? formatDateMedium(startDate)
                            : t("common:modals.createTask.startDate")}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        className="w-full bg-popover"
                      />
                      {startDate && (
                        <div className="p-2 border-t border-border">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => setStartDate(undefined)}
                          >
                            {t("common:modals.createTask.clearStartDate")}
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border border-border hover:bg-accent/50",
                          dueDate
                            ? "bg-accent/30 text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        <span>
                          {dueDate
                            ? formatDateMedium(dueDate)
                            : t("common:modals.createTask.dueDate")}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate}
                        onSelect={setDueDate}
                        className="w-full bg-popover"
                      />
                      {dueDate && (
                        <div className="p-2 border-t border-border">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => setDueDate(undefined)}
                          >
                            {t("common:modals.createTask.clearDueDate")}
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border border-border hover:bg-accent/50",
                        priority !== "no-priority"
                          ? "bg-accent/30 text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {getPriorityIcon(priority)}
                      <span>
                        {selectedPriority
                          ? selectedPriority.label
                          : t("common:modals.createTask.priority")}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="start">
                    <div className="space-y-1">
                      {priorityOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent/50 text-left transition-colors h-8"
                          onClick={() => setPriority(option.value as Priority)}
                        >
                          {getPriorityIcon(option.value)}
                          <span className="text-sm">{option.label}</span>
                          {priority === option.value && (
                            <Check className="ml-auto h-4 w-4" />
                          )}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      data-testid="create-task-assignee-trigger"
                      className={cn(
                        // Match the sibling property chips (dates, priority,
                        // labels): same border pill, same padding. It was the
                        // only chip without an outline.
                        "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border border-border hover:bg-accent/50",
                        assigneeId || selectedTeam
                          ? "bg-accent/30 text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {assigneeId ? (
                        (() => {
                          const selectedUser =
                            organizationMembers?.members?.find(
                              (member) => member.userId === assigneeId,
                            );
                          return (
                            <>
                              <Avatar
                                className={cn(
                                  "h-4 w-4",
                                  getAvatarTone(
                                    selectedUser?.userId,
                                    selectedUser?.user?.email,
                                  ),
                                )}
                              >
                                <AvatarImage
                                  src={selectedUser?.user?.image ?? ""}
                                  alt={selectedUser?.user?.name || ""}
                                />
                                <AvatarFallback className="bg-transparent text-[10px] font-medium border border-border/30">
                                  {getInitials(selectedUser?.user?.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span>{selectedUser?.user?.name}</span>
                            </>
                          );
                        })()
                      ) : selectedTeam ? (
                        <>
                          <div className="flex h-4 w-4 items-center justify-center rounded-full border border-border bg-muted">
                            <Users className="h-2.5 w-2.5" />
                          </div>
                          <span>{selectedTeam.name}</span>
                        </>
                      ) : (
                        <>
                          <UserIcon className="w-3.5 h-3.5" />
                          <span>{t("common:modals.createTask.assign")}</span>
                        </>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-1" align="start">
                    <PrincipalPickerList
                      clearLabel={t(
                        "common:modals.createTask.assignUnassigned",
                      )}
                      onSelect={(option) => {
                        if (!option) {
                          setAssigneeId("");
                          setAssigneeTeamId("");
                        } else if (option.type !== "team") {
                          setAssigneeId(option.value);
                          setAssigneeTeamId("");
                        } else {
                          setAssigneeTeamId(option.value);
                          setAssigneeId("");
                        }
                      }}
                      options={buildPrincipalPickerOptions(
                        organizationPrincipals,
                        organizationTeams,
                      )}
                      selected={resolvePrincipalSelection(
                        { userId: assigneeId, teamId: assigneeTeamId },
                        organizationPrincipals,
                      )}
                      searchAriaLabel={t("common:modals.createTask.assign")}
                    />
                  </PopoverContent>
                </Popover>

                <Popover open={labelsOpen} onOpenChange={setLabelsOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border border-border hover:bg-accent/50",
                        labels.length > 0
                          ? "bg-accent/30 text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <Tag className="w-3.5 h-3.5" />
                      <span>{t("common:modals.createTask.labels")}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" align="start">
                    {labelsStep === "select" && (
                      <div className="w-auto">
                        <div className="flex items-center gap-2 p-2 border-b border-border">
                          <Search className="w-3 h-3 text-muted-foreground" />
                          <input
                            ref={searchInputRef}
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            placeholder={t(
                              "common:modals.createTask.searchLabels",
                            )}
                            className="w-full bg-transparent border-none text-foreground text-xs focus:outline-none placeholder:text-muted-foreground"
                          />
                        </div>

                        <div className="py-1">
                          {filteredLabels.length === 0 &&
                            searchValue.length === 0 && (
                              <span className="text-xs text-muted-foreground px-2">
                                {t("common:modals.createTask.noLabelsFound")}
                              </span>
                            )}
                          {filteredLabels.map((label) => (
                            <button
                              key={label.id}
                              type="button"
                              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent/50 text-left"
                              onClick={() => toggleLabel(label.name)}
                            >
                              <div className="flex-shrink-0 w-3 flex justify-center">
                                {labels.some((l) => l.name === label.name) && (
                                  <Check className="w-3 h-3" />
                                )}
                              </div>
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: resolveLabelColor(
                                    label.color,
                                  ),
                                }}
                              />
                              <span className="max-w-20 truncate">
                                {label.name}
                              </span>
                            </button>
                          ))}

                          {canCreateLabelCapability &&
                            isCreatingNewLabel &&
                            filteredLabels.length > 0 && (
                              <div className="border-t border-border my-1" />
                            )}
                          {canCreateLabelCapability && isCreatingNewLabel && (
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
                                  backgroundColor:
                                    resolveLabelColor(selectedColor),
                                }}
                              />
                              <span className="truncate">
                                {t("common:modals.createTask.createLabel", {
                                  name: searchValue,
                                })}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {labelsStep === "color" && (
                      <div className="w-auto">
                        <div className="flex items-center justify-between p-2 border-b border-border">
                          <span className="text-xs font-medium">
                            {t("common:modals.createTask.chooseColor")}
                          </span>
                          <button
                            type="button"
                            onClick={() => setLabelsStep("select")}
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
                              onClick={() =>
                                handleColorSelect(color.value as LabelColor)
                              }
                            >
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: color.color }}
                              />
                              <span className="truncate">{color.label}</span>
                              {selectedColor === color.value && (
                                <Check className="w-3 h-3 ml-auto" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
              <div className="flex items-center gap-3 mr-auto">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  <input
                    type="checkbox"
                    checked={createMore}
                    onChange={(e) => setCreateMore(e.target.checked)}
                    className="rounded border-border bg-background text-primary focus:ring-ring focus:ring-offset-0 focus:ring-2 transition-[border-color,box-shadow]"
                  />
                  {t("common:modals.createTask.createMore")}
                </label>
              </div>

              <Button
                type="button"
                onClick={handleClose}
                variant="outline"
                size="sm"
                className="border-border text-foreground hover:bg-accent"
              >
                {t("common:actions.cancel")}
              </Button>
              {hasDraftContent && (
                <Button
                  type="button"
                  onClick={handleDiscardDraft}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                >
                  {t("common:modals.createTask.discardDraft")}
                </Button>
              )}
              <Button
                type="submit"
                disabled={!title.trim()}
                size="sm"
                className="disabled:opacity-50"
              >
                {t("common:modals.createTask.createButton")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateTaskModal;
