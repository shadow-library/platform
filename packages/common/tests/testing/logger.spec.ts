/**
 * Importing npm packages
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import Transport from 'winston-transport';

/**
 * Importing user defined packages
 */
import { Logger } from '@shadow-library/common';
import { silenceLogger } from '@shadow-library/common/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('silenceLogger', () => {
  const messages: string[] = [];
  const capture = new Transport({ log: (info: { message: string }, next: () => void) => (messages.push(info.message), next()) });

  beforeEach(() => {
    messages.length = 0;
    Logger.addTransport(capture);
  });

  afterEach(() => void Logger['logger'].remove(capture));

  it('should mute a child logger created before silencing', () => {
    const logger = Logger.getLogger('testing', 'silence');
    const restore = silenceLogger();
    logger.error('muted');
    restore();
    logger.error('heard');

    expect(messages).toContain('heard');
    expect(messages).not.toContain('muted');
  });

  it('should resume logging once restored', () => {
    const restore = silenceLogger();
    restore();
    Logger.getLogger('testing', 'silence').error('heard');

    expect(messages).toContain('heard');
  });

  it('should keep an outer silence when an inner one is restored', () => {
    const restoreOuter = silenceLogger();
    const restoreInner = silenceLogger();
    restoreInner();
    const logger = Logger.getLogger('testing', 'silence');
    logger.error('still muted');
    restoreOuter();
    logger.error('heard');

    expect(messages).toContain('heard');
    expect(messages).not.toContain('still muted');
  });
});
