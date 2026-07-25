/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

declare module '@shadow-library/common' {
  export interface ConfigRecords {
    /** App configs */
    'app.stage': 'dev' | 'staging' | 'prod';
  }
}

/**
 * Configs
 *
 * The whole auth surface (`auth.issuer`, `auth.app-id`, the client credential, the session cookie
 * knobs) is declared and loaded by `@shadow-library/auth/module`; pulse restates nothing about it
 * here. The SDK derives its audience, redirect URIs and granted scopes from identity at boot.
 */
Config.load('app.stage', { defaultValue: 'dev', allowedValues: ['dev', 'staging', 'prod'], isProdRequired: true });
