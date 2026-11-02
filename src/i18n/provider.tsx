"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { PartDefinition } from "@/domain/parts";
import { formatLocaleNumber, localeCookie, LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { localizePart as translatePart } from "./parts";
import { siteMessages } from "./site-messages";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  localizePart: (part: PartDefinition) => PartDefinition;
  preferenceSaved: boolean;
}
const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, updateLocale] = useState(initialLocale);
  const [preferenceSaved, setPreferenceSaved] = useState(true);
  const pathname = usePathname();
  const setLocale = useCallback((next: Locale) => {
    const supported = resolveLocale(next);
    updateLocale(supported);
    // No route reload or provider key: changing language preserves the live draft/history.
    try {
      document.cookie = localeCookie(supported);
      const saved = document.cookie.split(";").some((cookie) => cookie.trim() === `${LOCALE_COOKIE}=${supported}`);
      setPreferenceSaved(saved);
    } catch {
      setPreferenceSaved(false);
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = pathname === "/planner" ? siteMessages[locale].plannerTitle : siteMessages[locale].inspectorTitle;
    document.querySelector('meta[name="description"]')?.setAttribute("content",
      pathname === "/planner" ? siteMessages[locale].plannerDescription : siteMessages[locale].inspectorDescription);
  }, [locale, pathname]);
  const formatNumber = useCallback((value: number, options?: Intl.NumberFormatOptions) => formatLocaleNumber(value, locale, options), [locale]);
  const localizePart = useCallback((part: PartDefinition) => translatePart(part, locale), [locale]);
  const value = useMemo(() => ({ locale, setLocale, formatNumber, localizePart, preferenceSaved }),
    [locale, setLocale, formatNumber, localizePart, preferenceSaved]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider.");
  return value;
}
