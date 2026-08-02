/// <reference types="vite/client" />
/**
 * Importing npm packages
 */
import { type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { type ReactNode } from 'react';
import { ClientOnly, themeInitScript } from '@shadow-library/ui';
import { NavProgress } from '@shadow-library/ui/router';

/**
 *  Importing user defined modules
 */
import AppProvider from '@/components/AppProvider';
import NotFound from '@/components/NotFound';
import RouteError from '@/components/RouteError';
import appCss from '@/styles.css?url';

/**
 * Declaring types
 */

interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Declaring constants
 */

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { name: 'theme-color', content: '#000000' },
      { title: 'Shadow Pulse' },
      { name: 'description', content: 'Shadow Pulse - Notification service for Shadow applications' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  /**
   * Fires only when ROOT's own render path fails (its own loader, or something above every route's own
   * boundary) — the normal `component` below never runs, so the document shell has to be rebuilt here by
   * hand. A route-level throw is caught by the nearer `defaultErrorComponent` (`router.tsx`) instead,
   * which mounts inside the shell this component already built and needs no such wrap.
   */
  errorComponent: props => (
    <RootDocument>
      <RouteError {...props} />
    </RootDocument>
  ),
  /** Root always matches, so `component` still runs for a genuinely unmatched path — no shell rewrap needed. */
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});

function RootComponent(): React.JSX.Element {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

/**
 * The full HTML document TanStack Start renders on the server and hydrates on the client. `themeInitScript`
 * runs before paint to avoid a theme flash; `<html suppressHydrationWarning>` tolerates the `data-theme`/
 * `dark` attributes it sets, which intentionally differ from the server markup.
 */
function RootDocument({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeInitScript({ legacyStorageKey: 'theme' }) }} />
      </head>
      <body>
        <NavProgress />
        <AppProvider>{children}</AppProvider>
        {import.meta.env.DEV && (
          <ClientOnly>
            <TanStackRouterDevtools position="bottom-right" />
            <ReactQueryDevtools buttonPosition="bottom-left" />
          </ClientOnly>
        )}
        <Scripts />
      </body>
    </html>
  );
}
