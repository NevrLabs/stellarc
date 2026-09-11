import { useNavigate } from "@tanstack/react-router";
import {
  CircleDot,
  FileText,
  FolderGit2,
  FolderKanban,
  GitPullRequest,
  Hash,
  MessageSquare,
  Search,
  Users,
  Zap,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
} from "@/components/ui/command";
import { shortcuts } from "@/constants/shortcuts";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGlobalSearch from "@/hooks/queries/search/use-global-search";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";

type SearchResultItem = {
  id: string;
  title: string;
  description?: string;
  content?: string;
  type:
    | "task"
    | "board"
    | "organization"
    | "comment"
    | "activity"
    | "repository"
    | "issue"
    | "pull_request";
  boardId?: string;
  organizationId?: string;
  taskNumber?: number;
  boardSlug?: string;
  priority?: string;
  status?: string;
  repoId?: string;
  repoOwner?: string;
  repoName?: string;
  itemNumber?: number;
  url?: string;
};

type SearchGroup = {
  value: string;
  label: string;
  items: SearchResultItem[];
};

type SearchCommandMenuProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

function SearchCommandMenu({ open, setOpen }: SearchCommandMenuProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const { data: organization } = useActiveOrganization();
  const navigate = useNavigate();

  const searchEnabled = query.trim().length >= 3;

  const { data: searchResults } = useGlobalSearch({
    q: query,
    type: "all",
    organizationId: organization?.id,
    limit: 20,
  });

  useRegisterShortcuts({
    shortcuts: {
      [shortcuts.search.prefix]: () => {
        setOpen(true);
      },
    },
  });

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const handleSelect = (item: SearchResultItem) => {
    setOpen(false);
    setQuery("");

    switch (item.type) {
      case "task":
        if (item.boardSlug && item.taskNumber && organization?.slug) {
          navigate({
            to: "/dashboard/$organizationSlug/tickets/$ticketKey",
            params: {
              organizationSlug: organization.slug,
              ticketKey: `${item.boardSlug.toUpperCase()}-${item.taskNumber}`,
            },
          });
        }
        break;
      case "board":
        if (item.id && organization?.id) {
          navigate({
            to: "/dashboard/organization/$organizationSlug/board/$boardSlug/board",
            params: {
              organizationSlug: organization.id,
              boardSlug: item.id,
            },
          });
        }
        break;
      case "organization":
        if (item.id) {
          navigate({
            to: "/dashboard/organization/$organizationSlug",
            params: {
              organizationSlug: item.id,
            },
          });
        }
        break;
      case "comment":
      case "activity":
        if (item.boardSlug && item.taskNumber && organization?.slug) {
          navigate({
            to: "/dashboard/$organizationSlug/tickets/$ticketKey",
            params: {
              organizationSlug: organization.slug,
              ticketKey: `${item.boardSlug.toUpperCase()}-${item.taskNumber}`,
            },
          });
        }
        break;
      case "repository":
        if (item.repoId && organization?.id) {
          navigate({
            to: "/dashboard/organization/$organizationSlug/repo/$repoId/code",
            params: { organizationSlug: organization.id, repoId: item.repoId },
            search: { path: "" },
          });
        }
        break;
      case "issue":
        if (item.repoId && item.itemNumber && organization?.id) {
          navigate({
            to: "/dashboard/organization/$organizationSlug/repo/$repoId/issues/$number",
            params: {
              organizationSlug: organization.id,
              repoId: item.repoId,
              number: String(item.itemNumber),
            },
          });
        }
        break;
      case "pull_request":
        if (item.repoId && item.itemNumber && organization?.id) {
          navigate({
            to: "/dashboard/organization/$organizationSlug/repo/$repoId/pulls/$number",
            params: {
              organizationSlug: organization.id,
              repoId: item.repoId,
              number: String(item.itemNumber),
            },
          });
        }
        break;
    }
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case "task":
        return Hash;
      case "board":
        return FolderKanban;
      case "organization":
        return Users;
      case "comment":
        return MessageSquare;
      case "activity":
        return Zap;
      case "repository":
        return FolderGit2;
      case "issue":
        return CircleDot;
      case "pull_request":
        return GitPullRequest;
      default:
        return FileText;
    }
  };

  const groupedItems = useMemo<SearchGroup[]>(() => {
    if (!searchEnabled) return [];
    const results = (searchResults?.results ?? []) as SearchResultItem[];
    const grouped = results.reduce(
      (acc: Record<string, SearchResultItem[]>, item: SearchResultItem) => {
        if (!acc[item.type]) acc[item.type] = [];
        acc[item.type].push(item);
        return acc;
      },
      {} as Record<string, SearchResultItem[]>,
    );

    const groupLabel = (type: string) => {
      switch (type as SearchResultItem["type"]) {
        case "task":
          return t("navigation:search.groups.task");
        case "board":
          return t("navigation:search.groups.board");
        case "organization":
          return t("navigation:search.groups.organization");
        case "comment":
          return t("navigation:search.groups.comment");
        case "activity":
          return t("navigation:search.groups.activity");
        case "repository":
          return "Repositories";
        case "issue":
          return "Issues";
        case "pull_request":
          return "Pull requests";
        default:
          return t("navigation:search.groups.fallback");
      }
    };

    return Object.entries(grouped).map(([type, items]) => ({
      value: type,
      label: groupLabel(type),
      items,
    }));
  }, [searchEnabled, searchResults?.results, t]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogPopup instant>
        <Command items={groupedItems}>
          <CommandInput
            placeholder={t("navigation:search.inputPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <CommandPanel>
            <CommandEmpty>
              <div className="text-center py-6">
                <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {searchEnabled
                    ? t("navigation:commandPalette.empty")
                    : t("navigation:search.minCharsHint")}
                </p>
              </div>
            </CommandEmpty>
            <CommandList>
              {(group: SearchGroup, groupIndex: number) => (
                <Fragment key={group.value}>
                  <CommandGroup items={group.items}>
                    <CommandGroupLabel>{group.label}</CommandGroupLabel>
                    <CommandCollection>
                      {(item: SearchResultItem) => {
                        const Icon = getItemIcon(item.type);
                        return (
                          <CommandItem
                            key={`${item.type}-${item.id}`}
                            value={`${item.title} ${item.description || ""} ${item.type} ${item.id}`}
                            onClick={() => handleSelect(item)}
                            className="flex items-start gap-3 py-3"
                            aria-label={`${item.type}: ${item.title}`}
                          >
                            <Icon
                              className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0"
                              aria-hidden="true"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {item.title}
                              </div>
                              {item.description && (
                                <div className="text-xs text-muted-foreground truncate mt-1">
                                  {item.description}
                                </div>
                              )}
                            </div>
                          </CommandItem>
                        );
                      }}
                    </CommandCollection>
                  </CommandGroup>
                  {groupIndex < groupedItems.length - 1 && <CommandSeparator />}
                </Fragment>
              )}
            </CommandList>
          </CommandPanel>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}

export default SearchCommandMenu;
