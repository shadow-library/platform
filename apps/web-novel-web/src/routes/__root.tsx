/// <reference types="vite/client" />
/**
 * Importing npm packages
 */
import { type QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { ClientOnly, themeInitScript } from '@shadow-library/ui';
import { NavProgress } from '@shadow-library/ui/router';
import { pwaHeadLinks, pwaHeadMeta } from '@shadow-library/web/pwa';

/**
 * Importing user defined packages
 */
import AppProvider from '@/components/AppProvider';
import { DefaultCatchBoundary } from '@/components/DefaultCatchBoundary';
import { NotFound } from '@/components/NotFound';
import '@/styles.css';

/**
 * Defining types
 */
interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Declaring the constants
 *
 * The document shell. PWA head tags come from the ecosystem helpers (`pwaHeadLinks`/`pwaHeadMeta`) and
 * `data-density="touch"` on <html> turns on finger-first control metrics app-wide — this is a reading PWA
 * first, a desktop site second.
 */
const PWA_HEAD = { manifestUrl: '/manifest.webmanifest', themeColor: '#4f46e5', appleTouchIcon: '/icons/icon.svg', appleTitle: 'Shadow Webnovel' };

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' },
      { title: 'Shadow Webnovel' },
      { name: 'description', content: 'Shadow Webnovel — a dedicated client for discovering and reading webnovels, online or offline.' },
      ...pwaHeadMeta(PWA_HEAD),
    ],
    links: [{ rel: 'icon', href: '/favicon.svg' }, ...pwaHeadLinks(PWA_HEAD)],
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
    // `themeInitScript` sets `data-theme`/`dark` on <html> before hydration; suppress the resulting
    // attribute mismatch so React doesn't regenerate the tree.
    <html lang="en" data-density="touch" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Applies the persisted theme before paint so there is no flash and no `data-theme` mismatch. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript({ legacyStorageKey: 'webnovel-theme' }) }} />
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
