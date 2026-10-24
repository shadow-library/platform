import { AuthGuardErrorCode } from '@shadow-library/auth/module';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { type CatalogSection, type DraftAuthorizer } from '@modules/catalog';
import { SYNAPSE_PERMISSIONS } from '@modules/auth';

const logger = Logger.getLogger(APP_NAME, 'DraftAuthorizer');

export const DRAFT_PERMISSIONS = [SYNAPSE_PERMISSIONS.catalogWrite] as const;

export const DRAFT_SENSITIVE_PERMISSIONS = [SYNAPSE_PERMISSIONS.providersWrite, SYNAPSE_PERMISSIONS.budgetsWrite] as const;

const SECTION_PERMISSIONS: Partial<Record<CatalogSection, string>> = {
  providers: SYNAPSE_PERMISSIONS.providersWrite,
  budgets: SYNAPSE_PERMISSIONS.budgetsWrite,
};

export function draftAuthorizer(granted: ReadonlySet<string>): DraftAuthorizer {
  return changed => {
    const required = [SYNAPSE_PERMISSIONS.catalogWrite, ...[...changed].flatMap(section => SECTION_PERMISSIONS[section] ?? [])];
    const missing = required.filter(permission => !granted.has(permission));
    if (missing.length === 0) return;
    logger.warn('Refused a catalog draft change to sections the caller may not write', { missing, changed: [...changed] });
    throw AuthGuardErrorCode.IAM_002.create({ missing });
  };
}
