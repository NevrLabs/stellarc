import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import useInviteOrganizationMember from "@/hooks/mutations/organization-member/use-invite-organization-member";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { parseInviteEmails } from "@/lib/parse-invite-emails";
import { toast } from "@/lib/toast";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Textarea } from "../ui/textarea";

type Props = {
  open: boolean;
  onClose: () => void;
};

const teamMemberSchema = z.object({
  email: z.string(),
});

type TeamMemberFormValues = z.infer<typeof teamMemberSchema>;

/** Per-address outcome, so a partial failure still reports what did land. */
type InviteFailure = { email: string; reason: string };

function InviteTeamMemberModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { mutateAsync } = useInviteOrganizationMember();
  const queryClient = useQueryClient();
  const { data: organization } = useActiveOrganization();
  const organizationId = organization?.id;
  const { canInviteUsers } = useOrganizationPermission();
  const canInvite = canInviteUsers();
  const [failures, setFailures] = useState<InviteFailure[]>([]);
  const [isSending, setIsSending] = useState(false);

  const form = useForm<TeamMemberFormValues>({
    resolver: standardSchemaResolver(teamMemberSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async ({ email }: TeamMemberFormValues) => {
    if (!organizationId) {
      toast.error(t("team:inviteModal.error"));
      return;
    }
    if (!canInvite) {
      // Defense-in-depth: parent gates the trigger, but if the modal is
      // somehow open without permission we refuse rather than firing a
      // mutation the server will reject.
      toast.error(t("team:inviteModal.error"));
      return;
    }

    const { emails, invalid } = parseInviteEmails(email);

    if (invalid.length > 0) {
      form.setError("email", {
        message: t("team:inviteModal.invalidEmails", {
          emails: invalid.join(", "),
        }),
      });
      return;
    }
    if (emails.length === 0) {
      form.setError("email", {
        message: t("team:inviteModal.emailRequired"),
      });
      return;
    }

    setFailures([]);
    setIsSending(true);

    // Sent one at a time on purpose: better-auth invites a single address per
    // call, and a rejected address (already a member, already invited) must not
    // discard the invitations that did succeed.
    const failed: InviteFailure[] = [];
    let sent = 0;
    for (const address of emails) {
      try {
        await mutateAsync({
          email: address,
          organizationId,
          role: "member",
        });
        sent++;
      } catch (error) {
        failed.push({
          email: address,
          reason:
            error instanceof Error
              ? error.message
              : t("team:inviteModal.error"),
        });
      }
    }

    setIsSending(false);
    await queryClient.refetchQueries({
      queryKey: ["organization-members", organizationId],
    });

    if (sent > 0) {
      toast.success(t("team:inviteModal.successCount", { count: sent }));
    }

    // Keep the dialog open when something failed so the reason stays readable
    // and the remaining addresses can be corrected and retried.
    if (failed.length > 0) {
      setFailures(failed);
      form.setValue("email", failed.map((failure) => failure.email).join("\n"));
      toast.error(t("team:inviteModal.failedCount", { count: failed.length }));
      return;
    }

    await resetInviteTeamMember();
    onClose();
  };

  const resetInviteTeamMember = async () => {
    if (organizationId) {
      await queryClient.invalidateQueries({
        queryKey: ["organization-members", organizationId],
      });
    }
    setFailures([]);
    form.reset();
  };

  const resetAndCloseModal = () => {
    resetInviteTeamMember();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={resetAndCloseModal}>
      <DialogPopup className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>{t("team:inviteModal.title")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <DialogPanel>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("team:inviteModal.emailsLabel")}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        autoFocus
                        className="min-h-24 resize-y"
                        data-testid="invite-emails-input"
                        placeholder={t("team:inviteModal.emailsPlaceholder")}
                        rows={4}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t("team:inviteModal.emailsHint")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {failures.length > 0 && (
                <ul
                  className="mt-3 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
                  data-testid="invite-failures"
                >
                  {failures.map((failure) => (
                    <li key={failure.email}>
                      <span className="font-medium">{failure.email}</span>:{" "}
                      {failure.reason}
                    </li>
                  ))}
                </ul>
              )}
            </DialogPanel>

            <DialogFooter>
              <DialogClose
                render={<Button variant="outline" size="sm" type="button" />}
              >
                {t("common:actions.cancel")}
              </DialogClose>
              <Button
                type="submit"
                size="sm"
                disabled={!organizationId || !canInvite || isSending}
              >
                {t("team:inviteModal.sendInvitation")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogPopup>
    </Dialog>
  );
}

export default InviteTeamMemberModal;
