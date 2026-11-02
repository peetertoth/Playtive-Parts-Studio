export const LOCALES = ["hu", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "hu";
export const LOCALE_COOKIE = "playtive-locale";
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;
export const INTL_LOCALES: Record<Locale, string> = { hu: "hu-HU", en: "en-GB" };

export function resolveLocale(value: unknown): Locale {
  return value === "en" || value === "hu" ? value : DEFAULT_LOCALE;
}

export function formatLocaleNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale], { maximumFractionDigits: 1, ...options }).format(value);
}

export function localeCookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${resolveLocale(locale)}; Path=/; Max-Age=${LOCALE_MAX_AGE}; SameSite=Lax`;
}
