import { type ReactElement, useState } from 'react';

import { Button, Dialog, IconButton, Input, Select, toast } from '@shadow-library/ui';

import { TrashIcon } from '@/components/icons';
import { type FactResponse, usePatchFactMutation } from '@/lib/apis';
import { secretTitle } from '@/lib/bible-secrets';
import { type TermDraft, type TermDraftKind, termDrafts, termsFromDrafts, type UnlockLookup } from '@/lib/secret-states';

import detailStyles from './BibleDetails.module.css';
import styles from './StoryBible.module.css';

const KIND_LABEL: Record<TermDraftKind, string> = { milestone: 'Milestone reached', volume: 'Volume started', chapter: 'From chapter', ending: 'At the ending' };

const KINDS: readonly TermDraftKind[] = ['milestone', 'volume', 'chapter', 'ending'];

function isKind(value: string): value is TermDraftKind {
  return KINDS.some(kind => kind === value);
}

export interface ConditionsDialogProps {
  novelId: string;
  fact: FactResponse;
  lookup: UnlockLookup;
  onOpenChange: (open: boolean) => void;
}

export function ConditionsDialog({ novelId, fact, lookup, onOpenChange }: ConditionsDialogProps): ReactElement {
  const patch = usePatchFactMutation(novelId);
  const [drafts, setDrafts] = useState<TermDraft[]>(() => termDrafts(fact));
  const terms = termsFromDrafts(drafts);
  const milestones = [...lookup.milestones.values()];
  const volumes = [...lookup.volumes.values()].sort((a, b) => a.ordinal - b.ordinal);

  const change = (index: number, next: TermDraft): void => setDrafts(current => current.map((draft, at) => (at === index ? next : draft)));

  const save = (): void => {
    if (!terms) return;
    patch.mutate(
      { factKey: fact.factKey, unlock: terms.length > 0 ? { all: terms } : null },
      {
        onSuccess: () => {
          toast.success('Conditions saved');
          onOpenChange(false);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header
          title={`Change the conditions · ${secretTitle(fact.factKey)}`}
          description="It unlocks for the writer only when all of these hold, in any order. No conditions and no date means no chapter plan may reveal it."
        />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            {drafts.length === 0 && <p className={styles.muted}>No conditions yet.</p>}
            {drafts.map((draft, index) => (
              <div key={index} className={detailStyles.conditionRow}>
                <Select size="sm" aria-label={`Condition ${index + 1} kind`} value={draft.kind} onValueChange={value => isKind(value) && change(index, { kind: value, value: '' })}>
                  {KINDS.map(kind => (
                    <Select.Item key={kind} value={kind}>
                      {KIND_LABEL[kind]}
                    </Select.Item>
                  ))}
                </Select>
                <div>
                  {draft.kind === 'milestone' && (
                    <Select
                      size="sm"
                      aria-label={`Condition ${index + 1} milestone`}
                      placeholder="Pick a milestone"
                      value={draft.value}
                      onValueChange={value => change(index, { ...draft, value })}
                    >
                      {milestones.map(milestone => (
                        <Select.Item key={milestone.milestoneKey} value={milestone.milestoneKey}>
                          {milestone.label}
                        </Select.Item>
                      ))}
                    </Select>
                  )}
                  {draft.kind === 'volume' && (
                    <Select
                      size="sm"
                      aria-label={`Condition ${index + 1} volume`}
                      placeholder="Pick a volume"
                      value={draft.value}
                      onValueChange={value => change(index, { ...draft, value })}
                    >
                      {volumes.map(volume => (
                        <Select.Item key={volume.volumeKey} value={volume.volumeKey}>
                          {`Volume ${volume.ordinal}${volume.title ? ` · ${volume.title}` : ''}`}
                        </Select.Item>
                      ))}
                    </Select>
                  )}
                  {draft.kind === 'chapter' && (
                    <Input
                      size="sm"
                      type="number"
                      min={1}
                      aria-label={`Condition ${index + 1} chapter`}
                      value={draft.value}
                      onValueChange={value => change(index, { ...draft, value })}
                    />
                  )}
                  {draft.kind === 'ending' && <span className={styles.muted}>Only the chapters planned as the ending.</span>}
                </div>
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove condition ${index + 1}`}
                  icon={<TrashIcon size={14} />}
                  onClick={() => setDrafts(current => current.filter((_, at) => at !== index))}
                />
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className={styles.startAligned}
              onClick={() => setDrafts(current => [...current, { kind: milestones.length > 0 ? 'milestone' : 'chapter', value: '' }])}
            >
              + Add a condition
            </Button>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={patch.isPending} disabled={!terms} onClick={save}>
            Save conditions
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
