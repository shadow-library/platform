/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { createCommitlintConfig } from '@lib/commitlint-config';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('commitlint-config', () => {
  describe('createCommitlintConfig', () => {
    it('should pass the resolved extends and rules through to a commitlint config', () => {
      expect(createCommitlintConfig({ extends: ['@commitlint/config-conventional'], rules: { 'header-max-length': [2, 'always', 120] } })).toStrictEqual({
        extends: ['@commitlint/config-conventional'],
        rules: { 'header-max-length': [2, 'always', 120] },
      });
    });

    it('should support extra extends and an empty rule set', () => {
      expect(createCommitlintConfig({ extends: ['@commitlint/config-conventional', 'my-shared-config'], rules: {} })).toStrictEqual({
        extends: ['@commitlint/config-conventional', 'my-shared-config'],
        rules: {},
      });
    });
  });
});
