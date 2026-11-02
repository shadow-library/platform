import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach } from 'vitest';

const setupUser = userEvent.setup;
// user-event's default `delay: 0` parks every keystroke and pointer step on a timer turn; RTL's asyncWrapper already yields one after each call.
Object.assign(userEvent, { setup: (options?: Parameters<typeof setupUser>[0]) => setupUser({ delay: null, ...options }) });

afterEach(() => cleanup());
