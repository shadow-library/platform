/**
 * Importing npm packages
 */
import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface PlaywrightConfigOptions {
  /** `use.baseURL`. Apps disagree on `localhost` vs `127.0.0.1` — kept a required, explicit choice rather than a default. */
  baseURL: string;
  /** Extra `use` overrides layered after `baseURL`/`trace` — e.g. novel-forge-web's conditional `storageState`. */
  use?: PlaywrightTestConfig['use'];
  /**
   * The TanStack Start `webServer` entry, or `null` to omit it entirely (novel-forge-web's `PW_NO_WEBSERVER=1`
   * escape hatch for specs that self-host their own app + mock API). `command`/`url`/`timeout` stay per-app:
   * identity-web reuses a live `bun dev`; the others build once and start the SSR server on a fixed port,
   * sometimes probing a separate health port (pulse-web) instead of the app port.
   */
  webServer?: PlaywrightTestConfig['webServer'] | null;
}

/**
 * Declaring the constants
 */

/**
 * The shared Playwright shell every `ssr`-type web app's e2e suite used to duplicate: `testDir`, CI-aware
 * parallelism/retries/workers, the `html` reporter, and the single `chromium` project. `baseURL`/`use`/
 * `webServer` stay per-app — see each app's own `playwright.config.ts` for why they differ.
 */
export function createPlaywrightConfig(options: PlaywrightConfigOptions): PlaywrightTestConfig {
  const { baseURL, use, webServer } = options;
  const isCI = !!process.env.CI;

  return defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    workers: isCI ? 1 : undefined,
    reporter: 'html',
    use: { baseURL, trace: 'on-first-retry', ...use },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    ...(webServer === null ? {} : { webServer: webServer ?? undefined }),
  });
}
