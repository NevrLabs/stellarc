import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { z } from "zod/v4";
import { Logo } from "@/components/common/logo";
import PageTitle from "@/components/page-title";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import useCreateOrganization from "@/hooks/queries/organization/use-create-organization";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";

type OnboardingStep = "organization" | "success";

export type OrganizationFormValues = {
  name: string;
  description?: string;
};

function useFadeTransition() {
  const reduceMotion = useReducedMotion();
  return {
    initial: { opacity: 0, y: reduceMotion ? 0 : 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduceMotion ? 0 : -20 },
  };
}

export function OnboardingFlow() {
  const fadeTransition = useFadeTransition();
  const { t } = useTranslation();
  const [step, setStep] = useState<OnboardingStep>("organization");
  const [createdOrganizationName, setCreatedOrganizationName] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mutateAsync: createOrganization, isPending } =
    useCreateOrganization();
  const { user } = useAuth();

  const organizationSchema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .min(1, t("auth:onboarding.validation.organizationNameRequired")),
        description: z.string().optional(),
      }),
    [t],
  );

  const form = useForm<OrganizationFormValues>({
    resolver: standardSchemaResolver(organizationSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const onSubmit = async (data: OrganizationFormValues) => {
    try {
      const organization = await createOrganization({
        name: data.name.trim(),
        description: data.description?.trim() || "",
        userId: user?.id,
      });

      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await authClient.organization.setActive({
        organizationId: organization.id,
      });
      setCreatedOrganizationName(data.name);
      toast.success(t("auth:onboarding.toast.organizationCreated"));

      setStep("success");

      setTimeout(() => {
        navigate({
          to: "/dashboard/organization/$organizationSlug",
          params: { organizationSlug: organization.id },
          replace: true,
        });
      }, 1500);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("auth:onboarding.toast.createFailed"),
      );
    }
  };

  const renderOrganizationStep = () => (
    <motion.div
      key="organization"
      variants={fadeTransition}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="w-full max-w-sm mx-auto"
    >
      <Logo className="mx-auto mb-6 w-full flex items-end justify-center" />

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-foreground mb-2">
            {t("auth:onboarding.createOrganizationTitle")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("auth:onboarding.createOrganizationSubtitle")}
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      {t("auth:onboarding.organizationName")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t(
                          "auth:onboarding.organizationNamePlaceholder",
                        )}
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-muted-foreground">
                      {t("auth:onboarding.descriptionOptional")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t(
                          "auth:onboarding.descriptionPlaceholder",
                        )}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" disabled={isPending} className="w-full mt-4">
              {isPending
                ? t("auth:onboarding.creating")
                : t("auth:onboarding.createOrganization")}
            </Button>
          </form>
        </Form>
      </div>
    </motion.div>
  );

  const renderSuccessStep = () => (
    <motion.div
      key="success"
      variants={fadeTransition}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="w-full max-w-sm mx-auto"
    >
      <Logo className="mx-auto mb-6 w-full flex items-end justify-center" />

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-success/12 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-6 w-6 text-success-foreground" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">
              {t("auth:onboarding.organizationCreatedTitle")}
            </h1>
            <p className="text-muted-foreground text-sm">
              <Trans
                i18nKey="auth:onboarding.redirectingToOrganization"
                values={{ name: createdOrganizationName }}
                components={{ name: <strong /> }}
              />
            </p>
          </div>

          <div className="w-6 h-6 mx-auto">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-border border-t-foreground" />
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <>
      <PageTitle title={t("auth:onboarding.organizationPageTitle")} />
      <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-4">
        <AnimatePresence mode="wait">
          {step === "organization" && renderOrganizationStep()}
          {step === "success" && renderSuccessStep()}
        </AnimatePresence>
      </div>
    </>
  );
}
