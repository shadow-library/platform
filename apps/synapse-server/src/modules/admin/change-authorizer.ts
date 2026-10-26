import { AuthGuardErrorCode } from '@shadow-library/auth/module';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { type CatalogSection, type ChangeAuthorizer } from '@modules/catalog';
import { SYNAPSE_PERMISSIONS } from '@modules/auth';

const logger = Logger.getLogger(APP_NAME, 'ChangeAuthorizer');

export const CHANGE_PERMISSIONS = [SYNAPSE_PERMISSIONS.catalogWrite] as const;

export const CHANGE_SENSITIVE_PERMISSIONS = [SYNAPSE_PERMISSIONS.providersWrite, SYNAPSE_PERMISSIONS.budgetsWrite] as const;

// The tools section names where a stored key is sent, as the providers section does.
const SECTION_PERMISSIONS: Partial<Record<CatalogSection, string>> = {
  providers: SYNAPSE_PERMISSIONS.providersWrite,
  budgets: SYNAPSE_PERMISSIONS.budgetsWrite,
  tools: SYNAPSE_PERMISSIONS.providersWrite,
};

export function changeAuthorizer(granted: ReadonlySet<string>): ChangeAuthorizer {
  return changed => {
    const required = [SYNAPSE_PERMISSIONS.catalogWrite, ...[...changed].flatMap(section => SECTION_PERMISSIONS[section] ?? [])];
    const missing = required.filter(permission => !granted.has(permission));
    if (missing.length === 0) return;
    logger.warn('Refused a catalog change to sections the caller may not write', { missing, changed: [...changed] });
    throw AuthGuardErrorCode.IAM_002.create({ missing });
  };
}
