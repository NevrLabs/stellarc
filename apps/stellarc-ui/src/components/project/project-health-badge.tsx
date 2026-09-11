import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
export type ProjectHealth = "on-track" | "at-risk" | "off-track";
export default function ProjectHealthBadge({
  health,
}: {
  health: ProjectHealth;
}) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={
        health === "on-track"
          ? "default"
          : health === "at-risk"
            ? "secondary"
            : "destructive"
      }
    >
      {t(
        `projects:health.${health === "on-track" ? "onTrack" : health === "at-risk" ? "atRisk" : "offTrack"}`,
      )}
    </Badge>
  );
}
