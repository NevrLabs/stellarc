import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import TicketPage from "@/components/ticket/ticket-page";
import { resolveTicketIdentity } from "@/fetchers/ticket/resolve-ticket-identity";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/$organizationSlug/tickets/$ticketKey",
)({
  loader: async ({ params }) => {
    let identity: Awaited<ReturnType<typeof resolveTicketIdentity>>;
    try {
      identity = await resolveTicketIdentity(
        params.organizationSlug,
        params.ticketKey,
      );
    } catch {
      throw notFound();
    }
    if (
      params.organizationSlug !== identity.organization.slug ||
      params.ticketKey !== identity.ticketKey
    ) {
      throw redirect({
        to: "/dashboard/$organizationSlug/tickets/$ticketKey",
        params: {
          organizationSlug: identity.organization.slug,
          ticketKey: identity.ticketKey,
        },
        replace: true,
      });
    }
    return identity;
  },
  component: RouteComponent,
});

function RouteComponent() {
  const identity = Route.useLoaderData();
  return (
    <TicketPage
      ticketId={identity.ticketId}
      boardId={identity.board.id}
      organizationId={identity.organization.id}
    />
  );
}
