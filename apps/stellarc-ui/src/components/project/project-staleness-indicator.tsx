import { useTranslation } from "react-i18next";
import { PROJECT_UPDATE_STALE_AFTER_MS } from "@/lib/project-update-staleness";
export default function ProjectStalenessIndicator({
  updatedAt,
}: {
  updatedAt?: string | null;
}) {
  const { t } = useTranslation();
  if (!updatedAt) return <span>{t("projects:labels.noUpdate")}</span>;
  const stale =
    Date.now() - new Date(updatedAt).getTime() > PROJECT_UPDATE_STALE_AFTER_MS;
  return (
    <span>
      {stale
        ? t("projects:updates.stale", {
            relative: new Date(updatedAt).toLocaleDateString(),
          })
        : t("projects:updates.fresh", {
            relative: new Date(updatedAt).toLocaleDateString(),
          })}
    </span>
  );
}
