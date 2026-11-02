"use client";

import { LOCALES } from "./config";
import { useI18n } from "./provider";
import { siteMessages } from "./site-messages";

export function LanguageSwitcher() {
  const { locale, setLocale, preferenceSaved } = useI18n();
  return <div className="language-control">
    <div className="language-switcher" role="group" aria-label={siteMessages[locale].language}>
      {LOCALES.map((language) => <button key={language} type="button" lang={language}
        aria-label={language === "hu" ? "Magyar" : "English"} aria-pressed={locale === language}
        onClick={() => setLocale(language)}>{language.toUpperCase()}</button>)}
    </div>
    {!preferenceSaved && <span role="status" className="language-save-notice">{siteMessages[locale].languageUnavailable}</span>}
  </div>;
}
