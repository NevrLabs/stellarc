import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getApiUrl } from "@/fetchers/get-api-url";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { toast } from "@/lib/toast";

type AiSettings = {
  enabled: boolean;
  configured: boolean;
  providerBaseUrl: string | null;
  providerModel: string | null;
  providerApiKeySet: boolean;
};

export function AiSettings() {
  const { data: organization } = useActiveOrganization();
  const { canManageOrganization } = useOrganizationPermission();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState(false);
  const readOnly = !canManageOrganization();

  useEffect(() => {
    if (!organization?.id) return;
    const load = async () => {
      const response = await fetch(
        getApiUrl(`/ai/organization/${organization.id}/settings`),
        { credentials: "include" },
      );
      if (!response.ok) return;
      const data: AiSettings = await response.json();
      setSettings(data);
      setBaseUrl(data.providerBaseUrl ?? "");
      setModel(data.providerModel ?? "");
    };
    void load();
  }, [organization?.id]);

  const patch = async (body: Record<string, unknown>, success: string) => {
    if (!organization?.id) return;
    setPending(true);
    try {
      const response = await fetch(
        getApiUrl(`/ai/organization/${organization.id}/settings`),
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.message ?? "Could not update AI settings");
      setSettings(payload);
      setBaseUrl(payload.providerBaseUrl ?? "");
      setModel(payload.providerModel ?? "");
      setApiKey("");
      toast.success(success);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update AI settings",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-background">
        <div className="flex items-start justify-between gap-6 px-4 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 text-muted-foreground">
              <Sparkles aria-hidden="true" className="size-4" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="font-medium">AI chat</h2>
                <span className="rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning">
                  Alpha
                </span>
              </div>
              <p className="max-w-xl text-sm text-muted-foreground">
                Shows the assistant bubble to members of this organization.
                {settings && !settings.configured
                  ? " Configure a provider below before enabling."
                  : ""}
              </p>
            </div>
          </div>
          <Switch
            aria-label="Enable AI chat"
            checked={Boolean(settings?.enabled)}
            data-testid="ai-chat-toggle"
            disabled={readOnly || pending || !settings}
            onCheckedChange={(checked) =>
              patch(
                { enabled: checked },
                checked ? "AI chat enabled" : "AI chat disabled",
              )
            }
          />
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-background p-4">
        <div className="space-y-1">
          <h2 className="font-medium">Provider</h2>
          <p className="text-sm text-muted-foreground">
            OpenAI-compatible endpoint. Leave blank to use this instance's
            configured provider. The key is encrypted and never shown again.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm" htmlFor="ai-provider-base-url">
            <span className="text-muted-foreground">Base URL</span>
            <Input
              aria-label="AI provider base URL"
              id="ai-provider-base-url"
              disabled={readOnly || pending}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
            />
          </label>
          <label className="space-y-1 text-sm" htmlFor="ai-provider-model">
            <span className="text-muted-foreground">Model</span>
            <Input
              aria-label="AI provider model"
              id="ai-provider-model"
              disabled={readOnly || pending}
              onChange={(event) => setModel(event.target.value)}
              placeholder="gpt-4o-mini"
              value={model}
            />
          </label>
        </div>
        <label
          className="block space-y-1 text-sm"
          htmlFor="ai-provider-api-key"
        >
          <span className="text-muted-foreground">
            API key{" "}
            {settings?.providerApiKeySet ? (
              <span data-testid="ai-key-state">(a key is stored)</span>
            ) : (
              <span data-testid="ai-key-state">(no key stored)</span>
            )}
          </span>
          <Input
            aria-label="AI provider API key"
            id="ai-provider-api-key"
            autoComplete="off"
            disabled={readOnly || pending}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={settings?.providerApiKeySet ? "••••••••" : "sk-…"}
            type="password"
            value={apiKey}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={readOnly || pending}
            onClick={() =>
              patch(
                {
                  providerBaseUrl: baseUrl,
                  providerModel: model,
                  ...(apiKey.trim() ? { providerApiKey: apiKey } : {}),
                },
                "Provider updated",
              )
            }
            size="sm"
          >
            Save provider
          </Button>
          {settings?.providerApiKeySet && (
            <Button
              disabled={readOnly || pending}
              onClick={() =>
                patch(
                  {
                    providerBaseUrl: null,
                    providerModel: null,
                    providerApiKey: null,
                  },
                  "Provider cleared",
                )
              }
              size="sm"
              variant="outline"
            >
              Clear provider
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
