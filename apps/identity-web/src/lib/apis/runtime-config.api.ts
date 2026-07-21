/**
 * Importing npm packages
 */
import { getRouteApi } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined modules
 */

/**
 * Defining types
 */
export interface PublicRuntimeConfig {
  /** Root domain every ecosystem app lives under (e.g. `shadow-apps.test`); set per environment. */
  rootDomain: string;
}

/**
 * Declaring the constants
 */
const rootRoute = getRouteApi('__root__');

/** Server-only: resolves deploy-time public config from the environment, defaulting to the production domain. */
export const getPublicRuntimeConfig = createServerFn({ method: 'GET' }).handler((): PublicRuntimeConfig => ({ rootDomain: process.env.PUBLIC_ROOT_DOMAIN ?? 'shadow-apps.com' }));

/** The ecosystem root domain, resolved once by the root-route loader and readable from any component. */
export function useRootDomain(): string {
  return rootRoute.useLoaderData().rootDomain;
}
