import { Link, Section, Text } from "@react-email/components";
import React from "react";
import { EmailShell, styles } from "./shell";

void React;

export type OrganizationInvitationEmailProps = {
  organizationName: string;
  inviterName: string;
  inviterEmail: string;
  invitationLink: string;
  to: string;
  copy: OrganizationInvitationEmailCopy;
};

export type OrganizationInvitationEmailCopy = {
  subject: string;
  preview: string;
  title: string;
  subtitle: string;
  cta: string;
  sameEmail: string;
  ignore: string;
  footer: string;
};

function interpolate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return values[key] ?? "";
  });
}

const OrganizationInvitationEmail = ({
  organizationName,
  inviterName,
  inviterEmail,
  invitationLink,
  to,
  copy,
}: OrganizationInvitationEmailProps) => {
  const values = { organizationName, inviterName, inviterEmail };

  return (
    <EmailShell
      preview={interpolate(copy.preview, values)}
      title={interpolate(copy.title, values)}
      subtitle={interpolate(copy.subtitle, values)}
    >
      <Section>
        <Link style={styles.button} href={`${invitationLink}?email=${to}`}>
          {copy.cta}
        </Link>
        <Text style={styles.paragraph}>{copy.sameEmail}</Text>
        <Text style={styles.muted}>{copy.ignore}</Text>
        <Section style={styles.divider} />
        <Text style={styles.footer}>{copy.footer}</Text>
      </Section>
    </EmailShell>
  );
};

OrganizationInvitationEmail.PreviewProps = {
  organizationName: "Acme Inc",
  inviterName: "John Doe",
  inviterEmail: "john@acme.com",
  invitationLink: "https://kaneo.app/invite/abc123",
  to: "invitee@example.com",
  copy: {
    subject:
      "{{inviterName}} invited you to join {{organizationName}} on Kaneo",
    preview: "You're invited to {{organizationName}} on Kaneo",
    title: "Join {{organizationName}}",
    subtitle:
      "{{inviterName}} ({{inviterEmail}}) invited you to collaborate in Kaneo.",
    cta: "Accept invitation",
    sameEmail: "You can accept with the same email that received this message.",
    ignore: "If this wasn't expected, you can safely ignore this email.",
    footer: "Kaneo organization invitation",
  },
} as OrganizationInvitationEmailProps;

export default OrganizationInvitationEmail;
