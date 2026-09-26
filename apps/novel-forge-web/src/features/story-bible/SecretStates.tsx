import { type FormEvent, type ReactElement, type ReactNode, useId, useState } from 'react';

import { Button, Input, toast } from '@shadow-library/ui';

import { EyeIcon, EyeOffIcon, TrashIcon } from '@/components/icons';
import { RowAction, StatusChip } from '@/components/nf';
import { type FactResponse, usePatchFactMutation } from '@/lib/apis';
import { allowedClues, knowerRows, plannedRevealLine, readerLearnsLine, TERM_INTENT, unlockRows, withClue, withoutClue, writerToldLine } from '@/lib/secret-states';

import styles from './BibleDetails.module.css';
import { ConditionsDialog } from './ConditionsDialog';
import sharedStyles from './StoryBible.module.css';
import { useUnlockLookup } from './use-unlock-lookup';

const CONCEALED_TRUTH = 'The truth stays out of the page until you choose to show it here.';

function StateRow({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className={styles.stateRow}>
      <span className={sharedStyles.label}>{label}</span>
      <div className={styles.stateValue}>{children}</div>
    </div>
  );
}

export interface TruthToggleProps {
  text: string;
  shown: boolean;
  onToggle: () => void;
}

/** Until it is shown the truth is not in the page at all — the blur covers fixed filler, so neither a screen reader nor a stray copy can spoil it. */
export function TruthToggle({ text, shown, onToggle }: TruthToggleProps): ReactElement {
  const truthId = useId();
  return (
    <>
      <p id={truthId} className={shown ? sharedStyles.secretText : `${sharedStyles.secretText} ${sharedStyles.blurred}`} aria-hidden={!shown}>
        {shown ? text : CONCEALED_TRUTH}
      </p>
      <Button
        variant="ghost"
        size="sm"
        prefix={shown ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
        aria-controls={truthId}
        aria-expanded={shown}
        onClick={onToggle}
        className={sharedStyles.startAligned}
      >
        {shown ? 'Hide truth' : 'Show truth'}
      </Button>
    </>
  );
}

export interface AllowedCluesProps {
  novelId: string;
  fact: FactResponse;
}

export function AllowedClues({ novelId, fact }: AllowedCluesProps): ReactElement {
  const patch = usePatchFactMutation(novelId);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const clues = allowedClues(fact);

  const save = (next: string[], done: string): void =>
    patch.mutate(
      { factKey: fact.factKey, allowedClues: next.length > 0 ? next : null },
      {
        onSuccess: () => {
          toast.success(done);
          setDraft('');
          setAdding(false);
        },
        onError: err => toast.danger(err.message),
      },
    );

  const add = (event: FormEvent): void => {
    event.preventDefault();
    const next = withClue(clues, draft);
    if (next.length === clues.length) {
      if (draft.trim()) toast.warning('That clue is already listed.');
      return;
    }
    save(next, 'Clue added');
  };

  return (
    <>
      {clues.length === 0 ? (
        <span className={sharedStyles.muted}>None yet.</span>
      ) : (
        <ul className={styles.clueList}>
          {clues.map((clue, index) => (
            <li key={clue} className={sharedStyles.ledgerRow}>
              <span>· {clue}</span>
              <RowAction label={`Remove clue “${clue}”`} danger onClick={() => save(withoutClue(clues, index), 'Clue removed')}>
                <TrashIcon size={13} />
              </RowAction>
            </li>
          ))}
        </ul>
      )}
      <span className={sharedStyles.muted}>The checker flags an explanation or a clear inference before the unlock — not these clues.</span>
      {adding ? (
        <form className={styles.clueForm} onSubmit={add}>
          <Input
            size="sm"
            aria-label="New clue"
            placeholder="Something the writer may show…"
            value={draft}
            onValueChange={setDraft}
            onKeyDown={event => event.key === 'Escape' && setAdding(false)}
            autoFocus
          />
          <Button type="submit" size="sm" variant="secondary" loading={patch.isPending} disabled={!draft.trim()}>
            Add
          </Button>
        </form>
      ) : (
        <button type="button" className={sharedStyles.linkButton} onClick={() => setAdding(true)}>
          + Add a clue
        </button>
      )}
    </>
  );
}

export interface SecretStatesProps {
  novelId: string;
  fact: FactResponse;
  onRetract?: (entityKey: string, entityName: string) => void;
  onAddLearner?: () => void;
}

/** A secret's four states side by side — truth, planned reveal, reader disclosure, who knows — plus what the writer is told and the clues it may show. */
export function SecretStates({ novelId, fact, onRetract, onAddLearner }: SecretStatesProps): ReactElement {
  const { lookup, error, retry } = useUnlockLookup(novelId);
  const [changing, setChanging] = useState(false);
  const [shown, setShown] = useState(false);
  const terms = unlockRows(fact, lookup);
  const knowers = knowerRows(fact);

  return (
    <div className={styles.states}>
      <StateRow label="True in the world">
        <TruthToggle text={fact.text} shown={shown} onToggle={() => setShown(value => !value)} />
      </StateRow>
      <StateRow label="Planned reveal">
        {terms.length > 0 && (
          <>
            <span>
              Unlocks when <b>all</b> of these hold:
            </span>
            <span className={styles.chips}>
              {terms.map((term, index) => (
                <StatusChip key={`${term.kind}:${index}`} intent={TERM_INTENT[term.state]}>
                  {term.kind === 'MILESTONE' ? `Milestone: ${term.label}` : term.label} · {term.status}
                </StatusChip>
              ))}
            </span>
          </>
        )}
        {terms.length > 0 && error && (
          <span className={sharedStyles.muted}>
            Couldn’t check the conditions: {error.message}{' '}
            <button type="button" className={sharedStyles.linkButton} onClick={retry}>
              Retry
            </button>
          </span>
        )}
        <span className={terms.length > 0 ? sharedStyles.muted : undefined}>{plannedRevealLine(fact)}</span>
        <button type="button" className={sharedStyles.linkButton} onClick={() => setChanging(true)}>
          Change the conditions
        </button>
        {changing && <ConditionsDialog novelId={novelId} fact={fact} lookup={lookup} onOpenChange={setChanging} />}
      </StateRow>
      <StateRow label="Reader learns it">
        <span>{readerLearnsLine(fact)}</span>
      </StateRow>
      <StateRow label="Who knows it">
        {knowers.length === 0 ? (
          <span className={sharedStyles.muted}>Nobody yet.</span>
        ) : (
          <ul className={styles.clueList}>
            {knowers.map(knower => (
              <li key={knower.entityKey} className={sharedStyles.ledgerRow}>
                <span>
                  {knower.name} · since ch {knower.chapter}
                  {shown && knower.note ? ` · ${knower.note}` : ''} <StatusChip intent={knower.intent}>{knower.chip}</StatusChip>
                </span>
                {onRetract && (
                  <RowAction label={`Retract ${knower.name}’s knowledge`} danger onClick={() => onRetract(knower.entityKey, knower.name)}>
                    <TrashIcon size={13} />
                  </RowAction>
                )}
              </li>
            ))}
          </ul>
        )}
        {onAddLearner && (
          <button type="button" className={sharedStyles.linkButton} onClick={onAddLearner}>
            + Add who learns it
          </button>
        )}
      </StateRow>
      <StateRow label="The writer is told">
        <span>{writerToldLine(fact)}</span>
      </StateRow>
      <StateRow label="Allowed clues">
        <AllowedClues novelId={novelId} fact={fact} />
      </StateRow>
    </div>
  );
}
