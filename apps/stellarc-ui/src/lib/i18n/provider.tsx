import { type PropsWithChildren, useEffect, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { ensureLocale, getBrowserLocale, i18n, resolveLocale } from "./index";

export function AppI18nProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();

  const resolvedLocale = useMemo(
    () => resolveLocale(user?.locale, getBrowserLocale()),
    [user?.locale],
  );

  useEffect(() => {
    // ensureLocale fetches the bundle first when needed — only the fallback
    // language ships in the entry chunk. Until it resolves, i18next serves the
    // fallback rather than showing raw keys.
    void ensureLocale(resolvedLocale);
    document.documentElement.lang = resolvedLocale;
  }, [resolvedLocale]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
