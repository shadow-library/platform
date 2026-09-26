import { useState } from 'react';
import { ConfirmDialog } from '@shadow-library/ui';

import { overrideWarning } from '@/lib/chapter-checks';

export interface OverrideConfirm {
  /** Runs the approval at once, or first asks the author to confirm when it would override open blocking findings. */
  request: (approve: () => void) => void;
  dialog: React.JSX.Element;
  open: boolean;
}

export function useOverrideConfirm(chapter: number, blocking: number): OverrideConfirm {
  const [pending, setPending] = useState<{ approve: () => void } | undefined>();

  const request = (approve: () => void): void => {
    if (blocking > 0) setPending({ approve });
    else approve();
  };

  const dialog = (
    <ConfirmDialog
      open={pending !== undefined}
      onOpenChange={open => !open && setPending(undefined)}
      intent="danger"
      title={`Approve chapter ${chapter} over its blocking ${blocking === 1 ? 'finding' : 'findings'}?`}
      description={overrideWarning(blocking)}
      confirmLabel="Approve and override"
      onConfirm={() => {
        pending?.approve();
        setPending(undefined);
      }}
    />
  );

  return { request, dialog, open: pending !== undefined };
}
