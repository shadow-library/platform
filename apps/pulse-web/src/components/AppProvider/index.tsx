import { type ReactElement } from 'react';
import { ThemeProvider } from '@shadow-library/ui';
import { themeCookieDomain } from '@shadow-library/web';

import { ConfirmProvider } from '@/features/shared/ConfirmProvider';

export interface AppProviderProps {
  children?: React.ReactNode;
}

/**
 * The QueryClientProvider is installed by `createAppRouter` (via the SSR-query integration's router
 * `Wrap`), so this provider owns only theming and the confirm dialog.
 */

export default function AppProvider(props: AppProviderProps): ReactElement {
  return (
    <ThemeProvider cookieDomain={themeCookieDomain()} legacyStorageKey="theme">
      <ConfirmProvider>{props.children}</ConfirmProvider>
    </ThemeProvider>
  );
}
