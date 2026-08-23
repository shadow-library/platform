/// <reference types="vite/client" />

import { type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { type ReactElement, type ReactNode } from 'react';
import { ClientOnly, themeInitScript } from '@shadow-library/ui';
import { NavProgress } from '@shadow-library/ui/router';
import { pwaHeadLinks, pwaHeadMeta } from '@shadow-library/web/pwa';

import AppProvider from '@/components/AppProvider';
import NotFound from '@/components/NotFound';
import { PwaLifecycle } from '@/components/PwaLifecycle';
import RouteError from '@/components/RouteError';
import '@/styles.css';

interface RouterContext {
  queryClient: QueryClient;
}

const PWA_HEAD = { manifestUrl: '/manifest.webmanifest', themeColor: '#4f46e5', appleTouchIcon: '/icons/icon.svg', appleTitle: 'Shadow Memoir' };

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' },
      { title: 'Shadow Memoir' },
      { name: 'description', content: 'Shadow Memoir — a private self-improvement RPG for your commitments, money, body and thoughts.' },
      // Every screen is behind authentication and there is nothing here to index.
      { name: 'robots', content: 'noindex, nofollow' },
      ...pwaHeadMeta(PWA_HEAD),
    ],
    links: [{ rel: 'icon', href: '/favicon.svg' }, ...pwaHeadLinks(PWA_HEAD)],
  }),
  /**
   * Fires only when root's own render path fails — the normal `component` never runs, so the document shell
   * has to be rebuilt here. A route-level throw is caught by the nearer `defaultErrorComponent` instead.
   */
  errorComponent: props => (
    <RootDocument>
      <RouteError {...props} />
    </RootDocument>
  ),
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});

function RootComponent(): ReactElement {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }): ReactElement {
  return (
    // `themeInitScript` sets `data-theme` on <html> before paint; suppress the resulting attribute mismatch
    // so React doesn't regenerate the tree. `data-density="touch"` makes every control finger-first — the
    // phone is the capture surface, and a desktop pointer loses nothing to a 44px target.
    <html lang="en" data-density="touch" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
      </head>
      <body>
        <NavProgress />
        <AppProvider>
          <PwaLifecycle />
          {children}
        </AppProvider>
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
