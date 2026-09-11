import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { useUserPreferencesStore } from "@/store/user-preferences";

/**
 * #113: the menu toggle used to be a two-position light/dark switch, which made
 * the "system" theme the store and the preferences page both already support
 * unreachable from the profile menu. A three-way toggle group exposes Auto
 * without needing a second control.
 */
const THEMES = ["light", "dark", "system"] as const;

type ThemeOption = (typeof THEMES)[number];

function isThemeOption(value: unknown): value is ThemeOption {
  return THEMES.some((theme) => theme === value);
}

const THEME_ICONS: Record<ThemeOption, typeof SunIcon> = {
  dark: MoonIcon,
  light: SunIcon,
  system: MonitorIcon,
};

const THEME_LABEL_KEYS: Record<ThemeOption, string> = {
  dark: "navigation:userMenu.themeDark",
  light: "navigation:userMenu.themeLight",
  system: "navigation:userMenu.themeAuto",
};

/** Fallbacks so the control stays readable before translations land. */
const THEME_LABEL_FALLBACKS: Record<ThemeOption, string> = {
  dark: "Dark",
  light: "Light",
  system: "Auto",
};

export function ThemeToggleDropdown() {
  const { t } = useTranslation();
  const { theme, setTheme } = useUserPreferencesStore();

  const handleValueChange = (groupValue: string[]) => {
    const next = groupValue[0];

    // Base UI clears the group when the pressed item is toggled off. Keep the
    // current theme in that case: a theme picker has no "none" state.
    if (!isThemeOption(next)) {
      return;
    }

    setTheme(next);
  };

  return (
    <ToggleGroup
      aria-label={t("navigation:userMenu.theme")}
      className="gap-0.5"
      data-testid="user-menu-theme-options"
      onValueChange={handleValueChange}
      size="sm"
      value={[theme]}
    >
      {THEMES.map((option) => {
        const Icon = THEME_ICONS[option];
        const translated = t(THEME_LABEL_KEYS[option]);
        const label =
          translated === THEME_LABEL_KEYS[option]
            ? THEME_LABEL_FALLBACKS[option]
            : translated;

        return (
          <Toggle
            aria-label={label}
            className="size-6 rounded-md text-muted-foreground data-pressed:text-foreground [&_svg:not([class*='size-'])]:size-3.5"
            data-testid={`user-menu-theme-${option}`}
            key={option}
            size="sm"
            value={option}
          >
            <Icon aria-hidden="true" />
          </Toggle>
        );
      })}
    </ToggleGroup>
  );
}
