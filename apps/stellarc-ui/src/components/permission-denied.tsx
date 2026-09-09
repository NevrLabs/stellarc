import { ShieldX } from "lucide-react";

type PermissionDeniedProps = {
  description?: string;
};

export default function PermissionDenied({
  description = "You do not have permission to access this section.",
}: PermissionDeniedProps) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-md border border-border px-6 py-10 text-center">
      <ShieldX className="size-7 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">Permission required</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
