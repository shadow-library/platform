import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { AppError } from '@shadow-library/common';

import { announceSecretOnce, resolveBootstrapAdminPassword } from '@server/modules/bootstrap';

describe('bootstrap secrets', () => {
  describe('resolveBootstrapAdminPassword', () => {
    it('should pass an operator-configured password through unchanged, in production or not', () => {
      const generate = mock(() => 'should-not-be-called');
      expect(resolveBootstrapAdminPassword('Op3rator!Set', true, generate)).toEqual({ password: 'Op3rator!Set', generated: false });
      expect(resolveBootstrapAdminPassword('Op3rator!Set', false, generate)).toEqual({ password: 'Op3rator!Set', generated: false });
      expect(generate).not.toHaveBeenCalled();
    });

    it('should fail fast instead of generating a password in a production deployment', () => {
      const generate = mock(() => 'should-not-be-called');
      expect(() => resolveBootstrapAdminPassword('', true, generate)).toThrow(AppError);
      expect(generate).not.toHaveBeenCalled();
    });

    it('should generate and flag a password outside a production deployment', () => {
      const generate = mock(() => 'Generat3d!Pass');
      expect(resolveBootstrapAdminPassword('', false, generate)).toEqual({ password: 'Generat3d!Pass', generated: true });
      expect(generate).toHaveBeenCalledTimes(1);
    });
  });

  describe('announceSecretOnce', () => {
    const writeSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);

    afterEach(() => writeSpy.mockClear());

    it('should never write a secret anywhere in a production deployment', () => {
      announceSecretOnce('heading', 'top-s3cret-value', true);
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it('should disclose the secret via stdout, not the logger, outside a production deployment', () => {
      announceSecretOnce('heading', 'top-s3cret-value', false);
      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(writeSpy.mock.calls[0]?.[0]).toContain('top-s3cret-value');
    });
  });
});
