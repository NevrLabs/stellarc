import { render } from "@react-email/render";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import frFR from "../../../../i18n/fr-FR.json";
import OrganizationInvitationEmail from "./organization-invitation";

describe("OrganizationInvitationEmail", () => {
  it("renders the invitation in French for a French locale", async () => {
    const html = await render(
      createElement(OrganizationInvitationEmail, {
        organizationName: "Équipe Produit",
        inviterName: "Camille",
        inviterEmail: "camille@example.com",
        invitationLink: "https://kaneo.example/invite/abc",
        to: "invite@example.com",
        copy: frFR.invitations.email,
      }),
    );

    expect(html).toContain("Rejoindre Équipe Produit");
    expect(html).toContain("Accepter l’invitation");
    expect(html).toContain("Camille (camille@example.com)");
  });
});
