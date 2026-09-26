import { useBlocker } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, Dialog } from '@shadow-library/ui';

export interface UnsavedChangesGuardProps {
  when: boolean;
  /** Why leaving loses text; it differs when saving is possible from when it is paused or refused. */
  description: string;
  /** Absent when the text cannot be saved from here, which drops "Save and leave". */
  onSave?: () => Promise<boolean>;
}

export function UnsavedChangesGuard({ when, description, onSave }: UnsavedChangesGuardProps): React.JSX.Element | null {
  const blocker = useBlocker({ shouldBlockFn: () => when, enableBeforeUnload: () => when, withResolver: true });
  const [saving, setSaving] = useState(false);
  if (blocker.status !== 'blocked') return null;

  const saveAndLeave = async (): Promise<void> => {
    if (!onSave) return;
    setSaving(true);
    const saved = await onSave();
    setSaving(false);
    if (saved) blocker.proceed();
    else blocker.reset();
  };

  return (
    <Dialog open onOpenChange={open => !open && !saving && blocker.reset()}>
      <Dialog.Content size="sm">
        <Dialog.Header title="Leave with unsaved changes?" description={description} />
        <Dialog.Footer>
          <Button variant="ghost" disabled={saving} onClick={blocker.reset}>
            Stay
          </Button>
          <Button variant="danger" disabled={saving} onClick={blocker.proceed}>
            Leave without saving
          </Button>
          {onSave && (
            <Button variant="primary" loading={saving} onClick={() => void saveAndLeave()}>
              Save and leave
            </Button>
          )}
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
