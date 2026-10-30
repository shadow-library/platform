import { describe, expect, it } from 'bun:test';

import { ClassSchema, type JSONSchema, type SchemaClass } from '@shadow-library/class-schema';

import { AccountResponseDto, OnboardingDto } from '@modules/account/account.dto';
import { CURRENCY_CODES } from '@server/classes';

interface GeneratedSchema extends JSONSchema {
  properties: Record<string, JSONSchema>;
  definitions?: Record<string, JSONSchema>;
}

function fieldEnum(dto: SchemaClass, field: string): unknown {
  const schema = ClassSchema.generate(dto) as GeneratedSchema;
  const property = schema.properties[field];
  const target = property?.type === 'array' ? (property.items as JSONSchema) : property;
  return target?.$ref ? schema.definitions?.[target.$ref]?.enum : target?.enum;
}

describe('currency DTO fields', () => {
  it('should offer INR and AED among the supported currencies', () => {
    expect(CURRENCY_CODES).toContain('INR');
    expect(CURRENCY_CODES).toContain('AED');
  });

  it('should restrict the onboarding home currency to the supported codes', () => {
    expect(fieldEnum(OnboardingDto, 'defaultCurrency')).toEqual([...CURRENCY_CODES]);
  });

  it('should restrict every onboarding enabled currency to the supported codes', () => {
    expect(fieldEnum(OnboardingDto, 'enabledCurrencies')).toEqual([...CURRENCY_CODES]);
  });

  it('should describe the account response currencies with the same enum', () => {
    expect(fieldEnum(AccountResponseDto, 'defaultCurrency')).toEqual([...CURRENCY_CODES]);
    expect(fieldEnum(AccountResponseDto, 'enabledCurrencies')).toEqual([...CURRENCY_CODES]);
  });
});
