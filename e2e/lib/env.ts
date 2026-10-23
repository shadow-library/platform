import { existsSync } from 'node:fs';

import { test } from '@playwright/test';

export type ProductKey = 'identity' | 'memoir' | 'novelForge' | 'pulse' | 'webNovel';

/**
 * Base URLs default to the local k3d dev ingress (`*.shadow-apps.test`). Per variable:
 *  - unset            -> the default below.
 *  - empty/blank      -> product explicitly opted out and skipped, never defaulted.
 *  - anything else    -> overrides the default (e.g. a deployed environment).
 */

const PRODUCT_LABELS: Record<ProductKey, string> = {
  identity: 'Identity',
  memoir: 'Memoir',
  novelForge: 'Novel Forge',
  pulse: 'Pulse',
  webNovel: 'Web Novel',
};

const PRODUCT_ENV_VARS: Record<ProductKey, string> = {
  identity: 'E2E_IDENTITY_URL',
  memoir: 'E2E_MEMOIR_URL',
  novelForge: 'E2E_NOVEL_FORGE_URL',
  pulse: 'E2E_PULSE_URL',
  webNovel: 'E2E_WEB_NOVEL_URL',
};

const PRODUCT_DEFAULT_URLS: Record<ProductKey, string> = {
  identity: 'https://identity.shadow-apps.test',
  memoir: 'https://memoir.shadow-apps.test',
  novelForge: 'https://novelforge.shadow-apps.test',
  pulse: 'https://pulse.shadow-apps.test',
  webNovel: 'https://webnovel.shadow-apps.test',
};

export const PRODUCTS: readonly ProductKey[] = ['identity', 'memoir', 'novelForge', 'pulse', 'webNovel'];

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

/** The configured base URL, or `undefined` when the env var is explicitly blank (opted out). */
export function getProductUrl(product: ProductKey): string | undefined {
  const raw = process.env[PRODUCT_ENV_VARS[product]];
  if (raw === undefined) return normalizeBaseUrl(PRODUCT_DEFAULT_URLS[product]);
  const trimmed = raw.trim();
  return trimmed ? normalizeBaseUrl(trimmed) : undefined;
}

export function getProductLabel(product: ProductKey): string {
  return PRODUCT_LABELS[product];
}

/** Skips the current test with `reason` unless `condition` is truthy; `test.skip` aborts the body, so nothing after it runs. */
function skipUnless(condition: unknown, reason: string): void {
  test.skip(!condition, reason);
}

export function requireProductUrl(product: ProductKey): string {
  const url = getProductUrl(product);
  skipUnless(url, `${PRODUCT_ENV_VARS[product]} is set to an empty value — skipping ${PRODUCT_LABELS[product]} (opted out)`);
  return url as string;
}

function getStorageStatePath(): string | undefined {
  const trimmed = process.env.E2E_STORAGE_STATE?.trim();
  return trimmed ? trimmed : undefined;
}

/** The `E2E_STORAGE_STATE` path, skipping when it is unset or missing so a stale or placeholder path cannot pass vacuously. */
export function requireStorageState(): string {
  const path = getStorageStatePath();
  skipUnless(path, 'E2E_STORAGE_STATE is not set — skipping authenticated flow (no storage state to authenticate with)');
  skipUnless(existsSync(path as string), `E2E_STORAGE_STATE is set to "${path}" but that file does not exist — skipping authenticated flow`);
  return path as string;
}
