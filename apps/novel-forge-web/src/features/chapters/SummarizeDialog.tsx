import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, FormField, Spinner, Textarea, toast } from '@shadow-library/ui';

import { type DraftResponse, isIsolated, SummaryConflictError, useSaveSummaryMutation, useSummarizeChapterMutation, useUpdateDraftMutation } from '@/lib/apis';

import styles from './chapters.module.css';

interface SummarizeDialogProps {
  novelId: string;
  draft: DraftResponse;
  /** False opens straight into an empty summary field, for "write your own" — no model call, nothing read until Save. */
  autoRun: boolean;
  onOpenChange: (open: boolean) => void;
}

// An isolated chapter's summary and state are review-then-apply (finalize's own gate on both); a non-isolated
// chapter has no state to gate, so its summary alone saves directly, from the AI call or from Save.
export function SummarizeDialog({ novelId, draft, autoRun, onOpenChange }: SummarizeDialogProps): React.JSX.Element {
  const { chapter } = draft;
  const isolated = isIsolated(draft);
  const summarize = useSummarizeChapterMutation(novelId, chapter);
  const updateDraft = useUpdateDraftMutation(novelId, chapter);
  const saveSummary = useSaveSummaryMutation(novelId, chapter);
  const [summary, setSummary] = useState(draft.summary ?? '');
  const [stateText, setStateText] = useState(() => JSON.stringify(draft.state ?? {}, null, 2));
  const requestedRef = useRef(false);

  const runSummarize = (): void => {
    summarize.mutate(undefined, {
      onSuccess: result => {
        setSummary(result.summary);
        setStateText(JSON.stringify(result.state, null, 2));
      },
      onError: error => {
        if (error instanceof SummaryConflictError) {
          setSummary(error.attemptedSummary);
          toast.warning('This chapter changed while summarizing — review the result before saving.');
        } else {
          toast.danger(error.message);
        }
      },
    });
  };

  useEffect(() => {
    if (!autoRun || requestedRef.current) return;
    requestedRef.current = true;
    runSummarize();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once, on open, only when autoRun asked for it
  }, [autoRun]);

  const parsedState = useMemo(() => {
    try {
      const value: unknown = JSON.parse(stateText);
      return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }, [stateText]);

  const saving = isolated ? updateDraft.isPending : saveSummary.isPending;
  const waiting = autoRun && summarize.isPending;

  const save = (): void => {
    if (isolated) {
      updateDraft.mutate(
        { baseDraftId: draft.id, baseRevision: draft.revision, baseSaveSeq: draft.saveSeq, body: draft.body ?? '', summary: summary.trim(), state: parsedState },
        {
          onSuccess: () => {
            toast.success('Summary and continuation state saved');
            onOpenChange(false);
          },
          onError: error => toast.danger(error.message),
        },
      );
      return;
    }
    saveSummary.mutate(
      { summary: summary.trim(), baseDraftId: draft.id, baseRevision: draft.revision, baseSaveSeq: draft.saveSeq },
      {
        onSuccess: () => {
          toast.success('Summary saved');
          onOpenChange(false);
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={open => !saving && onOpenChange(open)}>
      <Dialog.Content size="lg">
        <Dialog.Header
          title={`Summarize chapter ${chapter}`}
          description={
            isolated
              ? 'Review both fields, then apply them to the draft.'
              : autoRun
                ? 'Saved once the AI finishes reading the chapter — edit it and save again if you change it.'
                : 'The current summary, if any — write your own, or ask the AI, then save.'
          }
        />
        <Dialog.Body>
          {waiting ? (
            <div className={styles.summarizeWaiting}>
              <Spinner size="sm" />
              <span>Reading the chapter…</span>
            </div>
          ) : (
            <div className={styles.dialogForm}>
              {!autoRun && (
                <Button variant="secondary" size="sm" className={styles.startAligned} loading={summarize.isPending} onClick={runSummarize}>
                  Summarise with AI
                </Button>
              )}
              <FormField label="Summary" required helper="2–3 sentences, past tense. This is all the next chapter gets to see of this one.">
                <Textarea value={summary} onValueChange={setSummary} minRows={4} autoGrow />
              </FormField>
              {isolated && (
                <FormField
                  label="Continuation state"
                  required
                  error={parsedState ? undefined : 'Must be a JSON object'}
                  helper="What the next chapter builds on — positions, injuries, who knows what."
                >
                  <Textarea value={stateText} onValueChange={setStateText} minRows={8} autoGrow className={styles.jsonField} />
                </FormField>
              )}
            </div>
          )}
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" disabled={!summary.trim() || (isolated && !parsedState)} loading={saving} onClick={save}>
            {isolated ? 'Apply to draft' : 'Save'}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
