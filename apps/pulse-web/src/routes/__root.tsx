/**
 * Importing npm packages
 */
import { MantineProvider } from '@mantine/core';
import { shadowTheme } from '@shadow-library/ui';
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

function RootComponent() {
  return (
    <html lang='en'>
      <head>
        <HeadContent />
      </head>
      <body>
        <MantineProvider theme={shadowTheme}>
          <Outlet />
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { title: 'Shadow Pulse' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'description', content: 'Shadow Pulse - Notification service for Shadow applications' },
    ],
    links: [{ rel: 'icon', href: '/favicon.svg' }],
  }),
  component: RootComponent,
});
