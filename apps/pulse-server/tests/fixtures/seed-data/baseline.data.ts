/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type Notification } from '@server/database';

/**
 * The overwritable production baseline (layouts, partials, the template catalogue and their fixture types) now lives in
 * `src/database/seed` so the deployed migrate step can ensure it — re-exported here unchanged so tests keep importing it
 * from the same place. Only the test-only fixtures below (demo messages) still live here.
 */
export * from '@server/database/seed';

/**
 * Defining types
 */

export interface MessageFixture {
  templateKey: string;
  channel: Notification.Channel;
  recipient: string;
  locale: string;
  renderedSubject: string | null;
  renderedBody: string;
  payload: Record<string, unknown>;
}

/**
 * Declaring the constants
 */

/** A small set of pre-rendered messages so the dev `GET /notifications/messages` view has data on a fresh install. */
export const DEMO_MESSAGES: MessageFixture[] = [
  {
    templateKey: 'sign-up',
    channel: 'EMAIL',
    recipient: 'alice@example.com',
    locale: 'en-US',
    renderedSubject: 'Welcome to Shadow',
    renderedBody: 'Hi Alice, welcome aboard!',
    payload: { name: 'Alice' },
  },
  {
    templateKey: 'sign-up',
    channel: 'SMS',
    recipient: '+15551230001',
    locale: 'en-US',
    renderedSubject: null,
    renderedBody: 'Welcome Alice, your account is ready.',
    payload: { name: 'Alice' },
  },
  {
    templateKey: 'password-reset',
    channel: 'EMAIL',
    recipient: 'bob@example.com',
    locale: 'en-US',
    renderedSubject: 'Reset your password',
    renderedBody: 'Reset link: https://shadow.app/reset',
    payload: { resetLink: 'https://shadow.app/reset' },
  },
];
