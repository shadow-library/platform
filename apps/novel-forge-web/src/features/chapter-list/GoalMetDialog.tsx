import { Button, Dialog, toast } from '@shadow-library/ui';

import { useVolumeGoalMetMutation } from '@/lib/apis';
import { type ChapterGroup, goalMetLabel } from '@/lib/chapter-list';

export interface GoalMetDialogProps {
  novelId: string;
  group: ChapterGroup;
  next?: ChapterGroup;
  onOpenChange: (open: boolean) => void;
}

export function GoalMetDialog({ novelId, group, next, onOpenChange }: GoalMetDialogProps): React.JSX.Element {
  const goalMet = useVolumeGoalMetMutation(novelId);
  const confirm = (): void => {
    if (goalMet.isPending) return;
    goalMet.mutate(group.key, {
      onSuccess: result => {
        const started = result.activated && next ? ` — volume ${next.number} is now active` : '';
        toast.success(`Volume ${group.number}’s goal is met${started}`);
        onOpenChange(false);
      },
      onError: error => toast.danger(error.message),
    });
  };

  const then = next
    ? `Volume ${next.number} will become the volume you’re writing, and new chapters will join it.`
    : 'No volume is waiting to start, so none will be active until you plan the next one.';
  return (
    <Dialog open onOpenChange={open => !goalMet.isPending && onOpenChange(open)}>
      <Dialog.Content size="sm">
        <Dialog.Header title={goalMetLabel(group, next)} description={`Volume ${group.number} will be marked goal met. ${then} This can’t be undone from here.`} />
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={goalMet.isPending} onClick={confirm}>
            Mark goal met
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
