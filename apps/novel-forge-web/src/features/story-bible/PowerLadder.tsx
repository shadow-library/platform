import { Link } from '@tanstack/react-router';
import { type ReactElement, useMemo, useState } from 'react';

import { Alert, Button, SegmentedControl, Spinner } from '@shadow-library/ui';

import { BoltIcon, ChevronLeftIcon } from '@/components/icons';
import { EmptyState, StatusChip } from '@/components/nf';
import { type EntityResponse, type FactResponse } from '@/lib/apis';
import { leadSection } from '@/lib/bible-entries';
import { ladderFacts, ladderRungs, type Rung, rungLine, truthShownPlainly, unlockSummary } from '@/lib/power-ladder';
import { knowerRows, TERM_INTENT, type UnlockLookup, unlockRows, writerToldLine } from '@/lib/secret-states';
import { markdownPlainText, stripEntityHeading } from '@/lib/story-bible';

import detailStyles from './BibleDetails.module.css';
import { ConditionsDialog } from './ConditionsDialog';
import { AllowedClues, TruthToggle } from './SecretStates';
import styles from './StoryBible.module.css';
import { useUnlockLookup } from './use-unlock-lookup';

export interface PowerLadderProps {
  novelId: string;
  entity: EntityResponse;
  facts: readonly FactResponse[];
  onEditFact: (fact: FactResponse) => void;
  onAddSecret: (entityKey: string) => void;
}

export interface RungDetailProps {
  novelId: string;
  rung: Rung<FactResponse>;
  lookup: UnlockLookup;
  onEditFact: (fact: FactResponse) => void;
}

export function RungDetail({ novelId, rung, lookup, onEditFact }: RungDetailProps): ReactElement {
  const { fact } = rung;
  const [changing, setChanging] = useState(false);
  const [shown, setShown] = useState(false);
  const plain = truthShownPlainly(fact);
  const conditions = unlockRows(fact, lookup);
  const knowers = knowerRows(fact);

  return (
    <section className={detailStyles.rungDetail} aria-label={`${rung.n} · ${rung.name}`}>
      <h3 className={detailStyles.rungDetailTitle}>
        {rung.n} · {rung.name}
      </h3>
      <p className={styles.label}>What it is</p>
      {plain ? <p className={styles.secretText}>{fact.text}</p> : <TruthToggle text={fact.text} shown={shown} onToggle={() => setShown(value => !value)} />}
      <p className={styles.label}>Who knows it</p>
      {knowers.length === 0 ? (
        <p className={styles.muted}>Nobody yet.</p>
      ) : (
        <ul className={detailStyles.clueList}>
          {knowers.map(knower => (
            <li key={knower.entityKey} className={styles.secretText}>
              {knower.name} · since ch {knower.chapter}
              {(plain || shown) && knower.note ? ` · ${knower.note}` : ''} <StatusChip intent={knower.intent}>{knower.chip}</StatusChip>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.label}>Unlocks for the writer when all of these hold</p>
      {conditions.length === 0 && <p className={styles.muted}>No conditions set.</p>}
      {conditions.map((condition, index) => (
        <div key={`${condition.kind}:${index}`} className={detailStyles.conditionGroup}>
          {index > 0 && <span className={detailStyles.and}>AND</span>}
          <div className={detailStyles.condition}>
            <span className={detailStyles.conditionKind}>{condition.kind}</span>
            <span className={detailStyles.conditionLabel}>{condition.label}</span>
            <StatusChip intent={TERM_INTENT[condition.state]}>{condition.status}</StatusChip>
          </div>
        </div>
      ))}
      <p className={styles.muted}>{unlockSummary(rung.state)}</p>
      <p className={styles.label}>Allowed clues before then</p>
      <AllowedClues novelId={novelId} fact={fact} />
      <p className={styles.label}>Until then the writer is told</p>
      <p className={styles.secretText}>{writerToldLine(fact)}</p>
      <div className={detailStyles.detailActions}>
        <Button variant="secondary" size="sm" onClick={() => onEditFact(fact)}>
          Edit
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setChanging(true)}>
          Change the conditions
        </Button>
      </div>
      {changing && <ConditionsDialog novelId={novelId} fact={fact} lookup={lookup} onOpenChange={setChanging} />}
    </section>
  );
}

function HowUnlockingWorks(): ReactElement {
  return (
    <section className={detailStyles.howItWorks} aria-label="How unlocking works">
      <h3 className={detailStyles.howTitle}>How unlocking works</h3>
      <p className={detailStyles.howText}>
        A rung is kept like a secret. Instead of a chapter number it has <b>conditions</b>, all of which must hold: a <b>milestone</b>, a volume, a chapter, or the ending.
      </p>
      <p className={detailStyles.howText}>
        When a chapter plan says it reaches a milestone, the milestone is <b>planned</b> for that chapter — provisional. It becomes <b>reached</b> only when you finalize the
        chapter. Change that chapter’s plan and it goes back to open.
      </p>
      <p className={detailStyles.howText}>
        Rungs don’t unlock in a chain: opening one says nothing about another. And the writer gets a rung only in chapters told by someone who knows it.
      </p>
      <p className={detailStyles.howText}>The checker flags an unplanned disclosure — an explanation, or a clear inference, before the unlock. Allowed clues are fine.</p>
    </section>
  );
}

export interface RungListProps {
  rungs: readonly Rung<FactResponse>[];
  selected: Rung<FactResponse> | undefined;
  onSelect: (factKey: string) => void;
}

export function RungList({ rungs, selected, onSelect }: RungListProps): ReactElement {
  return (
    <div className={detailStyles.rungs}>
      {rungs.map(rung => (
        <button
          key={rung.fact.factKey}
          type="button"
          className={detailStyles.rung}
          aria-current={rung === selected ? 'true' : undefined}
          data-locked={rung.state.kind === 'locked' || undefined}
          onClick={() => onSelect(rung.fact.factKey)}
        >
          <span className={detailStyles.rungNumber}>{rung.n}</span>
          <span className={detailStyles.rungText}>
            <span className={detailStyles.rungName}>{rung.name}</span>
            <span className={detailStyles.rungLine}>{rungLine(rung.fact)}</span>
          </span>
          <StatusChip intent={rung.intent} className={detailStyles.rungChip}>
            {rung.chip}
          </StatusChip>
        </button>
      ))}
    </div>
  );
}

export function PowerLadder({ novelId, entity, facts, onEditFact, onAddSecret }: PowerLadderProps): ReactElement {
  const { lookup, error, retry } = useUnlockLookup(novelId);
  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const ladder = useMemo(() => ladderFacts(facts, entity.entityKey), [facts, entity.entityKey]);
  const rungs = useMemo(() => ladderRungs(ladder, lookup), [ladder, lookup]);
  const selected = rungs.find(rung => rung.fact.factKey === selectedKey) ?? rungs[0];
  const intro = leadSection(markdownPlainText(stripEntityHeading(entity.body ?? '', entity.name))).lead;
  const ready = lookup.status === 'ready';

  let content: ReactElement;
  if (ladder.length === 0)
    content = (
      <EmptyState
        icon={<BoltIcon size={24} />}
        title="No rungs yet"
        description={`Each rung is a secret about ${entity.name} with its own unlock conditions. Add the first one.`}
        actions={
          <Button variant="primary" onClick={() => onAddSecret(entity.entityKey)}>
            Add a rung
          </Button>
        }
      />
    );
  else if (error)
    content = (
      <Alert intent="danger" title="Couldn’t load milestones, volumes or chapters" action={{ label: 'Retry', onClick: retry }}>
        {error.message}
      </Alert>
    );
  else if (!ready) content = <Spinner size="lg" label="Loading the ladder’s conditions" />;
  else content = <RungList rungs={rungs} selected={selected} onSelect={setSelectedKey} />;

  return (
    <div className={detailStyles.ladder}>
      <div className={detailStyles.ladderMain}>
        <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={{ topic: 'power', entity: entity.entityKey }} className={styles.linkButton}>
          <ChevronLeftIcon size={14} /> Story Bible / Power &amp; rules
        </Link>
        <div className={detailStyles.ladderTitleRow}>
          <h2 className={detailStyles.ladderTitle}>{entity.name}</h2>
          <StatusChip intent="neutral">Power ladder</StatusChip>
        </div>
        {intro && <p className={detailStyles.ladderIntro}>{intro}</p>}
        {ladder.length > 0 && (
          <div className={detailStyles.viewRow}>
            <span className={styles.muted}>Show the ladder as</span>
            <SegmentedControl aria-label="Show the ladder as" value="author">
              <SegmentedControl.Item value="author">You (everything)</SegmentedControl.Item>
              <SegmentedControl.Item value="writer" disabled>
                The writer, at a chapter
              </SegmentedControl.Item>
            </SegmentedControl>
            <span className={styles.muted}>Coming soon — what the writer holds depends on whose eyes each chapter is told through.</span>
          </div>
        )}
        {content}
      </div>
      <aside className={detailStyles.ladderAside}>
        {selected && ready && <RungDetail key={selected.fact.factKey} novelId={novelId} rung={selected} lookup={lookup} onEditFact={onEditFact} />}
        <HowUnlockingWorks />
      </aside>
    </div>
  );
}
