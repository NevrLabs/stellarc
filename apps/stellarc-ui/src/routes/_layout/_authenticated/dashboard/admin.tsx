import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import type { User } from "better-auth/types";
import {
  Building2,
  Github,
  KeyRound,
  Loader2,
  ServerCog,
  Shield,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Layout from "@/components/common/layout";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApiUrl } from "@/fetchers/get-api-url";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";

const adminSections = [
  "overview",
  "users",
  "organizations",
  "github",
  "authentication",
  "instance",
] as const;
type AdminSection = (typeof adminSections)[number];

export const Route = createFileRoute("/_layout/_authenticated/dashboard/admin")(
  {
    beforeLoad: ({ context }) => {
      if (context.user?.role !== "admin") throw redirect({ to: "/dashboard" });
    },
    validateSearch: (search: Record<string, unknown>) => ({
      section: adminSections.includes(search.section as AdminSection)
        ? (search.section as AdminSection)
        : "overview",
    }),
    component: AdminPage,
  },
);

type AdminUser = User & { role?: string; banned?: boolean | null };
type Status = {
  counts: { users: number; organizations: number; githubInstallations: number };
  githubApp: Record<string, string | number | boolean | null>;
  authentication: Record<string, string | boolean | null>;
  instance: Record<string, string | boolean | null>;
};
type Organization = {
  id: string;
  name: string;
  slug: string;
  reposEnabled: boolean;
  createdAt: string;
  memberCount: number;
  githubInstallationCount: number;
};
type OidcConfig = {
  configs: {
    organizationId: string;
    claimPath: string;
    roleMappings: { role: string; teamId: string }[];
  }[];
  teams: {
    id: string;
    name: string;
    source: string;
    organizationId: string;
    organizationName: string;
  }[];
};

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(path), {
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || `Request failed (${response.status})`);
  }
  return response.json();
}

function AdminPage() {
  const { section } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [status, setStatus] = useState<Status>();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [oidc, setOidc] = useState<OidcConfig>();
  const [oidcOrganizationId, setOidcOrganizationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [nextStatus, nextOrganizations, userResult, oidcConfig] =
        await Promise.all([
          getJson<Status>("/admin/status"),
          getJson<Organization[]>("/admin/organizations"),
          authClient.admin.listUsers({ query: { limit: 100 } }),
          // Claim mapping only exists in single-org mode, where this endpoint
          // answers; in multi-org mode it deliberately 404s, which must not
          // fail the whole administration page.
          getJson<OidcConfig>("/oidc-team-sync").catch(() => undefined),
        ]);
      if (userResult.error)
        throw new Error(userResult.error.message || "Could not load users");
      setStatus(nextStatus);
      setOrganizations(nextOrganizations);
      setOidcOrganizationId(
        (current) => current || nextOrganizations[0]?.id || "",
      );
      setUsers(userResult.data?.users ?? []);
      setOidc(oidcConfig);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load system administration",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveOidc = async () => {
    if (!oidc) return;
    const organizationId = oidcOrganizationId;
    if (!organizationId) return;
    const config = oidc.configs.find(
      (item) => item.organizationId === organizationId,
    ) ?? { organizationId, claimPath: "roles", roleMappings: [] };
    setSaving(true);
    try {
      await getJson("/oidc-team-sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      toast.success("OIDC team sync saved");
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not save OIDC team sync",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageTitle title="System administration" />
      <Layout>
        <Layout.Header>
          <div className="flex w-full items-center gap-1">
            <Shield className="size-4" />
            <h1 className="text-xs text-card-foreground">
              System administration
            </h1>
          </div>
        </Layout.Header>
        <Layout.Content>
          <div className="space-y-6 p-6">
            <div>
              <h2 className="text-xl font-semibold">System administration</h2>
              <p className="text-sm text-muted-foreground">
                Instance-wide operations, separate from organization and account
                settings.
              </p>
            </div>
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="size-6 animate-spin" />
              </div>
            ) : error ? (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle>Administration data unavailable</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm text-destructive">{error}</p>
                  <Button onClick={() => void load()}>Retry</Button>
                </CardContent>
              </Card>
            ) : (
              status && (
                <Tabs
                  value={section}
                  onValueChange={(value) =>
                    navigate({
                      search: { section: value as AdminSection },
                      replace: true,
                    })
                  }
                >
                  <TabsList className="flex h-auto flex-wrap justify-start">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="users">Users</TabsTrigger>
                    <TabsTrigger value="organizations">
                      Organizations
                    </TabsTrigger>
                    <TabsTrigger value="github">GitHub App</TabsTrigger>
                    <TabsTrigger value="authentication">
                      Authentication / OIDC
                    </TabsTrigger>
                    <TabsTrigger value="instance">
                      Instance configuration
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent
                    value="overview"
                    className="grid gap-4 md:grid-cols-3"
                  >
                    <Metric
                      icon={<Users />}
                      label="Users"
                      value={status.counts.users}
                    />
                    <Metric
                      icon={<Building2 />}
                      label="Organizations"
                      value={status.counts.organizations}
                    />
                    <Metric
                      icon={<Github />}
                      label="GitHub installations"
                      value={status.counts.githubInstallations}
                    />
                  </TabsContent>
                  <TabsContent value="users">
                    <Section
                      title="Users"
                      icon={<Users />}
                      description="Real users returned by the Better Auth administrator API."
                    >
                      <div className="divide-y rounded-md border">
                        {users.map((user) => (
                          <div
                            className="flex items-center justify-between p-3"
                            key={user.id}
                          >
                            <div>
                              <div className="font-medium">{user.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {user.email}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Badge variant="secondary">
                                {user.role || "user"}
                              </Badge>
                              <Badge
                                variant={
                                  user.banned ? "destructive" : "outline"
                                }
                              >
                                {user.banned ? "Banned" : "Active"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  </TabsContent>
                  <TabsContent value="organizations">
                    <Section
                      title="Organizations"
                      icon={<Building2 />}
                      description="All organizations and current membership/integration totals."
                    >
                      <div className="divide-y rounded-md border">
                        {organizations.map((org) => (
                          <div
                            className="flex items-center justify-between p-3"
                            key={org.id}
                          >
                            <div>
                              <div className="font-medium">{org.name}</div>
                              <div className="text-xs text-muted-foreground">
                                /{org.slug} · created{" "}
                                {new Date(org.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="text-right text-sm">
                              <div>{org.memberCount} members</div>
                              <div className="text-muted-foreground">
                                {org.githubInstallationCount} GitHub
                                installations · repos{" "}
                                {org.reposEnabled ? "enabled" : "disabled"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  </TabsContent>
                  <TabsContent value="github">
                    <Section
                      title="GitHub App"
                      icon={<Github />}
                      description="Secret-free status from the API process environment."
                    >
                      <StatusGrid values={status.githubApp} />
                    </Section>
                  </TabsContent>
                  <TabsContent value="authentication">
                    <Section
                      title="Authentication / OIDC"
                      icon={<KeyRound />}
                      description="Provider status is environment-managed. Team sync mappings are persisted configuration."
                    >
                      <StatusGrid values={status.authentication} />
                      {oidc && (
                        <div className="mt-6 space-y-3">
                          {(() => {
                            const organizationId = oidcOrganizationId;
                            const config = oidc.configs.find(
                              (item) => item.organizationId === organizationId,
                            ) ?? {
                              organizationId: organizationId ?? "",
                              claimPath: "roles",
                              roleMappings: [],
                            };
                            const syncedTeams = oidc.teams.filter(
                              (team) =>
                                team.organizationId === organizationId &&
                                team.source === "oidc",
                            );
                            return (
                              <>
                                <label
                                  className="block text-sm font-medium"
                                  htmlFor="oidc-organization"
                                >
                                  Organization
                                </label>
                                <Select
                                  value={organizationId}
                                  onValueChange={setOidcOrganizationId}
                                >
                                  <SelectTrigger id="oidc-organization">
                                    <SelectValue placeholder="Select organization" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {organizations.map((organization) => (
                                      <SelectItem
                                        key={organization.id}
                                        value={organization.id}
                                      >
                                        {organization.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <label
                                  className="block text-sm font-medium"
                                  htmlFor="claim-path"
                                >
                                  OIDC team-role claim path
                                </label>
                                <Input
                                  id="claim-path"
                                  value={config.claimPath}
                                  onChange={(event) =>
                                    setOidc({
                                      ...oidc,
                                      configs: [
                                        ...oidc.configs.filter(
                                          (item) =>
                                            item.organizationId !==
                                            organizationId,
                                        ),
                                        {
                                          ...config,
                                          claimPath: event.target.value,
                                        },
                                      ],
                                    })
                                  }
                                />
                                <p className="text-xs text-muted-foreground">
                                  Existing mappings:{" "}
                                  {config.roleMappings.length}. IdP-synced
                                  teams: {syncedTeams.length}. Kaneo-managed
                                  teams cannot be targeted by OIDC mappings.
                                </p>
                                <div className="space-y-2">
                                  {config.roleMappings.map((mapping, index) => (
                                    <div
                                      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                                      key={`${mapping.role}:${mapping.teamId}`}
                                    >
                                      <Input
                                        aria-label={`OIDC role ${index + 1}`}
                                        placeholder="OIDC role"
                                        value={mapping.role}
                                        onChange={(event) => {
                                          const roleMappings = [
                                            ...config.roleMappings,
                                          ];
                                          roleMappings[index] = {
                                            ...mapping,
                                            role: event.target.value,
                                          };
                                          setOidc({
                                            ...oidc,
                                            configs: [
                                              ...oidc.configs.filter(
                                                (item) =>
                                                  item.organizationId !==
                                                  organizationId,
                                              ),
                                              { ...config, roleMappings },
                                            ],
                                          });
                                        }}
                                      />
                                      <Select
                                        value={mapping.teamId}
                                        onValueChange={(teamId) => {
                                          const roleMappings = [
                                            ...config.roleMappings,
                                          ];
                                          roleMappings[index] = {
                                            ...mapping,
                                            teamId,
                                          };
                                          setOidc({
                                            ...oidc,
                                            configs: [
                                              ...oidc.configs.filter(
                                                (item) =>
                                                  item.organizationId !==
                                                  organizationId,
                                              ),
                                              { ...config, roleMappings },
                                            ],
                                          });
                                        }}
                                      >
                                        <SelectTrigger
                                          aria-label={`IdP-synced team ${index + 1}`}
                                        >
                                          <SelectValue placeholder="Select team" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {syncedTeams.map((team) => (
                                            <SelectItem
                                              key={team.id}
                                              value={team.id}
                                            >
                                              {team.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <Button
                                        aria-label={`Remove mapping ${index + 1}`}
                                        variant="outline"
                                        onClick={() =>
                                          setOidc({
                                            ...oidc,
                                            configs: [
                                              ...oidc.configs.filter(
                                                (item) =>
                                                  item.organizationId !==
                                                  organizationId,
                                              ),
                                              {
                                                ...config,
                                                roleMappings:
                                                  config.roleMappings.filter(
                                                    (_, itemIndex) =>
                                                      itemIndex !== index,
                                                  ),
                                              },
                                            ],
                                          })
                                        }
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    disabled={syncedTeams.length === 0}
                                    variant="outline"
                                    onClick={() =>
                                      setOidc({
                                        ...oidc,
                                        configs: [
                                          ...oidc.configs.filter(
                                            (item) =>
                                              item.organizationId !==
                                              organizationId,
                                          ),
                                          {
                                            ...config,
                                            roleMappings: [
                                              ...config.roleMappings,
                                              {
                                                role: "",
                                                teamId:
                                                  syncedTeams[0]?.id ?? "",
                                              },
                                            ],
                                          },
                                        ],
                                      })
                                    }
                                  >
                                    Add role mapping
                                  </Button>
                                </div>
                                <Button
                                  disabled={
                                    saving ||
                                    !organizationId ||
                                    config.roleMappings.some(
                                      (mapping) =>
                                        !mapping.role.trim() || !mapping.teamId,
                                    )
                                  }
                                  onClick={() => void saveOidc()}
                                >
                                  {saving
                                    ? "Saving…"
                                    : "Save team sync configuration"}
                                </Button>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </Section>
                  </TabsContent>
                  <TabsContent value="instance">
                    <Section
                      title="Instance configuration"
                      icon={<ServerCog />}
                      description="Read-only runtime configuration. Change these values in the deployment environment and restart Kaneo."
                    >
                      <StatusGrid values={status.instance} />
                    </Section>
                  </TabsContent>
                </Tabs>
              )
            )}
          </div>
        </Layout.Content>
      </Layout>
    </>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
function Section({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
function StatusGrid({
  values,
}: {
  values: Record<string, string | number | boolean | null>;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {Object.entries(values).map(([key, value]) => (
        <div className="rounded-md border p-3" key={key}>
          <dt className="text-xs font-medium text-muted-foreground">
            {key
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (c) => c.toUpperCase())}
          </dt>
          <dd className="mt-1 text-sm">
            {typeof value === "boolean" ? (
              <Badge variant={value ? "default" : "outline"}>
                {value ? "Configured / enabled" : "Not configured / disabled"}
              </Badge>
            ) : (
              (value ?? "Not set")
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
