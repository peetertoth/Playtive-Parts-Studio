import type { Metadata } from "next";
import { I18nProvider } from "@/i18n/provider";
import { getRequestLocale } from "@/i18n/server";
import { siteMessages } from "@/i18n/site-messages";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const messages = siteMessages[await getRequestLocale()];
  return { title: messages.inspectorTitle, description: messages.inspectorDescription };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale}>
      <body><I18nProvider initialLocale={locale}>{children}</I18nProvider></body>
    </html>
  );
}
