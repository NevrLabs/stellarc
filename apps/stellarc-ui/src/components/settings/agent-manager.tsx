import { Bot, Copy, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import useCreateAgent from "@/hooks/mutations/agent/use-create-agent";
import useDeleteAgent from "@/hooks/mutations/agent/use-delete-agent";
import useGetAgents from "@/hooks/queries/agent/use-get-agents";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { toast } from "@/lib/toast";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/**
 * The API requires every agent key to carry an expiry (max 365 days). That is a
 * security constraint, not a decision a human should have to make while filling
 * in a one-field form — the old UI exposed it as a `datetime-local` picker, so
 * creating an agent meant hand-picking a timestamp before the button unlocked.
 * We keep the constraint and pick a sane lifetime for the operator instead.
 */
export const AGENT_KEY_LIFETIME_DAYS = 90;

/** Matches the API's minimum name length so the button can't submit a 400. */
const MIN_AGENT_NAME_LENGTH = 3;

function expiryFromNow() {
  return new Date(
    Date.now() + AGENT_KEY_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

export function AgentManager() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id;
  const nameInputId = useId();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  const { data: agents = [] } = useGetAgents(organizationId);
  const createAgent = useCreateAgent(organizationId);
  const deleteAgent = useDeleteAgent(organizationId);

  const trimmedName = name.trim();
  const canCreate =
    Boolean(organizationId) &&
    trimmedName.length >= MIN_AGENT_NAME_LENGTH &&
    !createAgent.isPending;

  const create = async () => {
    if (!organizationId || !canCreate) return;
    try {
      const created = await createAgent.mutateAsync({
        organizationId,
        name: trimmedName,
        expiresAt: expiryFromNow(),
        // Kept for API-key record compatibility only. Agent authorization is
        // derived from the agent member's organization role, not this map.
        permissions: { board: ["read"] },
      });
      setSecret(created.key);
      setName("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("team:agentManager.createError"),
      );
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAgent.mutateAsync(id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("team:agentManager.deleteError"),
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-md border border-border bg-sidebar p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">
              {t("team:agentManager.title")}
            </p>
            <Badge variant="warning" size="sm">
              {t("team:agentManager.alphaBadge")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("team:agentManager.description")}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={nameInputId}>
            {t("team:agentManager.nameLabel")}
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/*
              max-w keeps the field a form control instead of a page-wide bar;
              size sm matches the header actions so Create does not out-weigh
              "Invite member", the page's actual primary action.
            */}
            <Input
              id={nameInputId}
              className="sm:max-w-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("team:agentManager.namePlaceholder")}
            />
            <Button
              className="sm:w-auto"
              onClick={create}
              disabled={!canCreate}
              size="sm"
              variant="outline"
            >
              <Plus className="size-4" />
              {t("team:agentManager.create")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("team:agentManager.expiryHint", {
              days: AGENT_KEY_LIFETIME_DAYS,
            })}
          </p>
        </div>
      </div>

      {secret && (
        <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-medium">
            {t("team:agentManager.secretWarning")}
          </p>
          <code className="block break-all rounded bg-background/60 p-2 text-xs">
            {secret}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard.writeText(secret)}
          >
            <Copy className="size-4" />
            {t("team:agentManager.copy")}
          </Button>
        </div>
      )}

      {agents.map((agent) => (
        <div
          key={agent.id}
          className="flex items-center justify-between gap-4 rounded-md border border-border p-4"
        >
          <div className="min-w-0 space-y-1">
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <Bot className="size-4 text-muted-foreground" />
              {agent.name}
              <Badge variant="secondary" size="sm">
                {t("team:agentManager.agentBadge")}
              </Badge>
            </span>
            <p className="text-xs text-muted-foreground">
              {t("team:agentManager.agentMeta", {
                date: new Date(agent.expiresAt).toLocaleDateString(),
              })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("team:agentManager.revoke")}
            onClick={() => remove(agent.id)}
            disabled={deleteAgent.isPending}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
