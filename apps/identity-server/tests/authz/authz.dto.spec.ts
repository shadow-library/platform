import { describe, expect, it } from 'bun:test';

import { ClassSchema } from '@shadow-library/class-schema';

import { CheckRequestBody } from '@server/modules/authz/authz.dto';

interface StringField {
  pattern?: string;
}

const organisationIdField = (ClassSchema.generate(CheckRequestBody).properties as Record<string, StringField>)['organisationId'];

const accepts = (value: string): boolean => organisationIdField?.pattern === undefined || new RegExp(organisationIdField.pattern).test(value);

describe('CheckRequestBody', () => {
  it('should refuse an organisation id that is not a numeric id, so the check answers 400 instead of failing on BigInt', () => {
    for (const value of ['not-an-org', '12a', '', '-1', '1.5', ' 7']) expect(accepts(value)).toBe(false);
  });

  it('should accept a numeric organisation id', () => {
    expect(accepts('42')).toBe(true);
  });
});
