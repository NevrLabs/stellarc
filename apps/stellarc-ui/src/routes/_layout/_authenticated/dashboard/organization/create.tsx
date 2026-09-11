import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import useCreateOrganization from "@/hooks/queries/organization/use-create-organization";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/organization/create",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useCreateOrganization();

  useEffect(() => {
    if (inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const createdOrganization = await mutateAsync({ name, description });
      toast.success(t("organization:create.success"));
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });

      await authClient.organization.setActive({
        organizationSlug: createdOrganization.slug,
      });

      navigate({
        to: "/dashboard/organization/$organizationSlug",
        params: {
          organizationSlug: createdOrganization.slug,
        },
        replace: true,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("organization:create.error"),
      );
    }
  };

  return (
    <>
      <PageTitle title={t("organization:create.pageTitle")} />
      <div className="min-h-screen w-full bg-background flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-md">
          <Card className="shadow-sm">
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                </div>

                <h1 className="text-2xl font-semibold text-foreground mb-2">
                  {t("organization:create.heading")}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {t("organization:create.subtitle")}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="organization-name"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      Organization Name
                    </label>
                    <Input
                      ref={inputRef}
                      id="organization-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t("organization:create.namePlaceholder")}
                      className="h-12 text-lg font-medium"
                      required
                    />
                    {!name.trim() && (
                      <p className="mt-1 text-destructive-foreground text-sm">
                        {t("organization:create.required")}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="organization-description"
                      className="block text-sm font-medium text-foreground mb-2"
                    >
                      {t("organization:create.descriptionLabel")}
                    </label>
                    <Input
                      id="organization-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t(
                        "organization:create.descriptionPlaceholder",
                      )}
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    type="submit"
                    disabled={!name.trim() || isPending}
                    className="w-full h-12 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending
                      ? t("organization:create.creating")
                      : t("organization:create.submit")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
