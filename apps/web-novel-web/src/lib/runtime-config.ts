import { getRouteApi } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

/**
 * Read from the server's environment at request time rather than baked in by Vite: one image is promoted
 * through every environment, so a build-time value would point them all at the same deployment.
 */
export interface PublicRuntimeConfig {
  /** Novel Forge's origin for the "write a novel" links (`NOVEL_FORGE_URL`); null hides them rather than guessing a host. */
  novelForgeUrl: string | null;
}

const rootRoute = getRouteApi('__root__');

export function resolveNovelForgeUrl(value: string | undefined): string | null {
  if (!value) return null;
  const url = URL.canParse(value) ? new URL(value) : null;
  if (url?.protocol !== 'https:' && url?.protocol !== 'http:') return null;
  return url.href.replace(/\/+$/, '');
}

export const getPublicRuntimeConfig = createServerFn({ method: 'GET' }).handler((): PublicRuntimeConfig => ({ novelForgeUrl: resolveNovelForgeUrl(process.env.NOVEL_FORGE_URL) }));

export function useNovelForgeUrl(): string | null {
  return rootRoute.useLoaderData().novelForgeUrl;
}
