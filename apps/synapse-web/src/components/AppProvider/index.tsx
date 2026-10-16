import { type ReactElement, type ReactNode } from 'react';
import { ThemeProvider } from '@shadow-library/ui';
import { themeCookieDomain } from '@shadow-library/web';

import { ConfirmProvider } from '@/features/shared';

export function AppProvider({ children }: { children?: ReactNode }): ReactElement {
  return (
    <ThemeProvider cookieDomain={themeCookieDomain()} legacyStorageKey="theme">
      <ConfirmProvider>{children}</ConfirmProvider>
    </ThemeProvider>
  );
}
