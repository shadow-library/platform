import { describe, expect, it } from 'bun:test';
import { ApiError } from '@shadow-library/web';

import { describeSendError } from '../src/features/send/send-error';

describe('describeSendError', () => {
  it("should explain that identity's and other authentication or security templates are never sent from the console", () => {
    const error = new ApiError(403, { code: 'NTF_005', type: 'CLIENT_ERROR', message: 'Identity, authentication and security templates cannot be sent from the console' });
    expect(describeSendError(error)).toMatch(/Templates identity sends .* one-time-code/);
  });

  it('should tell the admin how long to wait once the console send limit is reached', () => {
    const error = new ApiError(429, { code: 'NTF_006', type: 'CLIENT_ERROR', message: 'Too many console sends; try again later' }, 360);
    expect(describeSendError(error)).toBe("You've reached the console's send limit. Try again in 6 minutes.");
  });

  it('should round a sub-minute wait up to one minute', () => {
    const error = new ApiError(429, { code: 'NTF_006', type: 'CLIENT_ERROR', message: 'Too many console sends; try again later' }, 20);
    expect(describeSendError(error)).toBe("You've reached the console's send limit. Try again in 1 minute.");
  });

  it("should pass any other error's message through", () => {
    const error = new ApiError(400, { code: 'NTF_004', type: 'CLIENT_ERROR', message: 'Payload does not satisfy the template variable contract' });
    expect(describeSendError(error)).toBe('Payload does not satisfy the template variable contract');
  });
});
