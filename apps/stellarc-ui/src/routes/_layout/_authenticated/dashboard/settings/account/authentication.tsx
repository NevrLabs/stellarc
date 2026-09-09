import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Link2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AccountGithubConnection } from "@/components/connections/account-github-connection";
import PageTitle from "@/components/page-title";
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
import { useLinkedAuthenticationIdentities } from "@/hooks/queries/account-authentication/use-linked-authentication-identities";
import { authClient } from "@/lib/auth-client";
import { formatDateMedium } from "@/lib/format";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/account/authentication",
)({ component: RouteComponent });

function RouteComponent() {
  const { data, error, isLoading } = useLinkedAuthenticationIdentities();
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const identities = data?.identities ?? [];
  const linkedProviderIds = new Set(
    identities.map(({ providerId }) => providerId),
  );
  const availableProviders =
    data?.providers.filter(
      ({ providerId }) => !linkedProviderIds.has(providerId),
    ) ?? [];

  const linkProvider = async (provider: string) => {
    setLinkingProvider(provider);
    try {
      const callbackURL = `${window.location.origin}/dashboard/settings/account/authentication`;
      const result = await authClient.linkSocial({
        provider,
        callbackURL,
        errorCallbackURL: callbackURL,
      });
      if (result.error) throw new Error(result.error.message);
    } catch (linkError) {
      toast.error(
        linkError instanceof Error
          ? linkError.message
          : "Could not link identity provider.",
      );
      setLinkingProvider(null);
    }
  };

  return (
    <>
      <PageTitle title="Authentication" />
      <div className="max-w-3xl space-y-8 pb-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Authentication</h1>
          <p className="text-muted-foreground">
            Manage the identity providers you use to sign in and separate
            authorization for personal GitHub actions.
          </p>
        </div>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-medium">Sign-in methods</h2>
            <p className="text-sm text-muted-foreground">
              Link any identity provider configured by this Kaneo installation.
              GitHub delegation below is separate and is never used to sign you
              in.
            </p>
          </div>

          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : error ? (
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle>Sign-in methods unavailable</CardTitle>
                <CardDescription>
                  {error instanceof Error
                    ? error.message
                    : "Could not load linked identities."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4" /> Linked identities
                </CardTitle>
                <CardDescription>
                  Identity-provider credentials remain with their provider.
                </CardDescription>
              </CardHeader>
              <div className="divide-y">
                {identities.map((identity) => (
                  <CardPanel
                    className="flex items-center justify-between gap-4 py-4"
                    key={identity.id}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted/40">
                        <Link2 className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{identity.providerName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          ID {identity.accountId} · linked{" "}
                          {formatDateMedium(identity.linkedAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">Linked</Badge>
                  </CardPanel>
                ))}
                {availableProviders.map((provider) => (
                  <CardPanel
                    className="flex items-center justify-between gap-4 py-4"
                    key={provider.providerId}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted/40">
                        <KeyRound className="size-4" />
                      </div>
                      <div>
                        <p className="font-medium">{provider.providerName}</p>
                        <p className="text-xs text-muted-foreground">
                          Available as an additional sign-in method.
                        </p>
                      </div>
                    </div>
                    <Button
                      disabled={Boolean(linkingProvider)}
                      onClick={() => linkProvider(provider.providerId)}
                      size="sm"
                      variant="outline"
                    >
                      {linkingProvider === provider.providerId
                        ? "Linking…"
                        : "Link"}
                    </Button>
                  </CardPanel>
                ))}
                {identities.length === 0 && availableProviders.length === 0 ? (
                  <CardPanel className="flex items-center gap-3 py-5 text-sm text-muted-foreground">
                    <KeyRound className="size-4" /> No configured sign-in
                    methods were found.
                  </CardPanel>
                ) : null}
              </div>
            </Card>
          )}
        </section>

        <AccountGithubConnection />
      </div>
    </>
  );
}
