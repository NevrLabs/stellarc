import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import BoardMilestonesSection from "@/components/board/board-milestones-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import useUpdateBoard from "@/hooks/mutations/board/use-update-board";
import { useGetActiveOrganizationMembers } from "@/hooks/queries/organization-members/use-get-active-organization-members";
import { getAvatarTone } from "@/lib/avatar-tone";
import { getInitials } from "@/lib/get-initials";
import type { MilestoneTaskLike } from "@/lib/milestone-progress";
import { toast } from "@/lib/toast";

type PanelBoard = {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  slug?: string | null;
  isPublic?: boolean | null;
};

type BoardPropertiesPanelProps = {
  open: boolean;
  onClose: () => void;
  board: PanelBoard | null | undefined;
  organizationId: string;
  /** Flat list of every task on the board — milestone progress is derived from it. */
  tasks: MilestoneTaskLike[];
};

/**
 * Right sidebar holding BOARD-level configuration: name, description, the
 * organization members with access, and milestone CRUD. Board-level settings
 * previously lived only under /dashboard/settings, which left milestones with
 * no create/edit surface at all.
 */
export default function BoardPropertiesPanel({
  open,
  onClose,
  board,
  organizationId,
  tasks,
}: BoardPropertiesPanelProps) {
  const { t } = useTranslation();
  const updateBoard = useUpdateBoard();
  const { data: membersData } = useGetActiveOrganizationMembers(organizationId);
  // The endpoint resolves to { members, total } — an object, not an array.
  const members = membersData?.members ?? [];

  const [name, setName] = useState(board?.name ?? "");
  const [description, setDescription] = useState(board?.description ?? "");

  useEffect(() => {
    setName(board?.name ?? "");
    setDescription(board?.description ?? "");
  }, [board?.name, board?.description]);

  if (!open || !board) return null;

  const handleSaveDetails = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await updateBoard.mutateAsync({
        id: board.id,
        name: trimmed,
        icon: board.icon ?? "Layout",
        slug: board.slug ?? "",
        description: description ?? "",
        isPublic: Boolean(board.isPublic),
      });
      toast.success(t("organization:boards.properties.saved"));
    } catch {
      toast.error(t("organization:boards.properties.saveFailed"));
    }
  };

  return (
    <aside
      id="board-properties-panel"
      data-testid="board-properties-panel"
      aria-label={t("organization:boards.properties.title")}
      className="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-border border-l bg-background p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">
          {t("organization:boards.properties.title")}
        </h2>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t("organization:boards.properties.close")}
          data-testid="board-properties-close"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <label
          className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
          htmlFor="board-properties-name"
        >
          {t("organization:boards.properties.name")}
        </label>
        <Input
          id="board-properties-name"
          value={name}
          data-testid="board-properties-name-input"
          onChange={(event) => setName(event.target.value)}
        />
        <label
          className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
          htmlFor="board-properties-description"
        >
          {t("organization:boards.properties.description")}
        </label>
        <Textarea
          id="board-properties-description"
          value={description ?? ""}
          rows={3}
          data-testid="board-properties-description-input"
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button
          type="button"
          size="sm"
          data-testid="board-properties-save"
          disabled={updateBoard.isPending || !name.trim()}
          onClick={() => void handleSaveDetails()}
        >
          {t("organization:boards.properties.save")}
        </Button>
      </section>

      <section
        className="flex flex-col gap-2"
        data-testid="board-properties-members"
      >
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t("organization:boards.properties.members")}
        </h3>
        {members.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {t("organization:boards.properties.noMembers")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {members.map(
              (member: {
                id?: string;
                userId?: string;
                role?: string | null;
                user?: {
                  name?: string | null;
                  email?: string | null;
                  image?: string | null;
                } | null;
              }) => {
                const label = member.user?.name ?? member.user?.email ?? "";
                return (
                  <li
                    key={member.id ?? member.userId}
                    className="flex items-center gap-2"
                  >
                    <Avatar
                      className={`h-6 w-6 ${getAvatarTone(member.userId, member.user?.email)}`}
                    >
                      <AvatarImage src={member.user?.image ?? undefined} />
                      <AvatarFallback className="bg-transparent text-[10px]">
                        {getInitials(label)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-xs">{label}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground capitalize">
                      {member.role ?? ""}
                    </span>
                  </li>
                );
              },
            )}
          </ul>
        )}
      </section>

      <BoardMilestonesSection boardId={board.id} tasks={tasks} />
    </aside>
  );
}
