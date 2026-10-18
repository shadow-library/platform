import { type ReactElement, type ReactNode } from 'react';
import { ConfirmProvider, ThemeProvider } from '@shadow-library/ui';
import { themeCookieDomain } from '@shadow-library/web';

export function AppProvider({ children }: { children?: ReactNode }): ReactElement {
  return (
    <ThemeProvider cookieDomain={themeCookieDomain()} legacyStorageKey="theme">
      <ConfirmProvider>{children}</ConfirmProvider>
    </ThemeProvider>
  );
}
