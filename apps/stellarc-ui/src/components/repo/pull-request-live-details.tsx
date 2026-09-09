import { PatchDiff } from "@pierre/diffs/react";
import {
  CheckCircle2,
  CircleDot,
  Expand,
  ExternalLink,
  GitCommitHorizontal,
  ListTree,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PullRequestFileTree from "@/components/repo/pull-request-file-tree";
import PullRequestReviews from "@/components/repo/pull-request-reviews";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import useGetPullRequestChecks from "@/hooks/queries/repo/use-get-pull-request-checks";
import useGetPullRequestCommits from "@/hooks/queries/repo/use-get-pull-request-commits";
import useGetPullRequestFiles from "@/hooks/queries/repo/use-get-pull-request-files";
import { formatDateMedium } from "@/lib/format";
import type { RepoPullRequestCheck, RepoPullRequestFile } from "@/types/repo";

const Loading = () => (
  <div aria-label="Loading" className="space-y-2" role="status">
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-4 w-1/2" />
  </div>
);

/**
 * #89: clicking a tab must land on the tab instantly, so the panel never waits
 * on the network before painting. Three states, in priority order:
 *   - no data yet  -> skeleton (`isLoading`)
 *   - cached data  -> render it and mark it stale (`isFetching`), never blank it
 *   - error        -> error state
 * The strip also carries a thin indeterminate progress bar while the *active*
 * tab is fetching, which is the only affordance visible when the panel is
 * showing cached rows.
 */
const RefreshingHint = () => {
  const { t } = useTranslation();
  return (
    <p
      aria-live="polite"
      className="flex items-center gap-1.5 pb-2 text-muted-foreground text-xs"
      data-testid="pull-request-refreshing-hint"
      role="status"
    >
      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      {t("organization:repos.pullRequests.refreshing")}
    </p>
  );
};

function TabProgress({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
      data-testid="pull-request-tab-progress"
    >
      <div className="h-full w-full animate-pulse bg-primary/70" />
    </div>
  );
}

const ErrorState = () => (
  <p className="text-sm text-destructive">
    Could not load this section. Reload to try again.
  </p>
);

function CheckRow({ item }: { item: RepoPullRequestCheck }) {
  const successful = item.conclusion === "success";
  return (
    <a
      className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/60"
      href={item.url}
      rel="noreferrer"
      target="_blank"
    >
      {successful ? (
        <CheckCircle2 className="size-4 text-emerald-600" />
      ) : (
        <CircleDot className="size-4 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <span className="text-xs text-muted-foreground">
        {item.conclusion ?? item.status}
      </span>
      <ExternalLink className="size-3.5 text-muted-foreground" />
    </a>
  );
}

function DiffView({
  file,
  split,
}: {
  file: RepoPullRequestFile;
  split: boolean;
}) {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-md border bg-background"
      data-diff-style={split ? "split" : "unified"}
      data-testid="pull-request-diff-renderer"
    >
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 font-mono text-xs">
        <span
          className="min-w-0 flex-1 truncate"
          data-testid="pull-request-selected-file"
        >
          {file.filename}
        </span>
        <span className="text-emerald-600">+{file.additions}</span>
        <span className="text-destructive">−{file.deletions}</span>
      </div>
      {file.patch ? (
        <PatchDiff
          disableWorkerPool
          options={{
            diffStyle: split ? "split" : "unified",
            disableFileHeader: true,
            overflow: "scroll",
            themeType: "system",
          }}
          patch={`diff --git a/${file.filename} b/${file.filename}\n--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}`}
        />
      ) : (
        <div className="space-y-2 px-4 py-6 text-sm text-muted-foreground">
          <p>Binary or oversized file — no patch is available.</p>
          <p className="text-xs">
            Open the pull request externally to inspect or download this file.
          </p>
        </div>
      )}
    </div>
  );
}

export default function PullRequestLiveDetails({
  repoId,
  number,
  discussion,
  onTabChange,
}: {
  repoId: string;
  number: number;
  discussion: ReactNode;
  /**
   * Reports the active tab so the surrounding layout can react — the metadata
   * sidebar is hidden on the Diffs tab to give the diff full width.
   */
  onTabChange?: (tab: string) => void;
}) {
  const files = useGetPullRequestFiles(repoId, number);
  const commits = useGetPullRequestCommits(repoId, number);
  const checks = useGetPullRequestChecks(repoId, number);
  const [selectedFilename, setSelectedFilename] = useState<string>();
  const [split, setSplit] = useState(false);
  // #89: the tab strip is CONTROLLED here so a click switches the visible panel
  // in the same render as the click, independent of any in-flight query. The
  // panels below key their skeleton off `isLoading` (no data yet) and their
  // "refreshing" hint off `isFetching` (cached data being revalidated), so the
  // switch is never gated on the network.
  const [activeTab, setActiveTab] = useState("discussion");
  const [fullscreen, setFullscreen] = useState(false);
  // The changed-files sidebar is persistent: it stays open across file jumps,
  // so its open state lives here rather than inside a dismissing popover.
  const [treeOpen, setTreeOpen] = useState(true);
  const [fullscreenTreeOpen, setFullscreenTreeOpen] = useState(true);
  // The article header above us is `md:sticky md:top-0`, so the tab strip has to
  // park directly BELOW it rather than at top:0 (otherwise the two overlap).
  // Its height is content-driven (title wraps, labels, branch chip), so measure
  // it instead of hard-coding an offset.
  const tabsRef = useRef<HTMLDivElement>(null);
  const propertiesRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [tabsHeight, setTabsHeight] = useState(0);
  const [propertiesHeight, setPropertiesHeight] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the properties row mounts only when the Diffs tab becomes active
  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const header = tabs.closest("article")?.querySelector(":scope > header");
    const measure = () => {
      setHeaderHeight(header ? header.getBoundingClientRect().height : 0);
      setTabsHeight(tabs.getBoundingClientRect().height);
      setPropertiesHeight(
        propertiesRef.current?.getBoundingClientRect().height ?? 0,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    observer.observe(tabs);
    if (propertiesRef.current) observer.observe(propertiesRef.current);
    return () => observer.disconnect();
  }, [activeTab]);
  const fileNames = (files.data?.files ?? []).map((file) => file.filename);
  const selectedFile =
    files.data?.files.find((file) => file.filename === selectedFilename) ??
    files.data?.files[0];

  useEffect(() => {
    if (selectedFile && selectedFilename !== selectedFile.filename) {
      setSelectedFilename(selectedFile.filename);
    }
  }, [selectedFile, selectedFilename]);

  const checkItems = [
    ...(checks.data?.checks ?? []),
    ...(checks.data?.runs ?? []),
  ];
  const unavailableSources = (checks.data?.unavailable ?? []).map((source) =>
    source === "checks" ? "check runs" : "workflow runs",
  );

  return (
    <Tabs
      className="gap-0"
      onValueChange={(value) => {
        setActiveTab(String(value));
        onTabChange?.(String(value));
      }}
      value={activeTab}
      data-testid="pull-request-live-details"
    >
      {/* Sticky tab strip. Two nested elements on purpose: the OUTER div is the
          sticky one and must NOT create a scroll container (an `overflow-*`
          value other than `visible` on the sticky element itself makes the
          strip clip its own contents), while the INNER div keeps the
          horizontal overflow scrolling for narrow viewports. `top` is the
          measured height of the `md:sticky md:top-0` article header so the two
          stack instead of overlapping, and z-10 keeps it under the header's
          z-20. */}
      <div
        className="sticky z-10 border-b bg-background/95 backdrop-blur"
        data-testid="pull-request-tabs-strip"
        ref={tabsRef}
        style={{ top: headerHeight }}
      >
        <div className="relative overflow-x-auto px-4 sm:px-6">
          <TabProgress
            active={
              (activeTab === "commits" && commits.isFetching) ||
              (activeTab === "checks" && checks.isFetching) ||
              (activeTab === "diffs" && files.isFetching)
            }
          />
          <TabsList
            aria-label="Pull request sections"
            className="min-w-max"
            variant="underline"
          >
            <TabsTab aria-label="Discussions" value="discussion">
              Discussions
            </TabsTab>
            <TabsTab aria-label="Commits" value="commits">
              Commits{commits.data ? ` (${commits.data.commits.length})` : ""}
            </TabsTab>
            <TabsTab aria-label="Checks" value="checks">
              Checks
            </TabsTab>
            <TabsTab aria-label="Reviews" value="reviews">
              Reviews
            </TabsTab>
            <TabsTab aria-label="Diffs" value="diffs">
              Diffs{files.data ? ` (${files.data.totals.changedFiles})` : ""}
            </TabsTab>
          </TabsList>
        </div>
      </div>

      <TabsPanel value="discussion">{discussion}</TabsPanel>
      <TabsPanel className="px-4 py-5 sm:px-6" value="reviews">
        <PullRequestReviews number={number} repoId={repoId} />
      </TabsPanel>
      <TabsPanel className="px-4 py-5 sm:px-6" value="commits">
        {commits.isFetching && commits.data ? <RefreshingHint /> : null}
        {commits.isLoading ? (
          <Loading />
        ) : commits.isError ? (
          <ErrorState />
        ) : commits.data?.commits.length ? (
          <div className="divide-y">
            {commits.data.commits.map((commit) => (
              <a
                className="flex items-start gap-3 py-3 text-sm"
                href={commit.url}
                key={commit.sha}
                rel="noreferrer"
                target="_blank"
              >
                <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {commit.message.split("\n")[0]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {commit.authorLogin ?? "Unknown author"}
                    {commit.committedAt
                      ? ` · ${formatDateMedium(commit.committedAt)}`
                      : ""}
                  </span>
                </span>
                <code className="text-xs text-muted-foreground">
                  {commit.sha.slice(0, 7)}
                </code>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No commits.</p>
        )}
      </TabsPanel>

      <TabsPanel className="px-4 py-5 sm:px-6" value="checks">
        {checks.isFetching && checks.data ? <RefreshingHint /> : null}
        {checks.isLoading ? (
          <Loading />
        ) : checks.isError ? (
          <ErrorState />
        ) : checkItems.length ? (
          <div>
            {checkItems.map((item) => (
              <CheckRow item={item} key={`${item.name}-${item.url}`} />
            ))}
            {unavailableSources.length ? (
              <p className="pt-2 text-sm text-muted-foreground">
                {unavailableSources.join(" and ")} unavailable — the GitHub App
                is missing read access.
              </p>
            ) : null}
          </div>
        ) : unavailableSources.length ? (
          <p className="text-sm text-muted-foreground">
            Cannot read {unavailableSources.join(" or ")} — the GitHub App is
            missing read access, so CI status is unknown.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No checks or workflow runs for this pull request.
          </p>
        )}
      </TabsPanel>

      <TabsPanel
        className="min-w-0 px-4 py-5 sm:px-6"
        data-testid="pull-request-diff-workspace"
        value="diffs"
      >
        {files.isFetching && files.data ? <RefreshingHint /> : null}
        {files.isLoading ? (
          <Loading />
        ) : files.isError ? (
          <ErrorState />
        ) : selectedFile ? (
          <>
            {/* Floating diff properties bar. It was previously a plain
                `mb-3` row that scrolled away, and giving it a background is
                what stops the diff rows from showing through / clipping it.
                It sticks below BOTH the article header and the tab strip, so
                the offset is the sum of the two measured heights. Negative
                horizontal margins + matching padding let the opaque
                background span the panel's full width instead of leaving a
                transparent gutter the diff bleeds into. */}
            <div
              className="-mx-4 sticky z-[9] mb-3 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6"
              data-testid="pull-request-diff-properties"
              ref={propertiesRef}
              style={{ top: headerHeight + tabsHeight }}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Button
                  aria-expanded={treeOpen}
                  aria-label={
                    treeOpen ? "Hide changed files" : "Show changed files"
                  }
                  onClick={() => setTreeOpen((open) => !open)}
                  size="icon-sm"
                  variant="ghost"
                >
                  {treeOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
                </Button>
                <span className="text-emerald-600">
                  +{files.data?.totals.additions}
                </span>{" "}
                <span className="text-destructive">
                  −{files.data?.totals.deletions}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  aria-label="Unified"
                  aria-pressed={!split}
                  onClick={() => setSplit(false)}
                  size="sm"
                  variant={split ? "ghost" : "secondary"}
                >
                  <ListTree /> Unified
                </Button>
                <Button
                  aria-label="Side-by-side"
                  aria-pressed={split}
                  onClick={() => setSplit(true)}
                  size="sm"
                  variant={split ? "secondary" : "ghost"}
                >
                  <PanelsTopLeft /> Side-by-side
                </Button>
                <Button
                  aria-label="Open diff fullscreen"
                  onClick={() => setFullscreen(true)}
                  size="icon-sm"
                  variant="outline"
                >
                  <Expand />
                </Button>
              </div>
            </div>
            <div className="min-w-0">
              {/* GitHub-style: hideable tree column on the left, diff to its
                  right. Not an overlay — an overlay covered the code. */}
              <div className="flex min-w-0 items-start gap-4">
                {treeOpen ? (
                  <PullRequestFileTree
                    filenames={fileNames}
                    idPrefix="inline"
                    onOpenChange={setTreeOpen}
                    onSelect={(path) => {
                      setSelectedFilename(path);
                      document
                        .getElementById(`diff-file-${encodeURIComponent(path)}`)
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                    }}
                    open
                    selectedPath={selectedFile.filename}
                    showHeader={false}
                    stickyTop={headerHeight + tabsHeight + propertiesHeight}
                  />
                ) : null}
                <div className="min-w-0 flex-1 space-y-4">
                  {files.data?.files.map((file) => (
                    <section
                      className="scroll-mt-4"
                      id={`diff-file-${encodeURIComponent(file.filename)}`}
                      key={file.filename}
                    >
                      <DiffView file={file} split={split} />
                    </section>
                  ))}
                </div>
              </div>
            </div>
            <Dialog open={fullscreen} onOpenChange={setFullscreen}>
              <DialogPopup
                bottomStickOnMobile={false}
                className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)]"
              >
                <div className="border-b px-5 py-4 pr-12">
                  <DialogTitle className="text-base">
                    Pull request diff
                  </DialogTitle>
                  <DialogDescription>
                    Full-screen code comparison
                  </DialogDescription>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
                  {/* Tree column left, diff right. The diff wrapper must be a
                      full-height flex child (NOT items-start) or it sizes to its
                      content and the dialog never scrolls. */}
                  <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
                    <PullRequestFileTree
                      fillHeight
                      filenames={fileNames}
                      idPrefix="fullscreen"
                      onOpenChange={setFullscreenTreeOpen}
                      onSelect={(path) => {
                        setSelectedFilename(path);
                        document
                          .getElementById(
                            `fullscreen-diff-file-${encodeURIComponent(path)}`,
                          )
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      }}
                      open={fullscreenTreeOpen}
                      selectedPath={selectedFilename}
                    />
                    <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto">
                      {files.data?.files.map((file) => (
                        <section
                          className="scroll-mt-2"
                          id={`fullscreen-diff-file-${encodeURIComponent(file.filename)}`}
                          key={file.filename}
                        >
                          <DiffView file={file} split={split} />
                        </section>
                      ))}
                    </div>
                  </div>
                </div>
              </DialogPopup>
            </Dialog>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No changed files.</p>
        )}
      </TabsPanel>
    </Tabs>
  );
}
