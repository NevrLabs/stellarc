import {
  Check,
  ExternalLink,
  Github,
  Link2Off,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useConnectGithubDelegation,
  useDisconnectGithubDelegation,
} from "@/hooks/mutations/github-delegation/use-github-delegation";
import { useGithubDelegationStatus } from "@/hooks/queries/github-delegation/use-github-delegation-status";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";
import { getGithubPermissions } from "./github-permissions";

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

export function AccountGithubConnection() {
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const { data: status, error, isLoading } = useGithubDelegationStatus();
  const connect = useConnectGithubDelegation();
  const disconnect = useDisconnectGithubDelegation();

  const handleConnect = async () => {
    try {
      const { url } = await connect.mutateAsync();
      window.location.assign(url);
    } catch (connectError) {
      toast.error(
        connectError instanceof Error
          ? connectError.message
          : "Could not start GitHub connection.",
      );
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      setDisconnectOpen(false);
      toast.success("GitHub account disconnected.");
    } catch (disconnectError) {
      toast.error(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Could not disconnect GitHub account.",
      );
    }
  };

  const permissions = getGithubPermissions(status?.scope);
  const displayName = status?.githubLogin || "GitHub account";

  return (
    <section className="space-y-4">
      <SectionHeading
        description="Used only for GitHub actions you personally initiate from Kaneo."
        title="Your GitHub account"
      />

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>GitHub connection unavailable</CardTitle>
            <CardDescription>
              {error instanceof Error
                ? error.message
                : "We could not load your GitHub connection."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : status?.connected ? (
        <div className="space-y-4">
          <Card>
            <CardPanel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-10 border">
                  <AvatarFallback>
                    {getInitials(displayName, "GH")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{displayName}</p>
                    <Badge variant="secondary">Connected</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    @{displayName}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  render={
                    <a
                      href={`https://github.com/${displayName}`}
                      rel="noreferrer"
                      target="_blank"
                    />
                  }
                  size="sm"
                  variant="outline"
                >
                  View profile <ExternalLink />
                </Button>
                <Button
                  onClick={() => setDisconnectOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <Link2Off /> Disconnect
                </Button>
              </div>
            </CardPanel>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5" /> Granted permissions
              </CardTitle>
              <CardDescription>
                Permissions you granted to Kaneo through your personal
                authorization.
              </CardDescription>
            </CardHeader>
            <CardPanel>
              <ul className="grid gap-3 text-sm sm:grid-cols-2">
                {permissions.map((permission) => (
                  <li className="flex items-start gap-2" key={permission.label}>
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <span>
                      <span className="font-medium">{permission.label}</span>
                      {permission.detail && (
                        <span className="block text-muted-foreground">
                          {permission.detail}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </CardPanel>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Connect your GitHub account</CardTitle>
            <CardDescription>
              Authorize Kaneo with the GitHub account it should act as for you.
              You will be redirected to GitHub to review the requested
              permissions.
            </CardDescription>
          </CardHeader>
          <CardPanel>
            <Button disabled={connect.isPending} onClick={handleConnect}>
              <Github />
              {connect.isPending ? "Opening GitHub…" : "Connect GitHub"}
            </Button>
          </CardPanel>
        </Card>
      )}

      <AlertDialog onOpenChange={setDisconnectOpen} open={disconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect your GitHub account?</AlertDialogTitle>
            <AlertDialogDescription>
              Kaneo will immediately stop using this identity for actions on
              your behalf. Organization GitHub App installations are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Cancel
            </AlertDialogClose>
            <Button
              disabled={disconnect.isPending}
              onClick={handleDisconnect}
              variant="destructive"
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
