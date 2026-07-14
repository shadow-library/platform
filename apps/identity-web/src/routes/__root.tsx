/// <reference types="vite/client" />
/**
 * Importing npm packages
 */
import { ClientOnly, themeInitScript } from '@shadow-library/ui';
import { NavProgress } from '@shadow-library/ui/router';
import { type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

/**
 *  Importing user defined modules
 */
import AppProvider from '@/components/AppProvider';
import { DefaultCatchBoundary } from '@/components/DefaultCatchBoundary';
import { NotFound } from '@/components/NotFound';

import '@/styles.css';

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
      { name: 'theme-color', content: '#4f46e5' },
      { title: 'Shadow Identity' },
      { name: 'description', content: 'Shadow Identity — accounts, authentication, and access for the Shadow Apps ecosystem' },
    ],
    links: [{ rel: 'icon', href: '/favicon.svg' }],
  }),
  errorComponent: props => (
    <RootDocument>
      <DefaultCatchBoundary {...props} />
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

function RootDocument({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    // `themeInitScript` sets `data-theme`/`dark` on <html> before hydration, so the root element's
    // attributes intentionally differ from the server markup — suppress the warning here (only for this
    // element's own attributes) so React doesn't treat it as a mismatch and regenerate the whole tree.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Applies the persisted theme before paint so there is no flash and no `data-theme` hydration mismatch. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript('shadow-identity-theme') }} />
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
