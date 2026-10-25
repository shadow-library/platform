import { type DraftNotice } from '@/features/shared';
import { type CatalogIssueResponse, type ValidateDraftResponse } from '@/lib';

export type ValidationOutcome = { kind: 'absent'; notice: DraftNotice } | { kind: 'checked'; issues: CatalogIssueResponse[]; notice: DraftNotice };

export function validationOutcomeOf(result: ValidateDraftResponse | null): ValidationOutcome {
  if (!result) return { kind: 'absent', notice: { intent: 'info', title: 'There is no saved draft to validate' } };
  const notice: DraftNotice = result.valid
    ? { intent: 'success', title: 'The saved draft is publishable' }
    : { intent: 'warning', title: `${result.issues.length} issue(s) block publishing` };
  return { kind: 'checked', issues: result.issues, notice };
}
