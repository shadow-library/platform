import { ThemeProvider, Toaster, TooltipProvider } from '@shadow-library/ui';
import { themeCookieDomain } from '@shadow-library/web';

export interface AppProviderProps {
  children?: React.ReactNode;
}

/**
 * The QueryClient lives in the router context and its provider is installed by
 * the TanStack Start ↔ Query SSR integration, so this only mounts the design-system providers around the
 * document body. `Toaster` self-gates hydration (its `useHydrated` guard renders null on the server and the
 * first client render, then mounts the portal once React is live), so it needs no `ClientOnly` boundary.
 */
export default function AppProvider(props: AppProviderProps): React.JSX.Element {
  return (
    <ThemeProvider cookieDomain={themeCookieDomain()} legacyStorageKey="shadow-identity-theme">
      <TooltipProvider>{props.children}</TooltipProvider>
      <Toaster placement="top-end" />
    </ThemeProvider>
  );
}
