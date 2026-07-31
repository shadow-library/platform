/**
 * Importing npm packages
 */
import { ThemeProvider, Toaster, TooltipProvider } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { PwaLifecycle } from '@/components/PwaLifecycle';

/**
 * Defining types
 */
export interface AppProviderProps {
  children?: React.ReactNode;
}

/**
 * Declaring the constants
 *
 * The QueryClient lives in the router context (`createAppRouter`), so this mounts only the design-system
 * providers plus the PWA lifecycle (service worker registration, update prompt, offline/reconnect banners,
 * query-cache persistence).
 */
export default function AppProvider(props: AppProviderProps): React.JSX.Element {
  return (
    <ThemeProvider storageKey="webnovel-theme">
      <TooltipProvider>
        <PwaLifecycle />
        {props.children}
      </TooltipProvider>
      <Toaster placement="top-end" />
    </ThemeProvider>
  );
}
