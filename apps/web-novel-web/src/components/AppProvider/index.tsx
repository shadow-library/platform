import { ThemeProvider, Toaster, TooltipProvider } from '@shadow-library/ui';
import { themeCookieDomain } from '@shadow-library/web';

import { PwaLifecycle } from '@/components/PwaLifecycle';

export interface AppProviderProps {
  children?: React.ReactNode;
}

/**
 * The QueryClient lives in the router context (`createAppRouter`), so this mounts only the design-system
 * providers plus the PWA lifecycle (service worker registration, update prompt, offline/reconnect banners,
 * query-cache persistence).
 */
export default function AppProvider(props: AppProviderProps): React.JSX.Element {
  return (
    <ThemeProvider cookieDomain={themeCookieDomain()} legacyStorageKey="webnovel-theme">
      <TooltipProvider>
        <PwaLifecycle />
        {props.children}
      </TooltipProvider>
      <Toaster placement="top-end" />
    </ThemeProvider>
  );
}
