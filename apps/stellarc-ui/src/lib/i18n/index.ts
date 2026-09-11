import {
  type AppLocale,
  defaultLocale,
  defaultResources,
  loadLocaleBundle,
  supportedLocales,
} from "@i18n/resources";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

function getLanguageCode(locale: string) {
  return locale.toLowerCase().split("-")[0];
}

export function resolveLocale(
  preferredLocale?: string | null,
  browserLocale?: string | null,
): AppLocale {
  const candidates = [preferredLocale, browserLocale].filter(
    (value): value is string => Boolean(value),
  );

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase();
    const exactMatch = supportedLocales.find(
      (locale) => locale.toLowerCase() === normalizedCandidate,
    );
    if (exactMatch) return exactMatch;

    const languageMatch = supportedLocales.find(
      (locale) => getLanguageCode(locale) === getLanguageCode(candidate),
    );
    if (languageMatch) return languageMatch;
  }

  return defaultLocale;
}

export function getBrowserLocale(): string | null {
  if (typeof navigator === "undefined") return null;
  return navigator.language || navigator.languages?.[0] || null;
}

const namespaces = Object.keys(defaultResources);

// Init synchronously with the fallback language only. Bundling all twelve
// locales up front put ~1 MB of JSON in the entry chunk for a user who reads
// one language; the rest are fetched on demand by ensureLocale below.
void i18n.use(initReactI18next).init({
  resources: { [defaultLocale]: defaultResources },
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  ns: namespaces,
  defaultNS: "common",
  interpolation: {
    escapeValue: false,
  },
});

const loaded = new Set<AppLocale>([defaultLocale]);

/**
 * Fetch a locale's bundle (if it isn't the default) and switch to it.
 *
 * Safe to call repeatedly — each locale is fetched at most once, and switching
 * to an already-loaded locale just changes the active language.
 */
export async function ensureLocale(locale: AppLocale) {
  if (!loaded.has(locale)) {
    const bundle = await loadLocaleBundle(locale);
    if (bundle) {
      for (const ns of namespaces) {
        const resources = (bundle as Record<string, unknown>)[ns];
        if (resources)
          i18n.addResourceBundle(locale, ns, resources, true, true);
      }
    }
    loaded.add(locale);
  }
  if (i18n.language !== locale) await i18n.changeLanguage(locale);
}

export { i18n };
