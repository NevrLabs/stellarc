import { useTranslation } from "react-i18next";

export function KaneoBranding() {
  const { t } = useTranslation();

  return (
    <a
      href="https://kaneo.app"
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-foreground transition-colors"
    >
      {t("publicBoard:branding.poweredBy")}{" "}
      <span className="font-medium">{t("common:appName")}</span>
    </a>
  );
}
