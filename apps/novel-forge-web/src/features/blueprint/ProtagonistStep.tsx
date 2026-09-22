import { type ReactElement, useState } from 'react';
import { Alert, Button, Input, Textarea, toast } from '@shadow-library/ui';

import { isRoundLive, useCancelBlueprintRoundMutation, useLedgerEntriesQuery, useLockBlueprintStepMutation, useStartBlueprintRoundMutation } from '@/lib/apis';

import { anchorLine, readAnchoredLine, STALE_LINE_NOTE } from './anchored-line';
import { blueprintStepMeta, type StepScreenProps } from './blueprint-steps';
import { passRoundKey, passRunningLabel, sameJson } from './engine-pass';
import { LockBar } from './LockBar';
import { OptionCard } from './OptionCard';
import { PassSliceAlert } from './PassSliceAlert';
import {
  buildProtagonistSelection,
  chooseVersion,
  editLead,
  type LeadDraft,
  nextProtagonistDraft,
  parseProtagonistRound,
  PROTAGONIST_LINE_MAX,
  PROTAGONIST_NAME_MAX,
  PROTAGONIST_TOPIC,
  PROTAGONIST_WHY_MAX,
  PROTAGONIST_WRITER_LINE_MAX,
  protagonistAnchor,
  type ProtagonistDraft,
  protagonistDraftFrom,
  type ProtagonistVersion,
  restoreProtagonistDraft,
} from './protagonist-step';
import { buildRoundBody, EMPTY_STEER, type OptionVerdicts, roundThread, type SteerDraft, stepPayload } from './round';
import { RoundStatus } from './RoundStatus';
import { SteerBox } from './SteerBox';
import styles from './blueprint.module.css';

const RUNNING_LABEL = 'Writing three versions of the same person…';
const LEDGER_QUERY = { topics: PROTAGONIST_TOPIC };

type CrucibleField = 'wound' | 'want' | 'need' | 'change' | 'chapterOne';

const CRUCIBLE: { key: CrucibleField; label: string }[] = [
  { key: 'wound', label: 'Wound' },
  { key: 'want', label: 'Want' },
  { key: 'need', label: 'Need' },
  { key: 'change', label: 'Change' },
  { key: 'chapterOne', label: 'Chapter 1' },
];

interface VersionProps {
  version: ProtagonistVersion;
  chosen: boolean;
  busy: boolean;
  verdicts: OptionVerdicts;
  onChoose: () => void;
  onVerdict: (verdict: OptionVerdicts[string] | null) => void;
}

function VersionCard({ version, chosen, busy, verdicts, onChoose, onVerdict }: VersionProps): ReactElement {
  const verdict = verdicts[version.id];
  return (
    <OptionCard
      title={version.lie}
      description={version.chapterOne}
      selected={chosen}
      onSelect={onChoose}
      disabled={busy}
      verdict={verdict?.verdict ?? null}
      verdictReason={verdict?.reason}
      onVerdict={(next, reason) => onVerdict(next === null ? null : { verdict: next, ...(reason ? { reason } : {}) })}
    >
      <dl className={styles.conceptDetail}>
        <dt>Wound</dt>
        <dd>{version.wound}</dd>
        <dt>Want</dt>
        <dd>{version.want}</dd>
        <dt>Need</dt>
        <dd>{version.need}</dd>
      </dl>
    </OptionCard>
  );
}

interface ChosenProps {
  lead: LeadDraft;
  busy: boolean;
  onChange: (lead: LeadDraft) => void;
}

function ChosenLead({ lead, busy, onChange }: ChosenProps): ReactElement {
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>The one you are locking</h2>
      <p className={styles.cardLede}>Everything here is yours to rewrite. Change the lie and it stops being the version you picked.</p>
      <div className={styles.editFields}>
        <Input aria-label="Name" placeholder="Name" value={lead.name} maxLength={PROTAGONIST_NAME_MAX} disabled={busy} onValueChange={name => onChange(editLead(lead, { name }))} />
        <Input
          aria-label="Age and place in the world"
          placeholder="e.g. 17, lamp apprentice"
          value={lead.descriptor}
          maxLength={PROTAGONIST_LINE_MAX}
          disabled={busy}
          onValueChange={descriptor => onChange(editLead(lead, { descriptor }))}
        />
        <Input
          aria-label="The lie they believe"
          placeholder="The lie they believe, in their own words"
          value={lead.lie}
          maxLength={PROTAGONIST_LINE_MAX}
          disabled={busy}
          onValueChange={lie => onChange(editLead(lead, { lie }))}
        />
        {CRUCIBLE.map(({ key, label }) => (
          <Input
            key={key}
            aria-label={label}
            placeholder={label}
            value={lead[key]}
            maxLength={PROTAGONIST_LINE_MAX}
            disabled={busy}
            onValueChange={value => onChange(editLead(lead, { [key]: value }))}
          />
        ))}
      </div>
    </section>
  );
}

/** The Core phase's first screen: the same protagonist three times over, differing only in the lie they believe. */
export function ProtagonistStep({ projectId, step, onLocked }: StepScreenProps): ReactElement {
  const round = step.latestRound;
  const meta = blueprintStepMeta(step.key);
  const parsed = parseProtagonistRound(round);

  const [draft, setDraft] = useState<ProtagonistDraft>(protagonistDraftFrom);
  const [read, setRead] = useState(false);
  const [verdicts, setVerdicts] = useState<OptionVerdicts>({});
  const [steer, setSteer] = useState<SteerDraft>(EMPTY_STEER);
  const [roundKey, setRoundKey] = useState(() => passRoundKey(round));

  const startRound = useStartBlueprintRoundMutation(projectId, step.key);
  const cancelRound = useCancelBlueprintRoundMutation(projectId, step.key);
  const lockStep = useLockBlueprintStepMutation(projectId, step.key);
  const decidedBefore = useLedgerEntriesQuery(projectId, LEDGER_QUERY);

  // The lead already in the Notebook, unless the author has started answering in this session.
  if (!read && decidedBefore.data != null) {
    setRead(true);
    const locked = restoreProtagonistDraft(decidedBefore.data.entries);
    if (locked) setDraft(current => (sameJson(current, protagonistDraftFrom()) ? locked : current));
  }

  if (passRoundKey(round) !== roundKey) {
    setRoundKey(passRoundKey(round));
    setSteer(EMPTY_STEER);
    setVerdicts({});
    setDraft(current => nextProtagonistDraft(current, parsed));
  }

  const running = isRoundLive(round);
  const busy = running || startRound.isPending;
  const anchor = protagonistAnchor(draft.leads);
  const why = readAnchoredLine(draft.why, anchor);
  const writerLine = readAnchoredLine(draft.writerLine, anchor);
  const selection = buildProtagonistSelection(draft);

  const patch = (next: Partial<ProtagonistDraft>): void => setDraft(current => ({ ...current, ...next }));
  const chooseLead = (version: ProtagonistVersion): void => {
    const lead = parsed.leads.find(candidate => candidate.id === version.leadId);
    patch({ leads: { ...draft.leads, [version.leadId || 'l1']: chooseVersion(version, lead) } });
  };

  const run = (): void => {
    startRound.mutate(buildRoundBody(steer, verdicts), { onSuccess: () => setSteer(EMPTY_STEER), onError: err => toast.danger(err.message) });
  };

  const lock = (): void => {
    if (!selection) return;
    lockStep.mutate(
      { selection: stepPayload(selection) },
      {
        onSuccess: result => {
          if (result.followUp?.ok === false) toast.warning(result.followUp.error ?? 'Saved, but the follow-up work failed.');
          else toast.success('The protagonist is locked');
          onLocked();
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <>
      {round == null && (
        <section className={styles.card}>
          <p className={styles.cardLede}>
            One generation writes the protagonist, what stands in their way and how the world works. You review and lock each of them on its own screen.
          </p>
          <div className={styles.cardActions}>
            <Button variant="primary" loading={busy} disabled={busy} onClick={run}>
              Design the engine of this novel
            </Button>
          </div>
        </section>
      )}

      {decidedBefore.isError && (
        <Alert
          intent="danger"
          title="Couldn’t read back what you already decided"
          action={{ label: decidedBefore.isFetching ? 'Retrying…' : 'Try again', onClick: () => void decidedBefore.refetch() }}
        >
          Locking now would retire the answer this screen cannot see, so it stays disabled until the Notebook loads. {decidedBefore.error?.message}
        </Alert>
      )}

      <PassSliceAlert moved={step.sliceMoved} onAdopt={busy || sameJson(draft, protagonistDraftFrom()) ? undefined : () => setDraft(protagonistDraftFrom())} />

      <RoundStatus
        round={round}
        runningLabel={passRunningLabel(round, step.key, RUNNING_LABEL)}
        onCancel={() => cancelRound.mutate(undefined, { onError: err => toast.danger(err.message) })}
        cancelling={cancelRound.isPending}
        onRetry={run}
        retrying={startRound.isPending}
      />

      {parsed.leads.map(lead => (
        <section key={lead.id} className={styles.card}>
          <div className={styles.pairHead}>
            <h2 className={styles.cardTitle}>
              {lead.name}, {lead.descriptor}
            </h2>
            <span className={styles.pairCount}>Same person, three lies</span>
          </div>
          <div className={styles.versionGrid}>
            {parsed.versions
              .filter(version => version.leadId === lead.id)
              .map(version => (
                <VersionCard
                  key={version.id}
                  version={version}
                  busy={busy}
                  chosen={draft.leads[lead.id]?.optionId === version.id}
                  verdicts={verdicts}
                  onChoose={() => chooseLead(version)}
                  onVerdict={next =>
                    setVerdicts(current => (next === null ? Object.fromEntries(Object.entries(current).filter(([id]) => id !== version.id)) : { ...current, [version.id]: next }))
                  }
                />
              ))}
          </div>
        </section>
      ))}

      {Object.entries(draft.leads).map(([leadId, lead]) => (
        <ChosenLead key={leadId} lead={lead} busy={busy} onChange={next => patch({ leads: { ...draft.leads, [leadId]: next } })} />
      ))}

      {Object.keys(draft.leads).length > 0 && (
        <section className={styles.card}>
          <div className={styles.editFields}>
            <Input
              aria-label="Why this lie"
              placeholder="Why this lie — what in the premise points at it"
              value={why.text}
              maxLength={PROTAGONIST_WHY_MAX}
              disabled={busy}
              onValueChange={text => patch({ why: anchorLine(text, anchor) })}
            />
            {why.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
            <Textarea
              aria-label="What the lie means for whoever writes chapter one"
              aria-invalid={writerLine.text.trim().length === 0}
              placeholder="What the lie means for whoever writes chapter one — e.g. every scene shows him making himself needed"
              value={writerLine.text}
              maxLength={PROTAGONIST_WRITER_LINE_MAX}
              minRows={2}
              autoGrow
              disabled={busy}
              onValueChange={text => patch({ writerLine: anchorLine(text, anchor) })}
            />
            {writerLine.stale && <p className={styles.cardLede}>{STALE_LINE_NOTE}</p>}
          </div>
        </section>
      )}

      {round != null && (
        <SteerBox
          nudges={step.nudges}
          draft={steer}
          onDraftChange={setSteer}
          messages={roundThread(round)}
          onSubmit={run}
          submitLabel="Three new versions"
          running={busy}
          placeholder="Describe the character you picture…"
        />
      )}

      {round != null && (
        <LockBar
          label={meta.lockLabel ?? 'Lock protagonist'}
          hint={read ? 'Locking writes the decision, the character card and the cast page.' : 'Reading back what you already decided…'}
          onLock={lock}
          loading={lockStep.isPending}
          disabled={!read || selection == null || busy || lockStep.isPending}
        />
      )}
    </>
  );
}
