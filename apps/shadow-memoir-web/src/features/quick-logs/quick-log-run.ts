import { failureCopy, notifyOutcome, type QuickLogCommand, type QuickLogCommandHook, type QuickLogCommandResult } from '@/lib/data';

export type QuickLogRun = { kind: 'saved'; result: QuickLogCommandResult } | { kind: 'confirm'; result: QuickLogCommandResult } | { kind: 'unsaved' };

export interface QuickLogFeedback {
  action: string;
  subject: string;
  success: (result: QuickLogCommandResult) => string;
}

export async function runQuickLog(command: QuickLogCommandHook, input: QuickLogCommand, feedback: QuickLogFeedback): Promise<QuickLogRun> {
  const outcome = await command.run(input).catch(() => null);
  if (!outcome) {
    notifyOutcome({ status: 'failed', message: failureCopy(null), code: null, undone: false }, { action: feedback.action, subject: feedback.subject, success: '' });
    return { kind: 'unsaved' };
  }
  if (outcome.status === 'needs-confirmation') return { kind: 'confirm', result: outcome.confirmation };

  const saved = outcome.status === 'applied' || outcome.status === 'queued-offline';
  notifyOutcome(outcome, { action: feedback.action, subject: feedback.subject, success: saved ? feedback.success(outcome.local) : '' });
  return saved ? { kind: 'saved', result: outcome.local } : { kind: 'unsaved' };
}

export function mealLoggedMessage(result: QuickLogCommandResult): string {
  return result.reward?.rewarded ? `${result.message} First meal today — +${result.reward.xp} XP.` : result.message;
}
