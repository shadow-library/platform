import { type ReactElement, type ReactNode } from 'react';
import { ConfirmProvider, ThemeProvider, TooltipProvider } from '@shadow-library/ui';
import { themeCookieDomain } from '@shadow-library/web';

export function AppProvider({ children }: { children?: ReactNode }): ReactElement {
  return (
    <ThemeProvider cookieDomain={themeCookieDomain()} legacyStorageKey="theme">
      <TooltipProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
