// Server-side language helpers — read the `lang` cookie that the
// /set-language action sets when the user clicks the EN/LV toggle.

import type { Lang } from './i18n';

const COOKIE_NAME = 'lang';

export function getLangFromRequest(request: Request): Lang {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  const value = match?.[1];
  if (value === 'lv') return 'lv';
  return 'en';
}

export function setLangCookieHeader(lang: Lang): string {
  // Public preference cookie — not sensitive, persisted for one year.
  const oneYear = 60 * 60 * 24 * 365;
  return `${COOKIE_NAME}=${lang}; Path=/; Max-Age=${oneYear}; SameSite=Lax`;
}
