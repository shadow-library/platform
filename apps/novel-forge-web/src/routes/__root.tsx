import { type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { type ReactNode } from 'react';
import { ClientOnly, themeInitScript } from '@shadow-library/ui';
import { NavProgress } from '@shadow-library/ui/router';

import { AppProviders } from '@/components/AppProvider';
import { AppShell } from '@/components/Layout';
import { DefaultCatchBoundary, RouteNotFound } from '@/components/nf';
import appCss from '@/styles.css?url';

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#000000' },
      { name: 'description', content: 'Novel Forge — authoring workspace for Shadow applications' },
      { title: 'Novel Forge' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  errorComponent: props => (
    <RootDocument>
      <DefaultCatchBoundary {...props} />
    </RootDocument>
  ),
  notFoundComponent: () => (
    <AppShell>
      <RouteNotFound />
    </AppShell>
  ),
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
 * runs before paint to avoid a theme flash; `<html suppressHydrationWarning>` tolerates the attributes it
 * sets. Devtools are dev-only and client-only so they never touch the server render.
 */
function RootDocument({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeInitScript({ legacyStorageKey: 'theme' }) }} />
      </head>
      <body>
        <AppProviders>
          <NavProgress />
          {children}
        </AppProviders>
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
