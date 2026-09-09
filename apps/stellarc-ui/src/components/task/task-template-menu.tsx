import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getApiUrl } from "@/fetchers/get-api-url";

export type TaskTemplateData = {
  title: string;
  description: string | null;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  status?: string | null;
  labels?: string[];
  startDateOffset?: string | null;
  dueDateOffset?: string | null;
};

type TaskTemplate = {
  id: string;
  name: string;
  data: TaskTemplateData;
};

export default function TaskTemplateMenu({
  organizationId,
  onApply,
  disabled = false,
  iconOnly = false,
}: {
  organizationId: string;
  onApply: (template: TaskTemplate) => void;
  disabled?: boolean;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const queryKey = ["task-templates", organizationId];
  const { data: templates = [] } = useQuery<TaskTemplate[]>({
    queryKey,
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const response = await fetch(
        getApiUrl(`task-template/organization/${organizationId}`),
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Failed to load task templates");
      return response.json();
    },
  });
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={iconOnly ? t("tasks:templates.label") : undefined}
            disabled={disabled}
            size={iconOnly ? "icon-sm" : "sm"}
            title={iconOnly ? t("tasks:templates.label") : undefined}
            type="button"
            variant="ghost"
          >
            <FileText className="size-3.5" />
            {iconOnly ? (
              <span className="sr-only">{t("tasks:templates.label")}</span>
            ) : (
              t("tasks:templates.label")
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 p-2">
        <div className="max-h-56 overflow-y-auto">
          {templates.map((template) => (
            <div className="flex items-center" key={template.id}>
              <button
                className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onApply(template);
                }}
                type="button"
              >
                {template.name}
              </button>
            </div>
          ))}
          {templates.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t("tasks:templates.empty")}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
