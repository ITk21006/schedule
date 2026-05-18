import { redirect, type ActionFunctionArgs } from 'react-router';
import { setLangCookieHeader } from '~/lib/i18n.server';
import type { Lang } from '~/lib/i18n';

// POST /set-language — sets the `lang` cookie and redirects back to the
// referrer (the page the user clicked the toggle on). Used by the LanguageToggle
// component in the header of every page.
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const langValue = formData.get('lang');
  const lang: Lang = langValue === 'lv' ? 'lv' : 'en';

  const referer = request.headers.get('Referer');
  const url = referer ? new URL(referer).pathname + new URL(referer).search : '/';

  return redirect(url, {
    headers: {
      'Set-Cookie': setLangCookieHeader(lang),
    },
  });
}

// Hitting GET /set-language directly just bounces home.
export function loader() {
  return redirect('/');
}
