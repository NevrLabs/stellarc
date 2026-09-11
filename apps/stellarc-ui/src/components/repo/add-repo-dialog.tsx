import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Github, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getApiUrl } from "@/fetchers/get-api-url";
import {
  type GithubRepository,
  getOrganizationGithubRepositories,
} from "@/fetchers/organization-github/organization-github";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";

export function AddRepoDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<GithubRepository>();
  const [error, setError] = useState("");
  const {
    data: repositories = [],
    isLoading,
    error: loadError,
  } = useQuery({
    queryKey: ["organization-github-repositories", organizationId],
    queryFn: () => getOrganizationGithubRepositories(organizationId),
    enabled: open,
  });
  /*
    Repos already connected to this org. The search list marks them and makes
    them unselectable — connecting a duplicate used to surface as a raw 500
    from the unique constraint (now a 409, but the user should never get
    that far).
  */
  const { data: connectedRepos = [] } = useGetRepos({
    organizationId,
    enabled: open,
  });
  const connectedKeys = useMemo(
    () =>
      new Set(
        connectedRepos.map((repo) =>
          `${repo.owner}/${repo.name}`.toLowerCase(),
        ),
      ),
    [connectedRepos],
  );
  const isConnected = (repo: GithubRepository) =>
    connectedKeys.has(`${repo.owner}/${repo.name}`.toLowerCase());
  const filtered = useMemo(
    () =>
      repositories.filter(
        (repo) =>
          repo.fullName.toLowerCase().includes(search.toLowerCase()) ||
          repo.description?.toLowerCase().includes(search.toLowerCase()),
      ),
    [repositories, search],
  );
  const connect = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Choose a repository first.");
      const response = await fetch(getApiUrl("/repo"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          provider: "github",
          owner: selected.owner,
          name: selected.name,
          installationId: selected.installationId,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const repo = (await response.json()) as { id: string };
      // The first mirror of a real repository paginates every issue and pull
      // request, which runs past the 60s an edge proxy holds a request open —
      // connecting returned 504 even though the repo had been created. Start
      // the mirror in the background and let the repo populate.
      const sync = await fetch(
        getApiUrl(`/repo/${repo.id}/sync?background=true`),
        { method: "POST", credentials: "include" },
      );
      // The repo exists at this point. A failed *kick-off* is worth surfacing,
      // but never treat a still-running mirror as a failed connect.
      if (!sync.ok) throw new Error(await sync.text());
      return repo;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["repos", organizationId],
      });
      setSelected(undefined);
      setSearch("");
      setError("");
      onOpenChange(false);
    },
    onError: (cause) =>
      setError(
        cause instanceof Error ? cause.message : "Could not connect repository",
      ),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <Github className="size-5" />
            Connect GitHub repository
          </DialogTitle>
          <DialogDescription>
            Choose a repository from GitHub accounts connected in Organization
            settings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search repositories…"
            />
          </div>
          {isLoading && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Loading GitHub repositories…
            </p>
          )}
          {loadError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              No GitHub account is connected for this organization. Add one in
              Organization settings → GitHub.
            </p>
          )}
          {!isLoading && !loadError && filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No repositories match. Connect a GitHub account or adjust your
              search.
            </p>
          )}
          <div className="max-h-[360px] divide-y overflow-y-auto rounded-md border">
            {filtered.map((repo) => {
              const connected = isConnected(repo);
              return (
                <button
                  key={repo.id}
                  type="button"
                  disabled={connected}
                  onClick={() => setSelected(repo)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                    connected
                      ? "cursor-default opacity-60"
                      : "hover:bg-muted/60"
                  } ${selected?.id === repo.id ? "bg-primary/5 ring-1 ring-inset ring-primary" : ""}`}
                >
                  <Github className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{repo.fullName}</span>
                    {repo.description && (
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {repo.description}
                      </span>
                    )}
                  </span>
                  {connected ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary"
                      data-testid="repo-already-connected"
                    >
                      <Check className="size-3" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {repo.isPrivate ? "Private" : "Public"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selected || connect.isPending}
            onClick={() => connect.mutate()}
          >
            {connect.isPending
              ? "Connecting and syncing…"
              : "Connect repository"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
