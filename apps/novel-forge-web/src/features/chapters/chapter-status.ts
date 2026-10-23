import { type ChipIntent } from '@/components/nf';
import { type DraftResponse } from '@/lib/apis';

type ReviewStatus = DraftResponse['reviewStatus'];

interface StatusMeta {
  intent: ChipIntent;
  label: string;
}

const STATUS_META: Record<ReviewStatus, StatusMeta> = {
  generating: { intent: 'info', label: 'Generating' },
  needs_review: { intent: 'warning', label: 'Needs review' },
  contradiction: { intent: 'danger', label: 'Conflict' },
  approved: { intent: 'success', label: 'Approved' },
  final: { intent: 'success', label: 'Final' },
};

export function statusMeta(draft: Pick<DraftResponse, 'status' | 'reviewStatus'>): StatusMeta {
  if (draft.status === 'final') return { intent: 'success', label: 'Final' };
  return STATUS_META[draft.reviewStatus] ?? { intent: 'neutral', label: 'Draft' };
}
