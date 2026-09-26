import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, DropdownMenu, EmptyState, IconButton, Input, Select, Spinner, Tag, Textarea } from '@shadow-library/ui';

import { CloseIcon, PlusIcon } from '@/components/icons';
import { type ChipIntent, StatusChip } from '@/components/nf/StatusChip';
import { type ApiError, type ChangeOpItem, type ContentMode, type ProposalResponse } from '@/lib/apis';
import { HOOK_TYPE_LABELS, HOOK_TYPES } from '@/lib/chapter-brief';
import {
  addablePages,
  ALWAYS_SENT,
  changeSetWith,
  claimableMilestones,
  endingProblem,
  everySceneFrom,
  findPlanOp,
  isBlankPlan,
  lengthChoices,
  lengthLabel,
  milestoneLabel,
  type PlanDraft,
  planDraftOf,
  planErrorView,
  type PlanMilestone,
  type PlanOpRef,
  type PlanPage,
  type PlanScene,
  planWarningsOf,
  planWords,
  refLabel,
  resolvedContentMode,
  sceneAfterRemoving,
  startedEmpty,
  withLength,
  withNewScene,
  withoutReveals,
  withoutScene,
  withScene,
  type WriteErrorView,
} from '@/lib/plan-card';

import styles from './PlanCard.module.css';

export interface PlanCharacter {
  entityKey: string;
  name: string;
}

export interface PlanCardProps {
  proposal?: ProposalResponse;
  loading?: boolean;
  /** The card could not be loaded. */
  error?: ApiError | null;
  onRetry?: () => void;
  /** The characters a scene may be told by. */
  characters: readonly PlanCharacter[];
  milestones?: readonly PlanMilestone[];
  /** Every Story Bible page the writer could be given, labelled; chosen refs not listed fall back to a label read from the ref. */
  pages?: readonly PlanPage[];
  /** What the writer will not be given for this chapter, one line each. */
  kept?: readonly string[];
  projectContentMode: ContentMode;
  /** The mode the chapter already has from an earlier plan; null follows the novel. */
  chapterContentMode?: ContentMode | null;
  /** Sets the canvas's 40px indent under the assistant's avatar. */
  indent?: boolean;
  saving?: boolean;
  saveError?: ApiError | null;
  onRetrySave?: () => void;
  writing?: boolean;
  applyError?: ApiError | null;
  onClearApplyError?: () => void;
  writeFailure?: WriteErrorView | null;
  onRetryWrite?: () => void;
  discarding?: boolean;
  /** The whole change-set with the card's edit written into it, ready for the proposal update endpoint. */
  onChange: (changeSet: ChangeOpItem[]) => void;
  /** Applies the plan, then starts writing the chapter. */
  onWrite: () => void;
  onDiscard: () => void;
  /** Hands the plan back to the chat to change in words. */
  onAskForChanges?: () => void;
  /** Starts a new plan for the chapter that is now next, offered when the story moved past this one. */
  onPlanAgain?: () => void;
  /** Whether typed text has not reached `onChange` yet. */
  onDirtyChange?: (dirty: boolean) => void;
}

const STATUS_CHIPS: Record<ProposalResponse['status'], { intent: ChipIntent; label: string } | null> = {
  pending: null,
  applied: { intent: 'success', label: 'Plan saved' },
  discarded: { intent: 'neutral', label: 'Discarded' },
  superseded: { intent: 'neutral', label: 'Replaced by a newer plan' },
  conflicted: { intent: 'danger', label: 'Out of date' },
  reverted: { intent: 'neutral', label: 'Undone' },
};

const MODES: readonly { mode: ContentMode; title: string; description: string }[] = [
  { mode: 'standard', title: 'Standard', description: 'Your usual writer.' },
  { mode: 'unrestricted', title: 'Unrestricted', description: 'For a dark or explicit chapter. Only this chapter.' },
];

const MODE_TITLES: Record<ContentMode, string> = { standard: 'Standard', unrestricted: 'Unrestricted' };

const UNRESTRICTED_NOTE =
  'Every step for this chapter — writing, repairs, revisions, its summary and checks — uses a model that allows dark content. The chapter is then walled off: not searched, quoted or read by the chat. The next chapter sees only a short summary and what changed (where people are, injuries, who learned what), which you check and edit before moving on.';

const ADD_SCENE = 'add';

export function PlanCard(props: PlanCardProps): React.JSX.Element {
  const { proposal, loading, error, onRetry } = props;
  if (!proposal && loading) return <Spinner size="sm" label="Loading the plan" />;
  if (!proposal && error)
    return (
      <Alert intent="danger" title="Couldn’t load the plan" action={onRetry ? { label: 'Try again', onClick: onRetry } : undefined}>
        {error.message}
      </Alert>
    );
  const ref = proposal ? findPlanOp(proposal) : null;
  if (!proposal || !ref) return <EmptyState size="inline" title="No chapter plan here" description="This card holds no plan to edit. Ask the chat to plan the next chapter." />;
  return <PlanCardBody key={proposal.id} {...props} proposal={proposal} planRef={ref} />;
}

type PlanCardBodyProps = PlanCardProps & { proposal: ProposalResponse; planRef: PlanOpRef };

function PlanCardBody(props: PlanCardBodyProps): React.JSX.Element {
  const { proposal, planRef, characters, milestones = [], pages = [], kept = [], projectContentMode, chapterContentMode = null, indent } = props;
  const { saving, saveError, onRetrySave, writing, applyError, onClearApplyError, writeFailure, onRetryWrite, discarding } = props;
  const { onChange, onWrite, onDiscard, onAskForChanges, onPlanAgain, onDirtyChange } = props;
  const baseId = useId();
  const [draft, setDraftState] = useState<PlanDraft>(() => planDraftOf(planRef.op));
  const [endingOpen, setEndingOpen] = useState(() => endingProblem(draft.ending) !== null);
  const [poolingKept, setPoolingKept] = useState<string | null>(null);
  const draftRef = useRef(draft);
  const lastSent = useRef(JSON.stringify(changeSetWith(proposal.changeSet, planRef, draft)[planRef.index]));
  const dirtyRef = useRef(false);
  const pendingFocus = useRef<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  const chapter = planRef.op.chapter;
  const editable = proposal.status === 'pending';
  const names = new Map(characters.map(character => [character.entityKey, character.name]));
  const id = (name: string): string => `${baseId}-${name}`;

  const opText = (next: PlanDraft): { changeSet: ChangeOpItem[]; sent: string } => {
    const changeSet = changeSetWith(proposal.changeSet, planRef, next);
    return { changeSet, sent: JSON.stringify(changeSet[planRef.index]) };
  };

  const markDirty = (dirty: boolean): void => {
    if (dirtyRef.current === dirty) return;
    dirtyRef.current = dirty;
    onDirtyChange?.(dirty);
  };

  const setDraft = (next: PlanDraft): void => {
    draftRef.current = next;
    setDraftState(next);
    if (endingProblem(next.ending)) setEndingOpen(true);
    if (editable) markDirty(opText(next).sent !== lastSent.current);
  };

  const save = (next: PlanDraft = draftRef.current): void => {
    setDraft(next);
    if (!editable) return;
    const { changeSet, sent } = opText(next);
    markDirty(false);
    if (sent === lastSent.current) return;
    lastSent.current = sent;
    onChange(changeSet);
  };

  const saveOnLeave = useRef(save);
  useEffect(() => {
    saveOnLeave.current = save;
  });
  useEffect(() => () => saveOnLeave.current(), []);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === ADD_SCENE) addRef.current?.focus();
    else document.getElementById(`${baseId}-${target}-summary`)?.focus();
  });

  const addScene = (): void => {
    const next = withNewScene(draftRef.current, draftRef.current.pov || (characters[0]?.entityKey ?? ''));
    pendingFocus.current = next.scenes.at(-1)?.id ?? null;
    setDraft(next);
  };

  const removeScene = (sceneId: string): void => {
    pendingFocus.current = sceneAfterRemoving(draftRef.current.scenes, sceneId) ?? ADD_SCENE;
    save(withoutScene(draftRef.current, sceneId));
  };

  const warnings = planWarningsOf(proposal.warnings, draft, names);
  const others = [...warnings.giveaway, ...warnings.pov, ...warnings.density, ...warnings.other];
  const poolingKey = warnings.pooling.join('\n');
  const statusChip = STATUS_CHIPS[proposal.status];
  const emptyStart = startedEmpty(planRef.op);
  const blank = isBlankPlan(draft);
  const words = planWords(draft.scenes);
  const resolvedMode = resolvedContentMode(draft, chapterContentMode);
  const mode = resolvedMode ?? projectContentMode;
  const ending = endingProblem(draft.ending);
  const scenePovs = [...new Set(draft.scenes.map(scene => scene.pov).filter(Boolean))];
  const rationale = typeof planRef.op.rationale === 'string' ? planRef.op.rationale.trim() : '';
  const direction = typeof planRef.op.direction === 'string' ? planRef.op.direction.trim() : '';
  const applyView = applyError ? planErrorView(applyError, draft.learns) : null;
  const saveView = !applyView && saveError ? planErrorView(saveError) : null;

  return (
    <section className={styles.card} aria-label={`Chapter ${chapter} plan`} data-status={proposal.status} data-indent={indent || undefined}>
      <div className={styles.head}>
        <span className={styles.title}>Chapter {chapter} plan</span>
        {statusChip ? (
          <StatusChip intent={statusChip.intent}>{statusChip.label}</StatusChip>
        ) : (
          <StatusChip intent={emptyStart ? 'neutral' : 'warning'}>{emptyStart ? 'Your plan — nothing filled in for you' : 'Draft — edit anything'}</StatusChip>
        )}
        <span role="status" className={styles.saving}>
          {saving ? 'Saving…' : ''}
        </span>
        <span className={styles.length}>
          <label htmlFor={id('length')} className={styles.lengthLabel}>
            Length
          </label>
          <Select
            size="sm"
            triggerId={id('length')}
            value={words === null ? '' : String(Math.round(words / 100) * 100)}
            placeholder="The novel’s usual length"
            disabled={!editable || draft.scenes.every(scene => !scene.summary.trim())}
            onValueChange={value => save(withLength(draftRef.current, Number(value)))}
          >
            {lengthChoices(words).map(choice => (
              <Select.Item key={choice} value={String(choice)}>
                {lengthLabel(choice)}
              </Select.Item>
            ))}
          </Select>
        </span>
      </div>

      {applyView && (
        <div className={styles.alert}>
          <Alert
            intent="danger"
            title={applyView.title}
            action={
              applyView.replan && onPlanAgain
                ? { label: 'Plan the next chapter', onClick: onPlanAgain }
                : applyView.dropReveals && editable
                  ? {
                      label: 'Drop the reveal',
                      onClick: () => {
                        save(withoutReveals(draftRef.current, applyView.dropReveals ?? []));
                        onClearApplyError?.();
                      },
                    }
                  : undefined
            }
          >
            {applyView.message}
          </Alert>
        </div>
      )}
      {saveView && (
        <div className={styles.alert}>
          <Alert intent="danger" title={saveView.title} action={editable && onRetrySave ? { label: 'Try again', onClick: onRetrySave } : undefined}>
            {saveView.message}
          </Alert>
        </div>
      )}
      {writeFailure && (
        <div className={styles.alert}>
          <Alert intent="warning" title="Plan saved — writing didn’t start" action={writeFailure.retry && onRetryWrite ? { label: 'Try again', onClick: onRetryWrite } : undefined}>
            {writeFailure.message}
          </Alert>
        </div>
      )}

      <fieldset className={styles.body} disabled={!editable}>
        <legend className="sr-only">Chapter {chapter} plan</legend>
        {(rationale || direction) && (
          <div className={styles.recap}>
            {direction && <span>Direction: {direction}</span>}
            {rationale && <span className={styles.rationale}>{rationale}</span>}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor={id('title')}>
            Title
          </label>
          <Input id={id('title')} value={draft.title} onValueChange={title => setDraft({ ...draftRef.current, title })} onBlur={() => save()} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={id('purpose')}>
            What this chapter does
          </label>
          <Textarea id={id('purpose')} minRows={2} value={draft.purpose} onValueChange={purpose => setDraft({ ...draftRef.current, purpose })} onBlur={() => save()} />
        </div>

        <div className={styles.group}>
          <span className={styles.label} id={id('scenes')}>
            Scenes · who tells each one
          </span>
          {draft.scenes.length > 0 ? (
            <ol aria-labelledby={id('scenes')} className={styles.scenes}>
              {draft.scenes.map((scene, index) => (
                <SceneRow
                  key={scene.id}
                  scene={scene}
                  number={index + 1}
                  idBase={id(scene.id)}
                  characters={characters}
                  onEdit={patch => setDraft(withScene(draftRef.current, scene.id, patch))}
                  onSave={patch => save(patch ? withScene(draftRef.current, scene.id, patch) : draftRef.current)}
                  onRemove={() => removeScene(scene.id)}
                />
              ))}
            </ol>
          ) : (
            <span className={styles.hint}>No scenes yet. Add one for each stretch told from one point of view.</span>
          )}
          <Button ref={addRef} variant="ghost" size="sm" className={styles.alignStart} onClick={addScene}>
            Add a scene
          </Button>
          <span className={styles.hint}>One long scene is fine when it earns its length. A scene is saved once it says what happens.</span>
        </div>

        {warnings.pooling.length > 0 && (
          <div role="note" className={styles.pooling}>
            <span className={styles.poolingTitle}>Points of view know different things.</span>
            {warnings.pooling.map((warning, index) => (
              <span key={index}>{warning}</span>
            ))}
            {poolingKept === poolingKey ? (
              <span className={styles.hint}>Kept. After writing, the check reads the other scenes for anything only one point of view knows.</span>
            ) : (
              <span className={styles.poolingActions}>
                {draft.pov && scenePovs.length > 1 && (
                  <Button variant="secondary" size="sm" onClick={() => save(everySceneFrom(draftRef.current, draftRef.current.pov))}>
                    Tell every scene from {names.get(draft.pov) ?? draft.pov}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setPoolingKept(poolingKey)}>
                  Keep it — check the scenes for it
                </Button>
              </span>
            )}
          </div>
        )}

        {others.length > 0 && (
          <ul className={styles.diagnostics} aria-label="Other things to look at">
            {others.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor={id('pov')}>
            Told mainly by
          </label>
          <Select
            triggerId={id('pov')}
            value={draft.pov}
            placeholder="Pick the chapter’s point of view"
            disabled={!editable}
            onValueChange={pov => save({ ...draftRef.current, pov })}
          >
            {characters.map(character => (
              <Select.Item key={character.entityKey} value={character.entityKey}>
                {character.name}
              </Select.Item>
            ))}
          </Select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={id('ends')}>
            Ends on
          </label>
          <Input
            id={id('ends')}
            aria-describedby={ending ? id('ending-problem') : undefined}
            value={draft.ending.handoffState}
            onValueChange={handoffState => setDraft({ ...draftRef.current, ending: { ...draftRef.current.ending, handoffState } })}
            onBlur={() => save()}
          />
          {ending && (
            <span id={id('ending-problem')} className={styles.warnText}>
              {ending}
            </span>
          )}
          <details className={styles.more} open={endingOpen} onToggle={event => setEndingOpen(event.currentTarget.open)}>
            <summary className={styles.moreSummary}>More about the ending</summary>
            <div className={styles.moreBody}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={id('hook')}>
                  Kind of ending
                </label>
                <Select
                  triggerId={id('hook')}
                  value={draft.ending.hookType}
                  placeholder="Pick one"
                  disabled={!editable}
                  onValueChange={value => save({ ...draftRef.current, ending: { ...draftRef.current.ending, hookType: value as PlanDraft['ending']['hookType'] } })}
                >
                  {HOOK_TYPES.map(hook => (
                    <Select.Item key={hook} value={hook}>
                      {HOOK_TYPE_LABELS[hook]}
                    </Select.Item>
                  ))}
                </Select>
              </div>
              <TextField
                id={id('beat')}
                label="What the reader feels on the last line"
                value={draft.ending.emotionalBeat}
                onEdit={emotionalBeat => setDraft({ ...draftRef.current, ending: { ...draftRef.current.ending, emotionalBeat } })}
                onSave={() => save()}
              />
              <TextField
                id={id('question')}
                label="The question it leaves open"
                value={draft.ending.openQuestion}
                onEdit={openQuestion => setDraft({ ...draftRef.current, ending: { ...draftRef.current.ending, openQuestion } })}
                onSave={() => save()}
              />
            </div>
          </details>
        </div>

        <div className={styles.group}>
          <span className={styles.label}>This chapter reaches</span>
          <div className={styles.chips}>
            {draft.claimedMilestones.map(key => (
              <Tag
                key={key}
                className={styles.chip}
                onRemove={editable ? () => save({ ...draftRef.current, claimedMilestones: draftRef.current.claimedMilestones.filter(claim => claim !== key) }) : undefined}
              >
                {`Milestone: ${milestoneLabel(key, milestones)}`}
              </Tag>
            ))}
            <AddMenu
              label="Add a milestone"
              disabled={!editable}
              options={claimableMilestones(milestones, chapter, draft.claimedMilestones).map(milestone => ({ value: milestone.milestoneKey, label: milestone.label }))}
              empty="No open milestone to claim"
              onPick={key => save({ ...draftRef.current, claimedMilestones: [...draftRef.current.claimedMilestones, key] })}
            />
          </div>
          <span className={styles.hint}>
            {draft.claimedMilestones.length > 0
              ? `Provisional until you finalize chapter ${chapter} — rewrite the chapter without it and it goes back to open.`
              : 'No milestone claimed — nothing unlocks in this chapter.'}
          </span>
        </div>

        <div className={styles.group}>
          <span className={styles.label} id={id('mode')}>
            Content for this chapter · your choice
          </span>
          <ModeRadios
            labelledBy={id('mode')}
            value={mode}
            disabled={!editable}
            onPick={picked => draftRef.current.contentMode !== picked && save({ ...draftRef.current, contentMode: picked })}
          />
          {resolvedMode === null ? (
            <span className={styles.hint}>Following the novel’s setting until you pick one for this chapter.</span>
          ) : (
            <Button variant="ghost" size="sm" className={styles.alignStart} disabled={!editable} onClick={() => save({ ...draftRef.current, contentMode: null })}>
              Follow the novel’s setting ({MODE_TITLES[projectContentMode]})
            </Button>
          )}
          {mode === 'unrestricted' && <span className={styles.modeNote}>{UNRESTRICTED_NOTE}</span>}
        </div>

        <section aria-labelledby={id('writer')} className={styles.writer}>
          <div className={styles.writerHead}>
            <span className={styles.label} id={id('writer')}>
              What the writer gets
            </span>
            <span className={styles.hint}>Pages picked from your Story Bible</span>
          </div>
          <span className={styles.hint}>{ALWAYS_SENT}</span>
          <div className={styles.chips}>
            {draft.contextRefs.map(pageRef => (
              <Tag
                key={pageRef}
                className={styles.chip}
                onRemove={editable ? () => save({ ...draftRef.current, contextRefs: draftRef.current.contextRefs.filter(chosen => chosen !== pageRef) }) : undefined}
              >
                {refLabel(pageRef, pages, names)}
              </Tag>
            ))}
            <AddMenu
              label="Add from Story Bible"
              disabled={!editable}
              options={addablePages(pages, draft.contextRefs).map(page => ({ value: page.ref, label: page.label }))}
              empty="Every page is already in"
              onPick={pageRef => save({ ...draftRef.current, contextRefs: [...draftRef.current.contextRefs, pageRef] })}
            />
          </div>
          {draft.contextRefs.length === 0 && <span className={styles.hint}>No pages picked — the writer gets only what is always sent.</span>}
          <div className={styles.kept}>
            <b className={styles.keptTitle}>Kept from the writer:</b> {kept.length > 0 ? `${kept.join(', ')}. ` : ''}You can’t add these here; a locked secret goes in only once its
            conditions are met. The Writer’s view shows exactly what was sent.
          </div>
        </section>
      </fieldset>

      {editable && (
        <div className={styles.actions}>
          <Button
            variant="primary"
            size="sm"
            loading={writing}
            disabled={blank || discarding}
            onClick={() => {
              save();
              onWrite();
            }}
          >
            Write chapter {chapter}
          </Button>
          {onAskForChanges && (
            <Button
              variant="secondary"
              size="sm"
              disabled={writing || discarding}
              onClick={() => {
                save();
                onAskForChanges();
              }}
            >
              Ask for changes
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            loading={discarding}
            disabled={writing}
            onClick={() => {
              save();
              onDiscard();
            }}
          >
            Discard
          </Button>
          <span className={styles.actionHint}>{blank ? 'Give it a title and at least one scene first' : 'Usually a few minutes — you can leave'}</span>
        </div>
      )}
    </section>
  );
}

interface ModeRadiosProps {
  labelledBy: string;
  value: ContentMode;
  disabled: boolean;
  onPick: (mode: ContentMode) => void;
}

function ModeRadios({ labelledBy, value, disabled, onPick }: ModeRadiosProps): React.JSX.Element {
  const buttons = useRef(new Map<ContentMode, HTMLButtonElement>());

  const move = (event: KeyboardEvent, index: number): void => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const target = MODES[(index + step + MODES.length) % MODES.length]?.mode ?? value;
    onPick(target);
    buttons.current.get(target)?.focus();
  };

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className={styles.modes}>
      {MODES.map((option, index) => {
        const checked = option.mode === value;
        return (
          <button
            key={option.mode}
            ref={el => void (el ? buttons.current.set(option.mode, el) : buttons.current.delete(option.mode))}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            className={styles.mode}
            onClick={() => onPick(option.mode)}
            onKeyDown={event => move(event, index)}
          >
            <span className={styles.modeTitle}>{option.title}</span>
            <span className={styles.hint}>{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}

interface SceneRowProps {
  scene: PlanScene;
  number: number;
  idBase: string;
  characters: readonly PlanCharacter[];
  onEdit: (patch: Partial<Omit<PlanScene, 'id'>>) => void;
  /** Saves the card, with this last change folded in when one is given. */
  onSave: (patch?: Partial<Omit<PlanScene, 'id'>>) => void;
  onRemove: () => void;
}

function SceneRow({ scene, number, idBase, characters, onEdit, onSave, onRemove }: SceneRowProps): React.JSX.Element {
  const details = [scene.goal, scene.obstacle, scene.turn, scene.beats].filter(part => part.trim()).length;
  return (
    <li className={styles.sceneBlock}>
      <div className={styles.scene}>
        <span className={styles.sceneNumber} aria-hidden="true">
          {number}
        </span>
        <Select
          className={styles.scenePov}
          triggerId={`${idBase}-pov`}
          aria-label={`Scene ${number} point of view`}
          value={scene.pov}
          placeholder="Who tells it"
          onValueChange={pov => onSave({ pov })}
        >
          {characters.map(character => (
            <Select.Item key={character.entityKey} value={character.entityKey}>
              {character.name}
            </Select.Item>
          ))}
        </Select>
        <Input
          id={`${idBase}-summary`}
          className={styles.sceneSummary}
          aria-label={`Scene ${number}`}
          placeholder={`What happens in scene ${number}`}
          value={scene.summary}
          onValueChange={summary => onEdit({ summary })}
          onBlur={() => onSave()}
        />
        <IconButton icon={<CloseIcon size={16} />} aria-label={`Remove scene ${number}`} size="md" onClick={onRemove} />
      </div>
      <details className={styles.more}>
        <summary className={styles.moreSummary}>Goal, obstacle and beats{details > 0 ? ` · ${details} filled` : ''}</summary>
        <div className={styles.moreBody}>
          <TextField id={`${idBase}-goal`} label="What they want" value={scene.goal} onEdit={goal => onEdit({ goal })} onSave={onSave} />
          <TextField id={`${idBase}-obstacle`} label="What stands in the way" value={scene.obstacle} onEdit={obstacle => onEdit({ obstacle })} onSave={onSave} />
          <TextField id={`${idBase}-turn`} label="How it stands when the scene ends" value={scene.turn} onEdit={turn => onEdit({ turn })} onSave={onSave} />
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${idBase}-beats`}>
              Beats · one per line
            </label>
            <Textarea id={`${idBase}-beats`} minRows={2} value={scene.beats} onValueChange={beats => onEdit({ beats })} onBlur={() => onSave()} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${idBase}-words`}>
              Words for this scene
            </label>
            <Input
              id={`${idBase}-words`}
              type="number"
              inputMode="numeric"
              min={1}
              value={scene.estimatedWords === undefined ? '' : String(scene.estimatedWords)}
              onValueChange={value => {
                const words = Number.parseInt(value, 10);
                onEdit({ estimatedWords: Number.isInteger(words) && words > 0 ? words : undefined });
              }}
              onBlur={() => onSave()}
            />
          </div>
        </div>
      </details>
    </li>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onEdit: (value: string) => void;
  onSave: () => void;
}

function TextField({ id, label, value, onEdit, onSave }: TextFieldProps): React.JSX.Element {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <Input id={id} value={value} onValueChange={onEdit} onBlur={() => onSave()} />
    </div>
  );
}

interface AddMenuProps {
  label: string;
  options: readonly { value: string; label: string }[];
  empty: string;
  disabled: boolean;
  onPick: (value: string) => void;
}

function AddMenu({ label, options, empty, disabled, onPick }: AddMenuProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          <PlusIcon size={14} />
          {label}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start">
        {options.length === 0 ? (
          <DropdownMenu.Item disabled>{empty}</DropdownMenu.Item>
        ) : (
          options.map(option => (
            <DropdownMenu.Item key={option.value} onSelect={() => onPick(option.value)}>
              {option.label}
            </DropdownMenu.Item>
          ))
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
