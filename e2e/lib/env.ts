/**
 * Importing npm packages
 */
import { existsSync } from 'node:fs';

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
 * Base URLs default to the local k3d dev ingress (`*.shadow-apps.test`, self-signed cert — see
 * `ignoreHTTPSErrors` in `playwright.config.ts`) so the suite runs out of the box against a normal local
 * deployment. Three states per var, not two:
 *  - unset                         → falls back to the `.test` default below.
 *  - set to an empty/blank string  → explicitly "not configured": the product is skipped, never falls
 *    back to the default. This is the only way to opt a product *out* now that a default exists.
 *  - set to anything else          → overrides the default outright (e.g. to point at a deployed environment).
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

/** The local k3d dev ingress default for each product — confirmed reachable via `kubectl get ingress -A`. */
const PRODUCT_DEFAULT_URLS: Record<ProductKey, string> = {
  identity: 'https://identity.shadow-apps.test',
  novelForge: 'https://novel-forge.shadow-apps.test',
  pulse: 'https://pulse.shadow-apps.test',
  webNovel: 'https://web-novel.shadow-apps.test',
};

/** Iteration order every spec loops in — stable so test titles/reports read the same across runs. */
export const PRODUCTS: readonly ProductKey[] = ['identity', 'novelForge', 'pulse', 'webNovel'];

/** Strips a trailing slash so callers can safely template `${url}/path` without a doubled slash. */
function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * The configured base URL for `product` — the env var's value if set to something non-blank, the local
 * `.test` default if the env var is unset, or `undefined` if the env var is explicitly set to blank
 * (opted out). See the semantics note above.
 */
export function getProductUrl(product: ProductKey): string | undefined {
  const raw = process.env[PRODUCT_ENV_VARS[product]];
  if (raw === undefined) return normalizeBaseUrl(PRODUCT_DEFAULT_URLS[product]);
  const trimmed = raw.trim();
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

/** Returns `product`'s base URL, skipping the current test cleanly when it's explicitly opted out (empty env var). */
export function requireProductUrl(product: ProductKey): string {
  const url = getProductUrl(product);
  skipUnless(url, `${PRODUCT_ENV_VARS[product]} is set to an empty value — skipping ${PRODUCT_LABELS[product]} (opted out)`);
  return url as string;
}

/** Path to a Playwright storage-state file (https://playwright.dev/docs/auth) for authenticated flows, or `undefined` when unset/blank. */
export function getStorageStatePath(): string | undefined {
  const trimmed = process.env.E2E_STORAGE_STATE?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Returns the configured storage-state path, skipping the current test cleanly when it isn't set or when
 * it's set but points at a file that doesn't exist — nothing in this workspace produces that file yet, so
 * a stale/placeholder path must skip rather than pass vacuously.
 */
export function requireStorageState(): string {
  const path = getStorageStatePath();
  skipUnless(path, 'E2E_STORAGE_STATE is not set — skipping authenticated flow (no storage state to authenticate with)');
  skipUnless(existsSync(path as string), `E2E_STORAGE_STATE is set to "${path}" but that file does not exist — skipping authenticated flow`);
  return path as string;
}
