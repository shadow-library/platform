/**
 * Importing npm packages
 */
import { test } from '@playwright/test';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/** One of the four platform products the e2e suite targets. */
export type ProductKey = 'identity' | 'novelForge' | 'pulse' | 'webNovel';

export interface ConfiguredProduct {
  readonly product: ProductKey;
  readonly label: string;
  readonly url: string;
}

/**
 * Declaring the constants
 *
 * Base URLs arrive via env vars because the suite targets already-deployed services — there is no local
 * compose deployment to derive them from (see `AGENTS.md`). A var left unset means "this product isn't
 * configured for this run"; every spec self-skips rather than failing on a missing URL.
 */

/** Human-readable name for test titles and skip reasons. */
const PRODUCT_LABELS: Record<ProductKey, string> = {
  identity: 'Identity',
  novelForge: 'Novel Forge',
  pulse: 'Pulse',
  webNovel: 'Web Novel',
};

/** The env var each product's base URL is read from. */
const PRODUCT_ENV_VARS: Record<ProductKey, string> = {
  identity: 'E2E_IDENTITY_URL',
  novelForge: 'E2E_NOVEL_FORGE_URL',
  pulse: 'E2E_PULSE_URL',
  webNovel: 'E2E_WEB_NOVEL_URL',
};

/** Iteration order every spec loops in — stable so test titles/reports read the same across runs. */
export const PRODUCTS: readonly ProductKey[] = ['identity', 'novelForge', 'pulse', 'webNovel'];

/** Strips a trailing slash so callers can safely template `${url}/path` without a doubled slash. */
function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

/** The configured base URL for `product`, or `undefined` when its env var is unset or blank. */
export function getProductUrl(product: ProductKey): string | undefined {
  const trimmed = process.env[PRODUCT_ENV_VARS[product]]?.trim();
  return trimmed ? normalizeBaseUrl(trimmed) : undefined;
}

/** Display name for `product`, used in test titles and skip reasons. */
export function getProductLabel(product: ProductKey): string {
  return PRODUCT_LABELS[product];
}

/** Every product whose base URL is currently configured, in `PRODUCTS` order. */
export function getConfiguredProducts(): ConfiguredProduct[] {
  return PRODUCTS.flatMap(product => {
    const url = getProductUrl(product);
    return url ? [{ product, label: PRODUCT_LABELS[product], url }] : [];
  });
}

/**
 * Skips the current test with `reason` unless `condition` is truthy — the shared self-skip pattern behind
 * every other helper here. Safe to call before or after fixtures are used; `test.skip` aborts the test
 * body immediately when `condition` is falsy, so nothing after it runs.
 */
export function skipUnless(condition: unknown, reason: string): void {
  test.skip(!condition, reason);
}

/** Returns `product`'s base URL, skipping the current test cleanly when it isn't configured. */
export function requireProductUrl(product: ProductKey): string {
  const url = getProductUrl(product);
  skipUnless(url, `${PRODUCT_ENV_VARS[product]} is not set — skipping ${PRODUCT_LABELS[product]} (no deployed URL configured)`);
  return url as string;
}

/** Path to a Playwright storage-state file (https://playwright.dev/docs/auth) for authenticated flows, or `undefined` when unset. */
export function getStorageStatePath(): string | undefined {
  const trimmed = process.env.E2E_STORAGE_STATE?.trim();
  return trimmed ? trimmed : undefined;
}

/** Returns the configured storage-state path, skipping the current test cleanly when it isn't set. */
export function requireStorageState(): string {
  const path = getStorageStatePath();
  skipUnless(path, 'E2E_STORAGE_STATE is not set — skipping authenticated flow (no storage state to authenticate with)');
  return path as string;
}

/** Whether the opt-in `/health/live` + `/health/ready` checks (`api-health.spec.ts`) should run. */
export function isApiHealthEnabled(): boolean {
  return process.env.E2E_API_HEALTH === '1';
}
