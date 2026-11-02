import { cache } from "react";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale } from "./config";

/** The first visit is always Hungarian; only an explicit choice changes it. */
export const getRequestLocale = cache(async () => resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value));
