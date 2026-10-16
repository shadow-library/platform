import { describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { AuthGuardErrorCode } from '@shadow-library/auth/module';

import { SYNAPSE_PERMISSIONS } from '@modules/auth';
import { type CatalogSection } from '@modules/catalog';
import { draftAuthorizer } from '@modules/admin/draft-authorizer';

const authorize = (granted: string[], changed: CatalogSection[]): unknown => {
  try {
    return draftAuthorizer(new Set(granted))(new Set(changed));
  } catch (error) {
    return error;
  }
};

const { catalogWrite, providersWrite, budgetsWrite } = SYNAPSE_PERMISSIONS;

describe('draftAuthorizer', () => {
  it('should allow changes to models, aliases and tasks with catalog write alone', () => {
    expect(authorize([catalogWrite], ['models', 'aliases', 'tasks'])).toBeUndefined();
  });

  it('should require catalog write even for a save that changes nothing', () => {
    expect(AppError.is(authorize([providersWrite, budgetsWrite], []), AuthGuardErrorCode.IAM_002)).toBe(true);
  });

  it('should require providers write when providers changed', () => {
    expect(AppError.is(authorize([catalogWrite], ['providers']), AuthGuardErrorCode.IAM_002)).toBe(true);
    expect(authorize([catalogWrite, providersWrite], ['providers'])).toBeUndefined();
  });

  it('should require budgets write when budgets changed', () => {
    expect(AppError.is(authorize([catalogWrite], ['budgets']), AuthGuardErrorCode.IAM_002)).toBe(true);
    expect(authorize([catalogWrite, budgetsWrite], ['budgets'])).toBeUndefined();
  });

  it('should require every permission a multi-section change needs', () => {
    expect(AppError.is(authorize([catalogWrite, providersWrite], ['providers', 'budgets']), AuthGuardErrorCode.IAM_002)).toBe(true);
  });
});
