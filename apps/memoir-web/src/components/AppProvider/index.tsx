import { type ReactElement, type ReactNode } from 'react';
import { BannerOutlet, ThemeProvider, Toaster, TooltipProvider } from '@shadow-library/ui';
import { themeCookieDomain } from '@shadow-library/web';

export interface AppProviderProps {
  children?: ReactNode;
}

/**
 * The QueryClientProvider is installed by `createAppRouter`, so this owns theming and the imperative
 * surfaces every screen writes to. Theme is platform-wide — it lives in a cookie shared with the other
 * Shadow apps, so a switch here changes them too.
 */
export default function AppProvider({ children }: AppProviderProps): ReactElement {
  return (
    <ThemeProvider cookieDomain={themeCookieDomain()}>
      <TooltipProvider>
        <BannerOutlet />
        {children}
      </TooltipProvider>
      <Toaster />
    </ThemeProvider>
  );
}
