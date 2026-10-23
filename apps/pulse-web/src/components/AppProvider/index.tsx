import { type ReactElement } from 'react';
import { ConfirmProvider, ThemeProvider } from '@shadow-library/ui';
import { themeCookieDomain } from '@shadow-library/web';

export interface AppProviderProps {
  children?: React.ReactNode;
}

// QueryClientProvider is installed by createAppRouter, not here.
export default function AppProvider(props: AppProviderProps): ReactElement {
  return (
    <ThemeProvider cookieDomain={themeCookieDomain()} legacyStorageKey="theme">
      <ConfirmProvider>{props.children}</ConfirmProvider>
    </ThemeProvider>
  );
}
