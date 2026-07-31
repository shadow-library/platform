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
      { rel: 'icon', href: '/favicon.svg' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
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
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeInitScript('theme') }} />
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
