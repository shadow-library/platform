import { getRouteApi } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

export interface PublicRuntimeConfig {
  /** Root domain every ecosystem app lives under (e.g. `shadow-apps.test`); set per environment. */
  rootDomain: string;
}

const rootRoute = getRouteApi('__root__');

export const getPublicRuntimeConfig = createServerFn({ method: 'GET' }).handler((): PublicRuntimeConfig => ({ rootDomain: process.env.PUBLIC_ROOT_DOMAIN ?? 'shadow-apps.com' }));

export function useRootDomain(): string {
  return rootRoute.useLoaderData().rootDomain;
}
