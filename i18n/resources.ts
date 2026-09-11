import enUS from "./en-US.json";

export const supportedLocales = [
  "de-DE",
  "el-GR",
  "en-US",
  "es-ES",
  "fr-FR",
  "hi-IN",
  "id-ID",
  "it-IT",
  "ko-KR",
  "mk-MK",
  "nl-NL",
  "pt-BR",
  "ru-RU",
  "tr-TR",
  "uk-UA",
  "vi-VN",
  "zh-CN",
] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = "en-US";

/**
 * English is bundled eagerly because it is the fallback language — i18next needs
 * it synchronously to render anything, including while another locale loads.
 */
export const defaultResources = enUS;

/**
 * Non-default locales are partial: they omit keys that haven't been translated
 * yet, so they aren't assignable to `typeof enUS`. i18next falls back to the
 * default locale per-key, so a loose shape is the accurate type here.
 */
export type LocaleBundle = Record<string, unknown>;

/**
 * Every other locale is a dynamic import, so a visitor downloads one language
 * instead of twelve.
 *
 * These used to be static imports collected into a `resources` object,
 * which put all ~1 MB of locale JSON in the entry chunk.
 */
const localeLoaders: Partial<
  Record<AppLocale, () => Promise<{ default: unknown }>>
> = {
  "de-DE": () => import("./de-DE.json"),
  "el-GR": () => import("./el-GR.json"),
  "es-ES": () => import("./es-ES.json"),
  "fr-FR": () => import("./fr-FR.json"),
  "hi-IN": () => import("./hi-IN.json"),
  "id-ID": () => import("./id-ID.json"),
  "it-IT": () => import("./it-IT.json"),
  "ko-KR": () => import("./ko-KR.json"),
  "mk-MK": () => import("./mk-MK.json"),
  "nl-NL": () => import("./nl-NL.json"),
  "pt-BR": () => import("./pt-BR.json"),
  "ru-RU": () => import("./ru-RU.json"),
  "tr-TR": () => import("./tr-TR.json"),
  "uk-UA": () => import("./uk-UA.json"),
  "vi-VN": () => import("./vi-VN.json"),
  "zh-CN": () => import("./zh-CN.json"),
};

/** Resolves to the locale's bundle, or null for the eagerly-bundled default. */
export async function loadLocaleBundle(
  locale: AppLocale,
): Promise<LocaleBundle | null> {
  if (locale === defaultLocale) return null;
  const load = localeLoaders[locale];
  if (!load) return null;
  const mod = await load();
  return mod.default as LocaleBundle;
}
