/// <reference types="vite/client" />
import { type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { type ReactNode } from 'react';
import { ClientOnly, themeInitScript } from '@shadow-library/ui';
import { NavProgress } from '@shadow-library/ui/router';

import AppProvider from '@/components/AppProvider';
import NotFound from '@/components/NotFound';
import RouteError from '@/components/RouteError';
import appCss from '@/styles.css?url';

interface RouterContext {
  queryClient: QueryClient;
}

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
  // Fires only when root itself fails, so the normal component never ran and the document shell must be rebuilt here.
  errorComponent: props => (
    <RootDocument>
      <RouteError {...props} />
    </RootDocument>
  ),
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

// suppressHydrationWarning: themeInitScript sets data-theme/dark before paint, which intentionally differs from the server markup.
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
