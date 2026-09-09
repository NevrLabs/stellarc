import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  GitFork,
  Github,
  MessageCircle,
  Radio,
  Send,
  Webhook,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DiscordIntegrationSettings } from "@/components/board/discord-integration-settings";
import { GenericWebhookIntegrationSettings } from "@/components/board/generic-webhook-integration-settings";
import { GiteaIntegrationSettings } from "@/components/board/gitea-integration-settings";
import { GitHubIntegrationSettings } from "@/components/board/github-integration-settings";
import { SlackIntegrationSettings } from "@/components/board/slack-integration-settings";
import { TelegramIntegrationSettings } from "@/components/board/telegram-integration-settings";
import PageTitle from "@/components/page-title";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/boards/$boardId/integrations",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { boardId } = Route.useParams();

  return (
    <>
      <PageTitle title={t("settings:boardIntegrations.pageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {t("settings:boardIntegrations.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("settings:boardIntegrations.subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          <IntegrationSection
            icon={<Github className="size-4" />}
            subtitle="Sync GitHub issues into this board and keep task changes connected."
            title="GitHub"
          >
            <GitHubIntegrationSettings boardId={boardId} />
          </IntegrationSection>

          <IntegrationSection
            icon={<GitFork className="size-4" />}
            subtitle="Sync issues from a Gitea repository into this board."
            title="Gitea"
          >
            <GiteaIntegrationSettings boardId={boardId} />
          </IntegrationSection>

          <IntegrationSection
            icon={<MessageCircle className="size-4" />}
            subtitle={t("settings:boardIntegrations.discordSectionSubtitle")}
            title={t("settings:boardIntegrations.discordSectionTitle")}
          >
            <DiscordIntegrationSettings boardId={boardId} />
          </IntegrationSection>

          <IntegrationSection
            icon={<Radio className="size-4" />}
            subtitle={t(
              "settings:boardIntegrations.genericWebhookSectionSubtitle",
            )}
            title={t("settings:boardIntegrations.genericWebhookSectionTitle")}
          >
            <GenericWebhookIntegrationSettings boardId={boardId} />
          </IntegrationSection>

          <IntegrationSection
            icon={<Webhook className="size-4" />}
            subtitle={t("settings:boardIntegrations.slackSectionSubtitle")}
            title={t("settings:boardIntegrations.slackSectionTitle")}
          >
            <SlackIntegrationSettings boardId={boardId} />
          </IntegrationSection>

          <IntegrationSection
            icon={<Send className="size-4" />}
            subtitle={t("settings:boardIntegrations.telegramSectionSubtitle")}
            title={t("settings:boardIntegrations.telegramSectionTitle")}
          >
            <TelegramIntegrationSettings boardId={boardId} />
          </IntegrationSection>
        </div>
      </div>
    </>
  );
}

function IntegrationSection({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible
      className="rounded-xl border border-border bg-background"
      defaultOpen={defaultOpen}
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 px-4 py-4 text-left">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 text-muted-foreground">{icon}</div>
          <div className="min-w-0">
            <h2 className="text-md font-medium">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-border p-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
