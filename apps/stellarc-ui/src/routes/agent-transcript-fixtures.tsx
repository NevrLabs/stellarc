import { createFileRoute } from "@tanstack/react-router";
import { AgentTranscriptFixtures } from "@/components/ai/agent-transcript-fixtures";
import PageTitle from "@/components/page-title";

// Dev-only fixture surface (NEVR-223): no nav entry, no API calls — the
// frozen screenshot suites stub nothing here because the patterns render
// from recorded run fixtures. Same contract as /test-error.
export const Route = createFileRoute("/agent-transcript-fixtures")({
  component: AgentTranscriptFixturesRoute,
});

function AgentTranscriptFixturesRoute() {
  return (
    <main className="min-h-svh bg-background">
      <PageTitle
        title="Agent transcript fixtures"
        suffix={undefined}
        hideAppName
      />
      <h1 className="sr-only">Agent transcript fixtures</h1>
      <AgentTranscriptFixtures />
    </main>
  );
}
