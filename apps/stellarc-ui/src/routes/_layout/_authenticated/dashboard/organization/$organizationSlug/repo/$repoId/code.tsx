import { CodeView } from "@pierre/diffs/react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  File,
  FileCode2,
  GitBranch,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import RepoLayout from "@/components/common/repo-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import PageTitle from "@/components/page-title";
import { MarkdownRenderer } from "@/components/public-board/markdown-renderer";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepo from "@/hooks/queries/repo/use-get-repo";
import useGetRepoContents from "@/hooks/queries/repo/use-get-repo-contents";
import useGetRepoTree from "@/hooks/queries/repo/use-get-repo-tree";
import type { RepoContentEntry } from "@/types/repo";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/code",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    path: typeof search.path === "string" ? search.path : "",
    ref: typeof search.ref === "string" ? search.ref : undefined,
  }),
});

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function languageForPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  const languages: Record<string, string> = {
    c: "cpp",
    cc: "cpp",
    cpp: "cpp",
    css: "css",
    go: "go",
    htm: "html",
    html: "html",
    java: "java",
    js: "javascript",
    json: "json",
    jsx: "javascript",
    md: "markdown",
    mjs: "javascript",
    py: "python",
    rs: "rust",
    sh: "bash",
    sql: "sql",
    toml: "toml",
    ts: "typescript",
    tsx: "typescript",
    txt: "text",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
  };
  return languages[extension ?? ""] ?? "text";
}

function isRichFile(path: string) {
  return /\.(md|mdx|html?)$/i.test(path);
}

function RepoFileTree({
  entries,
  onSelect,
  selectedPath,
}: {
  entries: RepoContentEntry[];
  onSelect: (path: string) => void;
  selectedPath: string;
}) {
  const paths = useMemo(
    () =>
      entries.map((entry) =>
        entry.type === "dir" ? `${entry.path}/` : entry.path,
      ),
    [entries],
  );
  const { model } = useFileTree({
    itemHeight: 28,
    onSelectionChange: (selectedPaths) => {
      const entry = selectedPaths
        .map((path) => (path.endsWith("/") ? path.slice(0, -1) : path))
        .map((path) => entries.find((candidate) => candidate.path === path))
        .find(
          (candidate) => Boolean(candidate?.path) && candidate?.type !== "dir",
        );
      if (entry) onSelect(entry.path);
    },
    paths: [],
  });

  useEffect(() => {
    model.resetPaths(paths);
  }, [model, paths]);

  useEffect(() => {
    if (!selectedPath) return;
    model.getItem(selectedPath)?.select();
  }, [model, selectedPath]);

  return <FileTree className="h-full" model={model} />;
}

function FileContent({
  content,
  path,
  rich,
}: {
  content: string;
  path: string;
  rich: boolean;
}) {
  if (rich) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none px-5 py-4">
        <MarkdownRenderer content={content} />
      </div>
    );
  }

  return (
    <CodeView
      className="min-h-full"
      disableWorkerPool
      items={[
        {
          file: {
            contents: content,
            lang: languageForPath(path),
            name: path,
          },
          id: path,
          type: "file",
        },
      ]}
      options={{
        disableFileHeader: true,
        overflow: "scroll",
        themeType: "system",
      }}
    />
  );
}

function RouteComponent() {
  const { organizationSlug, repoId } = Route.useParams();
  const { data: activeOrganization } = useActiveOrganization();
  const organizationId = activeOrganization?.id ?? "";
  const { path, ref } = Route.useSearch();
  const { data: repo } = useGetRepo({ id: repoId });
  const tree = useGetRepoTree({ repoId, ref });
  const [selectedPath, setSelectedPath] = useState(path);
  const current = useGetRepoContents({
    repoId,
    path: selectedPath,
    ref,
    enabled: Boolean(selectedPath),
  });
  const [view, setView] = useState<"source" | "render">("source");

  const repoTitle = repo ? `${repo.owner}/${repo.name}` : repoId;
  const file = current.data?.type === "file" ? current.data.file : null;
  const richAvailable = Boolean(file && isRichFile(file.path));

  useEffect(() => {
    setSelectedPath(path);
  }, [path]);
  return (
    <>
      <PageTitle title={`${repoTitle} · Code`} />
      <RepoLayout organizationId={organizationId} repoId={repoId}>
        <div className="flex h-[calc(100vh-8rem)] w-full flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {selectedPath || repoTitle}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GitBranch className="size-3.5" />
              {ref || repo?.defaultBranch || "default branch"}
            </span>
          </div>

          <div className="flex min-h-0 flex-1">
            <aside
              aria-label="File explorer"
              className={`${selectedPath ? "hidden md:block" : "block"} w-full shrink-0 overflow-y-auto py-2 pr-1 pl-1 md:w-64 md:border-r`}
            >
              <ErrorBoundary
                fallbackDescription="The file tree could not be rendered. You can still reload to retry."
                fallbackTitle="File explorer unavailable"
              >
                {tree.isLoading ? (
                  <div className="space-y-1 px-2 py-1">
                    {[1, 2, 3].map((item) => (
                      <Skeleton className="h-5 w-32" key={item} />
                    ))}
                  </div>
                ) : tree.error ? (
                  <p className="px-3 py-2 text-sm text-destructive">
                    {tree.error.message}
                  </p>
                ) : (
                  <RepoFileTree
                    entries={tree.data?.entries ?? []}
                    onSelect={(nextPath) => {
                      setSelectedPath(nextPath);
                      setView("source");
                    }}
                    selectedPath={selectedPath}
                  />
                )}
              </ErrorBoundary>
            </aside>

            <section
              aria-label="File viewer"
              className={`${selectedPath ? "block" : "hidden md:block"} min-w-0 flex-1 overflow-y-auto`}
            >
              <ErrorBoundary
                className="m-4"
                fallbackDescription="This file could not be rendered. Pick another file or retry."
                fallbackTitle="File preview unavailable"
              >
                {current.error ? (
                  <Empty className="min-h-64">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <TriangleAlert />
                      </EmptyMedia>
                      <EmptyTitle>Unable to load this path</EmptyTitle>
                      <EmptyDescription>
                        {current.error.message}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : current.isLoading ? (
                  <div className="space-y-2 p-4">
                    {[1, 2, 3, 4, 5, 6].map((item) => (
                      <Skeleton className="h-4 w-full" key={item} />
                    ))}
                  </div>
                ) : file ? (
                  <>
                    <div className="sticky top-0 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
                      <Button
                        className="w-full justify-start md:hidden"
                        onClick={() => setSelectedPath("")}
                        size="sm"
                        variant="ghost"
                      >
                        <ArrowLeft className="size-4" />
                        Back to files
                      </Button>
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <FileCode2 className="size-3.5" />
                        {file.path}
                      </span>
                      <span className="flex items-center gap-3">
                        <span>{formatBytes(file.size)}</span>
                        {richAvailable && (
                          <span className="flex items-center gap-1">
                            <Button
                              onClick={() => setView("source")}
                              size="xs"
                              variant={
                                view === "source" ? "secondary" : "ghost"
                              }
                            >
                              Source
                            </Button>
                            <Button
                              onClick={() => setView("render")}
                              size="xs"
                              variant={
                                view === "render" ? "secondary" : "ghost"
                              }
                            >
                              Preview
                            </Button>
                          </span>
                        )}
                      </span>
                    </div>
                    {file.isBinary || !file.content ? (
                      <Empty className="min-h-64">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <File />
                          </EmptyMedia>
                          <EmptyTitle>Binary file</EmptyTitle>
                          <EmptyDescription>
                            This file cannot be displayed as text.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      <FileContent
                        content={file.content}
                        path={file.path}
                        rich={view === "render" && richAvailable}
                      />
                    )}
                  </>
                ) : (
                  <Empty className="min-h-64">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FileCode2 />
                      </EmptyMedia>
                      <EmptyTitle>Select a file</EmptyTitle>
                      <EmptyDescription>
                        Choose a file in the explorer to view its contents.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </ErrorBoundary>
            </section>
          </div>
        </div>
      </RepoLayout>
    </>
  );
}
