import { ThemeProvider, Toaster, TooltipProvider } from '@shadow-library/ui';
import { themeCookieDomain } from '@shadow-library/web';

import { SidebarRailProvider } from '@/components/Layout';
import { UpdateBar } from '@/components/UpdateBar';

export interface AppProvidersProps {
  children?: React.ReactNode;
}

/** The QueryClientProvider is absent on purpose: TanStack Start's router/query SSR integration (`src/router.tsx`) mounts a per-request one, which loader-hydrated data needs. */
export function AppProviders(props: AppProvidersProps): React.JSX.Element {
  return (
    <ThemeProvider cookieDomain={themeCookieDomain()} legacyStorageKey="theme">
      <TooltipProvider>
        <SidebarRailProvider>{props.children}</SidebarRailProvider>
      </TooltipProvider>
      <Toaster placement="top-end" />
      <UpdateBar />
    </ThemeProvider>
  );
}
