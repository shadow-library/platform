import { type KeyboardEvent, type Ref, type RefObject, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, CheckIcon, Dialog, IconButton, Kbd, Progress, SegmentedControl, Skeleton } from '@shadow-library/ui';

import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from '@/components/icons';
import { Markdown } from '@/components/nf/Markdown';
import { type ApplyProposalResponse, type OrganiseReceipt, type ProposalResponse, useProposalCurrentQuery, useProposalQuery } from '@/lib/apis';

import { commitBarView, REJECTION_SCOPE_LABEL, type RejectionScope, rejectionScopeNote, type SuggestionDecision } from './chat-view';
import { cardChanges, type CardState, groupChanges, plural } from './progress-panel-view';
import {
  clearedDecisions,
  doneView,
  type DoneView,
  filterShows,
  focusAfterAnswer,
  type ItemAnswer,
  itemAnswer,
  itemDecisions,
  movedFocus,
  openingFocus,
  progressLabel,
  type ReviewFocus,
  reviewKeyAction,
  reviewSource,
  type VersionKey,
  withDecisions,
} from './review-answers';
import { type DiffSegment, filterCounts, type ReviewContent, type ReviewFilter, type ReviewItem, reviewItems } from './review-dialog-view';
import styles from './ReviewDialog.module.css';
import { useSuggestionAnswering } from './use-suggestion-answering';

type Tone = 'open' | 'in' | 'out';
type FocusTo = 'title' | 'scope' | 'row';
type KeyHandler = (event: KeyboardEvent<HTMLDivElement>) => void;

const TONE: Record<CardState, Tone> = { open: 'open', add: 'in', added: 'in', undone: 'out', decline: 'out', declined: 'out', replaced: 'out' };
const SPOKEN: Record<CardState, string> = {
  open: ', waiting',
  add: ', will be added',
  added: ', added',
  undone: ', added, then undone',
  decline: ', not added',
  declined: ', not added',
  replaced: ', replaced',
};
const STATUS_TEXT: Record<CardState, string> = {
  open: '',
  add: 'Will be added',
  added: 'Added',
  undone: 'Added, then undone',
  decline: 'Not added',
  declined: 'Not added',
  replaced: 'Replaced by a newer card',
};
const FILTERS: readonly ReviewFilter[] = ['all', 'waiting', 'ideas'];
const FILTER_LABEL: Record<ReviewFilter, string> = { all: 'All', waiting: 'Waiting', ideas: 'Forge’s ideas' };
const FILTER_EMPTY: Record<ReviewFilter, string> = { all: 'No changes to review.', waiting: 'Nothing waiting.', ideas: 'No ideas from Forge here.' };

const isFilter = (value: string): value is ReviewFilter => (FILTERS as readonly string[]).includes(value);

function isTyping(target: EventTarget): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'));
}

function Glyph({ status }: { status: CardState }): React.JSX.Element {
  const tone = TONE[status];
  return (
    <span className={styles.glyph} data-tone={tone} aria-hidden="true">
      {tone === 'in' && <CheckIcon size={14} />}
      {tone === 'out' && <CloseIcon size={14} />}
    </span>
  );
}

export interface ReviewListProps {
  items: readonly ReviewItem[];
  answers: ReadonlyMap<string, ItemAnswer>;
  currentKey?: string;
  filter: ReviewFilter;
  shown: (item: ReviewItem) => boolean;
  onFilter: (filter: ReviewFilter) => void;
  onSelect: (key: string) => void;
}

export function ReviewList({ items, answers, currentKey, filter, shown, onFilter, onSelect }: ReviewListProps): React.JSX.Element {
  const baseId = useId();
  const status = (item: ReviewItem): CardState => answers.get(item.key)?.status ?? 'open';
  const counts = filterCounts(items, item => status(item) !== 'open');
  const groups = groupChanges(items).flatMap(group => {
    const visible = group.items.filter(shown);
    return visible.length > 0 ? [{ ...group, visible, done: group.items.filter(item => status(item) !== 'open').length }] : [];
  });
  return (
    <nav className={styles.rail} aria-label="All changes" data-review-rail="">
      <SegmentedControl size="sm" fullWidth className={styles.filter} value={filter} onValueChange={value => isFilter(value) && onFilter(value)} aria-label="Show">
        {FILTERS.map(value => (
          <SegmentedControl.Item key={value} value={value} className={styles.filterItem}>
            {FILTER_LABEL[value]} {counts[value]}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl>
      {groups.length === 0 && <p className={styles.railEmpty}>{FILTER_EMPTY[filter]}</p>}
      {groups.map(group => (
        <div key={group.key} className={styles.group}>
          <div id={`${baseId}-${group.key}`} className={styles.groupHead}>
            {group.label}
            <span className={styles.groupCount}>
              {group.done}/{group.items.length}
              <span className={styles.srOnly}> answered</span>
            </span>
          </div>
          <ul className={styles.rows} aria-labelledby={`${baseId}-${group.key}`}>
            {group.visible.map(item => {
              const itemStatus = status(item);
              const hint = item.versions ? '2 versions' : item.idea ? 'idea' : undefined;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    className={styles.row}
                    data-tone={TONE[itemStatus]}
                    aria-current={item.key === currentKey ? 'true' : undefined}
                    onClick={() => onSelect(item.key)}
                  >
                    <Glyph status={itemStatus} />
                    <span className={styles.rowLabel}>
                      {item.title}
                      <span className={styles.srOnly}>{SPOKEN[itemStatus]}</span>
                    </span>
                    {hint && <span className={styles.hint}>{hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Segment({ segment }: { segment: DiffSegment }): React.JSX.Element {
  if (segment.kind === 'added') return <ins>{segment.text}</ins>;
  if (segment.kind === 'removed') return <del>{segment.text}</del>;
  return <>{segment.text}</>;
}

export function ReviewContentView({ content }: { content: ReviewContent }): React.JSX.Element {
  if (content.kind === 'markdown') return <Markdown content={content.markdown} className={styles.body} />;
  if (content.kind === 'blocks') {
    return (
      <div className={styles.body}>
        {content.blocks.map((block, index) =>
          block.added ? (
            <div key={index} className={styles.added}>
              <span className={styles.addedLabel}>Forge’s addition</span>
              <Markdown content={block.markdown} />
            </div>
          ) : (
            <Markdown key={index} content={block.markdown} className={styles.block} />
          ),
        )}
      </div>
    );
  }
  if (content.kind === 'fields') {
    return (
      <dl className={styles.fields}>
        {content.fields.map(field => (
          <div key={field.label}>
            <dt className={styles.fieldLabel}>{field.label}</dt>
            <dd className={styles.fieldValue} data-emphasis={field.emphasis ? '' : undefined}>
              {field.emphasis ? field.value : <Markdown content={field.value} />}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <>
      <div className={styles.legend}>
        <span>
          <del>removed</del>
        </span>
        <span>
          <ins>added</ins>
        </span>
        <span>Compared with your Story Bible now</span>
      </div>
      <dl className={styles.fields}>
        {content.fields.map(field => (
          <div key={field.label}>
            <dt className={styles.fieldLabel}>{field.label}</dt>
            <dd className={styles.diff}>
              {field.segments.map((segment, index) => (
                <Segment key={index} segment={segment} />
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function ReaderSkeleton(): React.JSX.Element {
  return (
    <div className={styles.loading} role="status">
      <span className={styles.srOnly}>Comparing with your Story Bible…</span>
      <Skeleton width="92%" />
      <Skeleton width="86%" />
      <Skeleton width="64%" />
    </div>
  );
}

export interface ReviewReaderProps {
  item: ReviewItem;
  position: number;
  total: number;
  version: VersionKey;
  versionLocked: boolean;
  onVersion: (version: VersionKey) => void;
  wordsLabel: string;
  compareFailed?: boolean;
  titleRef?: Ref<HTMLHeadingElement>;
}

export function ReviewReader({ item, position, total, version, versionLocked, onVersion, wordsLabel, compareFailed = false, titleRef }: ReviewReaderProps): React.JSX.Element {
  const [wordsOpen, setWordsOpen] = useState(false);
  const titleId = useId();
  const wordsId = useId();
  const forge = item.versions?.find(entry => entry.key === 'forge');
  const content = item.versions?.find(entry => entry.key === version)?.content ?? item.content;
  return (
    <article className={styles.doc} aria-labelledby={titleId}>
      <div className={styles.eyebrow}>
        <span>
          {item.groupLabel} · {item.kindLabel}
        </span>
        <span className={styles.position}>
          {position} of {total}
        </span>
      </div>
      <h3 id={titleId} ref={titleRef} tabIndex={-1} className={styles.title}>
        {item.title}
      </h3>
      {(item.cite || item.tag || item.yourWords) && (
        <div className={styles.cite}>
          {item.cite && <span>{item.cite}</span>}
          {item.tag && <span className={styles.tag}>{item.tag}</span>}
          {item.yourWords && (
            <button type="button" className={styles.toggle} aria-expanded={wordsOpen} aria-controls={wordsId} onClick={() => setWordsOpen(open => !open)}>
              {wordsOpen ? 'Hide what you wrote' : 'Show what you wrote'}
            </button>
          )}
        </div>
      )}
      {item.note && <p className={styles.note}>{item.note}</p>}
      {item.yourWords && (
        <div id={wordsId} className={styles.yourWords} hidden={!wordsOpen}>
          <span className={styles.wellLabel}>{wordsLabel}</span>
          {item.yourWords}
        </div>
      )}
      {forge && (
        <div className={styles.versions}>
          <p className={styles.versionsText}>Forge offered this page two ways. Pick the one to add.</p>
          <SegmentedControl
            size="sm"
            value={version}
            onValueChange={value => onVersion(value === 'forge' ? 'forge' : 'notes')}
            disabled={versionLocked}
            aria-label={`Version of “${item.title}”`}
          >
            <SegmentedControl.Item value="notes">Only my notes</SegmentedControl.Item>
            <SegmentedControl.Item value="forge">With Forge’s additions · {plural(forge.addedBlocks, 'addition', 'additions')}</SegmentedControl.Item>
          </SegmentedControl>
        </div>
      )}
      {item.awaitsCurrent ? (
        <ReaderSkeleton />
      ) : (
        <>
          {compareFailed && <p className={styles.unchanged}>Couldn’t compare with your Story Bible</p>}
          {item.unchanged && <p className={styles.unchanged}>No change from your Story Bible now</p>}
          <ReviewContentView content={content} />
        </>
      )}
    </article>
  );
}

export interface ReviewFooterProps {
  item: ReviewItem;
  answer: ItemAnswer;
  pending: boolean;
  committing: boolean;
  remembering: boolean;
  next?: string;
  onMove: (step: 1 | -1) => void;
  onDecide: (decision: SuggestionDecision) => void;
  onClear: () => void;
  onScope: (scope: RejectionScope) => void;
}

export function ReviewFooter({ item, answer, pending, committing, remembering, next, onMove, onDecide, onClear, onScope }: ReviewFooterProps): React.JSX.Element {
  const busy = committing || remembering;
  const { status, askScope, scope } = answer;
  const tone = TONE[status];
  const change = pending && tone !== 'open' && (
    <Button size="sm" variant="ghost" disabled={committing} onClick={onClear}>
      Change answer
    </Button>
  );
  const statusText = tone === 'out' && scope ? `Not added · won’t be suggested again ${rejectionScopeNote(scope)}` : STATUS_TEXT[status];
  return (
    <div className={styles.decide}>
      <span className={styles.nav}>
        <IconButton variant="ghost" icon={<ArrowUpIcon size={16} />} aria-label="Previous change" aria-keyshortcuts="k" onClick={() => onMove(-1)} />
        <IconButton variant="ghost" icon={<ArrowDownIcon size={16} />} aria-label="Next change" aria-keyshortcuts="j" onClick={() => onMove(1)} />
        {tone === 'open' && next && <span className={styles.nextNote}>Next: {next}</span>}
      </span>
      <span className={styles.actions}>
        {tone === 'open' && pending && (
          <>
            <Button
              variant="secondary"
              prefix={<CloseIcon size={14} />}
              suffix={<Kbd aria-hidden="true">D</Kbd>}
              aria-keyshortcuts="d"
              disabled={busy}
              onClick={() => onDecide('decline')}
            >
              Don’t add
            </Button>
            <Button
              variant="primary"
              prefix={<CheckIcon size={14} />}
              suffix={<Kbd aria-hidden="true">A</Kbd>}
              aria-keyshortcuts="a"
              disabled={busy}
              onClick={() => onDecide('add')}
            >
              Add
            </Button>
          </>
        )}
        {tone === 'out' && askScope.length > 0 ? (
          <>
            <span className={styles.ask} tabIndex={-1} data-scope-ask="">
              Not added. Suggest it again?
            </span>
            {change}
            <span className={styles.scopes} role="group" aria-label={`When to suggest “${item.title}” again`} data-scopes="">
              {askScope.map((option, index) => (
                <Button
                  key={option}
                  size="sm"
                  variant="secondary"
                  suffix={<Kbd aria-hidden="true">{String(index + 1)}</Kbd>}
                  aria-keyshortcuts={String(index + 1)}
                  disabled={busy}
                  onClick={() => onScope(option)}
                >
                  {REJECTION_SCOPE_LABEL[option]}
                </Button>
              ))}
            </span>
          </>
        ) : (
          tone !== 'open' && (
            <>
              {change}
              <span className={styles.status} data-tone={tone}>
                {tone === 'in' ? <CheckIcon size={14} /> : <CloseIcon size={14} />}
                {statusText}
              </span>
            </>
          )
        )}
      </span>
    </div>
  );
}

export interface ReviewDoneProps {
  view: DoneView;
  headingRef?: Ref<HTMLHeadingElement>;
  committing: boolean;
  onCommit: (force: boolean) => void;
  onClose: () => void;
}

export function ReviewDone({ view, headingRef, committing, onCommit, onClose }: ReviewDoneProps): React.JSX.Element {
  const { commit } = view;
  return (
    <div className={styles.done}>
      <span className={styles.doneMark} aria-hidden="true">
        <CheckIcon size={20} />
      </span>
      <h3 ref={headingRef} tabIndex={-1} className={styles.doneTitle}>
        {view.title}
      </h3>
      <p className={styles.doneDetail}>{view.detail}</p>
      <div className={styles.doneActions}>
        {commit && (
          <Button variant="secondary" disabled={committing} onClick={() => onCommit(commit.force)}>
            {commit.label}
          </Button>
        )}
        <Button variant="primary" onClick={onClose}>
          Back to chat
        </Button>
      </div>
    </div>
  );
}

interface ReviewHeaderProps {
  description?: string;
  progress?: { answered: number; total: number; label: string };
  left?: number;
  onAddAll?: () => void;
}

function ReviewHeader({ description, progress, left = 0, onAddAll }: ReviewHeaderProps): React.JSX.Element {
  return (
    <div className={styles.head}>
      <Dialog.Header className={styles.heading} title="Review Story Bible changes" description={description} showClose={false} />
      <div className={styles.tools}>
        {progress && (
          <div className={styles.progress}>
            <Progress className={styles.meter} size="md" value={progress.answered} max={Math.max(progress.total, 1)} aria-label="Answered" />
            <span>{progress.label}</span>
          </div>
        )}
        {onAddAll && left > 0 && (
          <Button size="sm" variant="primary" onClick={onAddAll}>
            Add the {left} left
          </Button>
        )}
      </div>
      <Dialog.Close asChild>
        <IconButton variant="ghost" size="sm" aria-label="Close. Your answers are kept." icon={<CloseIcon />} />
      </Dialog.Close>
    </div>
  );
}

interface ReviewSessionProps {
  novelId: string;
  proposal: ProposalResponse;
  receipt?: OrganiseReceipt;
  notes?: string;
  onApplied: (result: ApplyProposalResponse) => void;
  onClose: () => void;
  keysRef: RefObject<KeyHandler | undefined>;
}

function ReviewSession({ novelId, proposal, receipt, notes, onApplied, onClose, keysRef }: ReviewSessionProps): React.JSX.Element {
  const { answers, decideEach, commit, remember, remembering } = useSuggestionAnswering(novelId, proposal, { onApplied });
  const pending = proposal.status === 'pending';
  const currentQuery = useProposalCurrentQuery(novelId, proposal.id, pending);
  const currentOps = currentQuery.data?.ops;
  const comparing = pending && currentQuery.isPending;
  const compareFailed = pending && currentQuery.isError;
  const { items, uncompared } = useMemo(() => {
    const built = reviewItems({ proposal, receipt, current: currentOps, notes });
    const waiting = new Set(built.filter(item => item.awaitsCurrent).map(item => item.key));
    return {
      items: comparing ? built : built.map(item => (item.awaitsCurrent ? { ...item, awaitsCurrent: false } : item)),
      uncompared: compareFailed ? waiting : new Set<string>(),
    };
  }, [proposal, receipt, currentOps, notes, comparing, compareFailed]);
  const rows = useMemo(
    () => new Map(cardChanges(proposal, answers.decisions, answers.scopes, receipt?.card).map(row => [row.index, row])),
    [proposal, answers.decisions, answers.scopes, receipt],
  );
  const itemAnswers = useMemo(() => new Map(items.map(item => [item.key, itemAnswer(item, rows)])), [items, rows]);
  const answerOf = (item: ReviewItem): ItemAnswer => itemAnswers.get(item.key) ?? { status: 'open', askScope: [] };

  const [focus, setFocus] = useState<ReviewFocus>(() => openingFocus(items, answers.decisions, pending));
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [versions, setVersions] = useState<ReadonlyMap<string, VersionKey>>(new Map());
  const [focusTo, setFocusTo] = useState<{ to: FocusTo }>({ to: 'title' });
  const [seenStatus, setSeenStatus] = useState(proposal.status);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const current = focus.kind === 'item' ? (items.find(item => item.key === focus.key) ?? items[0]) : undefined;
  if (seenStatus !== proposal.status) {
    setSeenStatus(proposal.status);
    if (!pending && current && answerOf(current).askScope.length === 0) {
      setFocus({ kind: 'done' });
      setFocusTo({ to: 'title' });
    }
  }

  useEffect(() => {
    const root = rootRef.current;
    const row = root?.querySelector<HTMLElement>('[data-review-rail] [aria-current="true"]');
    row?.scrollIntoView({ block: 'nearest' });
    const target = (focusTo.to === 'row' ? row : focusTo.to === 'scope' ? root?.querySelector<HTMLElement>('[data-scope-ask]') : undefined) || titleRef.current || doneRef.current;
    target?.focus({ preventScroll: focusTo.to === 'row' });
  }, [focusTo]);

  const busy = answers.committing || remembering;
  const versionOf = (item: ReviewItem): VersionKey => answerOf(item).kept ?? versions.get(item.key) ?? 'notes';
  const isOpen = (item: ReviewItem): boolean => answerOf(item).status === 'open';
  const shown = (item: ReviewItem): boolean => filterShows(filter, item, isOpen(item));
  const go = (next: ReviewFocus, to: FocusTo = 'title'): void => {
    setFocus(next);
    setFocusTo({ to });
  };

  const decideItem = (item: ReviewItem, decision: SuggestionDecision): void => {
    const entries = itemDecisions(item, decision, versionOf(item));
    decideEach(entries);
    if (decision === 'decline') return setFocusTo({ to: 'scope' });
    go(focusAfterAnswer(items, item.key, withDecisions(answers.decisions, entries), shown));
  };

  const scopeItem = (item: ReviewItem, scope: RejectionScope): void => {
    const index = answerOf(item).scopeIndex;
    if (index === undefined) return;
    remember(index, scope);
    go(pending ? focusAfterAnswer(items, item.key, answers.decisions, shown) : { kind: 'done' });
  };

  const move = (step: 1 | -1, inRail: boolean): void =>
    go(movedFocus(items, current ? { kind: 'item', key: current.key } : { kind: 'done' }, step, shown), inRail ? 'row' : 'title');

  const addLeft = (): void => {
    decideEach(
      items.filter(isOpen).flatMap(item => itemDecisions(item, 'add', versionOf(item))),
      true,
    );
    go({ kind: 'done' });
  };

  const onKeyDown: KeyHandler = event => {
    if (event.defaultPrevented) return;
    const action = reviewKeyAction(event, isTyping(event.target));
    if (!action) return;
    if (action.kind === 'move') {
      event.preventDefault();
      return move(action.step, event.target instanceof Element && event.target.closest('[data-review-rail]') !== null);
    }
    if (!current || busy) return;
    const answer = answerOf(current);
    if (action.kind === 'scope') {
      const scope = answer.askScope[action.position];
      if (!scope) return;
      event.preventDefault();
      return scopeItem(current, scope);
    }
    if (!pending || answer.status !== 'open') return;
    event.preventDefault();
    decideItem(current, action.kind);
  };

  useLayoutEffect(() => {
    keysRef.current = onKeyDown;
  });
  useEffect(
    () => () => {
      keysRef.current = undefined;
    },
    [keysRef],
  );

  const answered = items.filter(item => !isOpen(item)).length;
  const added = items.filter(item => TONE[answerOf(item).status] === 'in').length;
  const left = items.length - answered;
  const position = current ? items.indexOf(current) + 1 : 0;
  const next = current && focusAfterAnswer(items, current.key, answers.decisions, shown);
  const nextTitle = next?.kind === 'item' && next.key !== current?.key ? items.find(item => item.key === next.key)?.title : undefined;
  const bar = commitBarView({ total: proposal.changeSet.length, decisions: answers.decisions, committing: answers.committing, error: answers.error });

  return (
    <div ref={rootRef} className={styles.session}>
      <ReviewHeader
        description={reviewSource(proposal.kind, items.length)}
        progress={{ answered, total: items.length, label: progressLabel(proposal.status, answered, items.length, added) }}
        left={pending && !answers.committing ? left : 0}
        onAddAll={addLeft}
      />
      <div className={styles.main}>
        <ReviewList
          items={items}
          answers={itemAnswers}
          currentKey={current?.key}
          filter={filter}
          shown={shown}
          onFilter={setFilter}
          onSelect={key => setFocus({ kind: 'item', key })}
        />
        <div className={styles.reader}>
          <div key={current?.key ?? 'done'} className={`nf-scroll ${styles.scroll}`}>
            {current ? (
              <ReviewReader
                item={current}
                position={position}
                total={items.length}
                version={versionOf(current)}
                versionLocked={!pending || answers.committing || !isOpen(current)}
                onVersion={version => setVersions(known => new Map(known).set(current.key, version))}
                wordsLabel={proposal.kind === 'organise' ? 'Your notes' : 'Your message'}
                compareFailed={uncompared.has(current.key)}
                titleRef={titleRef}
              />
            ) : (
              <ReviewDone
                view={doneView({ status: proposal.status, total: items.length, added, bar })}
                headingRef={doneRef}
                committing={answers.committing}
                onCommit={commit}
                onClose={onClose}
              />
            )}
          </div>
          {current && (
            <ReviewFooter
              item={current}
              answer={answerOf(current)}
              pending={pending}
              committing={answers.committing}
              remembering={remembering}
              next={nextTitle}
              onMove={step => move(step, false)}
              onDecide={decision => decideItem(current, decision)}
              onClear={() => {
                decideEach(clearedDecisions(current));
                setFocusTo({ to: 'title' });
              }}
              onScope={scope => scopeItem(current, scope)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface ReviewLoaderProps extends Omit<ReviewSessionProps, 'proposal'> {
  proposalId: string;
}

function ReviewLoader({ proposalId, ...session }: ReviewLoaderProps): React.JSX.Element {
  const query = useProposalQuery(session.novelId, proposalId);
  if (query.data) return <ReviewSession proposal={query.data} {...session} />;
  return (
    <div className={styles.session}>
      <ReviewHeader description={query.error ? undefined : 'Loading…'} />
      <div className={styles.state}>
        {query.error ? (
          <Alert intent="danger" title="Couldn’t load these changes" action={{ label: 'Try again', onClick: () => void query.refetch() }}>
            {query.error.message}
          </Alert>
        ) : (
          <ReaderSkeleton />
        )}
      </div>
    </div>
  );
}

export interface ReviewTarget {
  proposalId: string;
  receipt?: OrganiseReceipt;
}

export interface ReviewDialogProps {
  novelId: string;
  target?: ReviewTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes?: string;
  onApplied: (result: ApplyProposalResponse) => void;
  /** Radix hands focus back only to a `Dialog.Trigger`; opened from elsewhere, the caller puts it back. */
  onCloseFocus: () => void;
}

export function ReviewDialog({ novelId, target, open, onOpenChange, notes, onApplied, onCloseFocus }: ReviewDialogProps): React.JSX.Element {
  const keysRef = useRef<KeyHandler>(undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        size="xl"
        className={styles.dialog}
        onKeyDown={event => keysRef.current?.(event)}
        onCloseAutoFocus={event => {
          event.preventDefault();
          onCloseFocus();
        }}
      >
        {target && (
          <ReviewLoader
            key={target.proposalId}
            novelId={novelId}
            proposalId={target.proposalId}
            receipt={target.receipt}
            notes={notes}
            onApplied={onApplied}
            onClose={() => onOpenChange(false)}
            keysRef={keysRef}
          />
        )}
      </Dialog.Content>
    </Dialog>
  );
}
