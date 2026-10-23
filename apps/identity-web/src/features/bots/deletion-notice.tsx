import { Alert, toast } from '@shadow-library/ui';

import { type BotItem, useRetryBotTransfersMutation } from '@/lib/apis';
import { botErrorMessage } from '@/lib/bot-errors';
import { formatDate } from '@/lib/format';

interface DeletionNoticeProps {
  orgId: string;
  bot: BotItem;
  require: (action: () => void) => void;
}

/** A deleting bot has no Suspend/Resume, so this banner is the only place its state and any stuck handover are visible. */
export function DeletionNotice({ orgId, bot, require }: DeletionNoticeProps): React.JSX.Element | null {
  const retry = useRetryBotTransfersMutation(orgId);
  const deletion = bot.deletion;
  if (!deletion) return null;

  const recipient = deletion.transferTo?.displayName ?? 'a member';
  const stuckNames = deletion.stalledApplications.join(', ');

  if (deletion.stalled)
    return (
      <Alert
        intent="danger"
        title="Deletion is stuck"
        action={{
          label: retry.isPending ? 'Retrying…' : 'Retry transfer',
          onClick: () =>
            require(() =>
              retry.mutate(bot.id, {
                onSuccess: result =>
                  result.retried > 0
                    ? toast.success(`${result.retried === 1 ? 'Transfer' : `${result.retried} transfers`} queued again`)
                    : toast.info('Nothing to requeue — no transfer has run out of attempts yet.'),
                onError: error => toast.danger(botErrorMessage(error)),
              }),
            ),
        }}
      >
        {stuckNames ? `${stuckNames} did not confirm the handover` : 'An app did not confirm the handover'} after every retry. The bot stays suspended and its records stay with it
        until the transfer succeeds.
      </Alert>
    );

  return (
    <Alert intent="warning" title="Deletion in progress">
      Requested on {formatDate(deletion.requestedAt)}. The bot is already suspended; {deletion.done} of {deletion.done + deletion.pending + deletion.failed} apps have handed their
      records to {recipient}.
    </Alert>
  );
}
