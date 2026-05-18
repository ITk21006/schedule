import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
import type { LinksFunction } from "react-router";
import { getLangFromRequest } from "~/lib/i18n.server";
import type { Lang } from "~/lib/i18n";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: "/styles.css" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  return { lang: getLangFromRequest(request) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  // Pull lang out of root loader so the <html lang="…"> tag matches.
  const data = useRouteLoaderData('root') as { lang?: Lang } | undefined;
  const lang = data?.lang || 'en';
  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
