import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Github, Unlink } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { getOrganizationGithubInstallUrl } from "@/fetchers/organization-github/organization-github";
import {
  useConnectOrganizationGithubInstallation,
  useDisconnectOrganizationGithubInstallation,
} from "@/hooks/mutations/organization-github/use-organization-github-installations";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import {
  useAvailableOrganizationGithubInstallations,
  useOrganizationGithubInstallations,
} from "@/hooks/queries/organization-github/use-organization-github-installations";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";

function SectionHeading({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function OrganizationGithubConnection() {
  const { data: organization } = useActiveOrganization();
  const { canManageOrganization } = useOrganizationPermission();
  const organizationId = organization?.id ?? "";
  const canManage = canManageOrganization();
  const { data: installations = [], isLoading } =
    useOrganizationGithubInstallations(organizationId);
  // Installations that exist on GitHub but aren't linked to this org yet.
  // Without surfacing these, a freshly installed App is invisible in Kaneo.
  const { data: available = [] } = useAvailableOrganizationGithubInstallations(
    organizationId,
    canManage,
  );
  const { data: install } = useQuery({
    enabled: canManage && Boolean(organizationId),
    queryFn: () => getOrganizationGithubInstallUrl(organizationId),
    queryKey: ["organization-github-install-url", organizationId],
  });
  const disconnectInstallation = useDisconnectOrganizationGithubInstallation();
  const connectInstallation = useConnectOrganizationGithubInstallation();
  const installUrl = install?.url ?? null;

  const linkedIds = new Set(
    installations.map((installation) => installation.installationId),
  );
  const unlinked = available.filter(
    (installation) => !linkedIds.has(installation.installationId),
  );

  const handleConnect = async (installationId: number) => {
    if (!organizationId) return;
    try {
      await connectInstallation.mutateAsync({ installationId, organizationId });
      toast.success("GitHub App connected");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to connect GitHub App",
      );
    }
  };

  const handleDisconnect = async (installationId: number) => {
    if (!organizationId) return;
    try {
      await disconnectInstallation.mutateAsync({
        installationId,
        organizationId,
      });
      toast.success("GitHub App disconnected");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to disconnect GitHub App",
      );
    }
  };

  return (
    <section className="space-y-4">
      <SectionHeading
        description={
          organization?.name
            ? `Repository access shared by everyone in ${organization.name}.`
            : "Repository access shared by everyone in this organization."
        }
        title="Organization GitHub App"
      />

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Install the GitHub App</CardTitle>
            <CardDescription>
              GitHub controls which account and repositories the app can access.
              After installing, come back here — Kaneo registers it
              automatically.
            </CardDescription>
          </CardHeader>
          {/* Base UI Button composes via `render`, not `asChild`; using
              asChild left a disabled <button> wrapping a dead anchor. */}
          <CardPanel className="flex flex-wrap items-center gap-3">
            {installUrl ? (
              <Button
                render={
                  <a href={installUrl} rel="noreferrer" target="_blank" />
                }
              >
                <Github />
                Install GitHub App
                <ExternalLink />
              </Button>
            ) : (
              <Button disabled>
                <Github />
                Install GitHub App
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              Nothing is selected or exposed inside Kaneo.
            </p>
          </CardPanel>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>GitHub App access</CardTitle>
            <CardDescription>
              An organization administrator can install or disconnect the GitHub
              App.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {canManage && unlinked.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Ready to connect</p>
          <p className="text-sm text-muted-foreground">
            These installations exist on GitHub but aren't linked to this
            organization yet.
          </p>
          {unlinked.map((installation) => {
            const accountName = installation.accountLogin ?? "GitHub account";
            return (
              <Card key={installation.installationId}>
                <CardPanel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-10 border">
                      <AvatarImage
                        alt={accountName}
                        src={installation.accountAvatarUrl ?? undefined}
                      />
                      <AvatarFallback>
                        {getInitials(accountName, "GH")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{accountName}</p>
                      <p className="text-sm text-muted-foreground">
                        {installation.accountType === "Organization"
                          ? "Organization account"
                          : "Personal account"}
                      </p>
                    </div>
                  </div>
                  <Button
                    disabled={connectInstallation.isPending}
                    onClick={() => handleConnect(installation.installationId)}
                    size="sm"
                  >
                    <Github /> Connect
                  </Button>
                </CardPanel>
              </Card>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : installations.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Github />
            </EmptyMedia>
            <EmptyTitle>No GitHub App installation yet</EmptyTitle>
            <EmptyDescription>
              {canManage
                ? "Install the GitHub App above, then return here."
                : "Ask an organization administrator to install the GitHub App."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {installations.map((installation) => {
            const accountName = installation.accountLogin ?? "GitHub account";
            return (
              <Card key={installation.installationId}>
                <CardPanel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-10 border">
                      <AvatarImage
                        alt={accountName}
                        src={installation.accountAvatarUrl ?? undefined}
                      />
                      <AvatarFallback>
                        {getInitials(accountName, "GH")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{accountName}</p>
                      <p className="text-sm text-muted-foreground">
                        {installation.repositorySelection === "all"
                          ? "All repositories"
                          : "Selected repositories"}
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <Button
                      disabled={disconnectInstallation.isPending}
                      onClick={() =>
                        handleDisconnect(installation.installationId)
                      }
                      size="sm"
                      variant="outline"
                    >
                      <Unlink /> Disconnect
                    </Button>
                  )}
                </CardPanel>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
