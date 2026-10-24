import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, EmptyState, FormField, Input, Spinner, useConfirm } from '@shadow-library/ui';

import { type CatalogChange, type CatalogDocument, describeChanges, issueSentence, useActiveCatalog, useDraft } from '@/features/catalog';
import { Mono, type Notice, PageHeader, PermissionGate, SectionHeader, useMinuteClock } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import {
  type Capabilities,
  type CatalogIssueResponse,
  catalogKeys,
  diffQueryOptions,
  type DraftResponse,
  draftValidationQueryOptions,
  isCatalogConflict,
  meQuery,
  saveDraft,
  useCapabilities,
  useDiscardDraftMutation,
  usePublishDraftMutation,
  type ValidateDraftResponse,
} from '@/lib';

import styles from './Changes.module.css';
import {
  blockedTitle,
  buildReview,
  type ChangeLine,
  changesBudgets,
  type ChangesReview,
  type DiffState,
  discardBlocker,
  discardDescription,
  discardFailureOf,
  draftOriginText,
  type EntityReview,
  type FixTarget,
  issuesOf,
  plural,
  publishBlocker,
  publishSummary,
  type Readiness,
  readinessOf,
  type ValidationState,
  WHOLE_CATALOG_ID,
} from './changes-review';

const NOTE_MAX_LENGTH = 500;

const CONFLICT_NOTICE: Notice = {
  intent: 'warning',
  title: 'Someone else changed the draft',
  body: 'Nothing was changed. The screen now shows the current draft; review it again before acting on it.',
};

type NoticeHandler = (notice: Notice | null) => void;

export function ChangesScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <ChangesView capabilities={capabilities} />
    </PermissionGate>
  );
}

function ChangesView({ capabilities }: { capabilities: Capabilities }): ReactElement {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice | null>(null);
  const reload = (): Promise<void> => queryClient.invalidateQueries({ queryKey: catalogKeys.all });

  return (
    <>
      <PageHeader title="Review & publish" subtitle="Changes saved in the shared draft. Nothing reaches the apps until they are published." />
      {notice ? (
        <Alert intent={notice.intent} title={notice.title} onDismiss={() => setNotice(null)} className={styles.notice}>
          {notice.body}
        </Alert>
      ) : null}
      <ChangesContent capabilities={capabilities} onNotice={setNotice} onReload={reload} />
    </>
  );
}

function Loading({ label }: { label: string }): ReactElement {
  return (
    <div className={controls.loading}>
      <Spinner aria-label={label} />
    </div>
  );
}

function NothingPending(): ReactElement {
  const navigate = useNavigate();
  return (
    <EmptyState
      title="Nothing waiting to publish"
      description="Changes saved on Features, Budgets and the other screens collect here until someone publishes them."
      action={{ label: 'Go to Features', onClick: () => void navigate({ to: '/features' }) }}
      secondaryAction={{ label: 'Go to Budgets', onClick: () => void navigate({ to: '/budgets' }) }}
    />
  );
}

interface ContentProps {
  capabilities: Capabilities;
  onNotice: NoticeHandler;
  onReload: () => Promise<void>;
}

function ChangesContent({ capabilities, onNotice, onReload }: ContentProps): ReactElement {
  const draft = useDraft();
  const saved = draft.status === 'ready' ? draft.draft : null;
  const active = useActiveCatalog(saved !== null);
  const activeDocument = active.status === 'ready' ? active.document : null;
  const settled = active.status === 'ready' || active.status === 'none';
  const changes = useMemo(() => (saved && settled ? describeChanges(activeDocument, saved.draft.document) : []), [saved, settled, activeDocument]);

  if (draft.status === 'loading') return <Loading label="Loading the draft" />;
  if (draft.status === 'error')
    return (
      <Alert intent="danger" title="Couldn't load the draft">
        {draft.error.message}
      </Alert>
    );
  if (!saved) return <NothingPending />;
  if (active.status === 'loading') return <Loading label="Loading the active catalog" />;
  if (active.status === 'error')
    return (
      <Alert intent="danger" title="Couldn't load the active catalog">
        {active.error.message}
      </Alert>
    );
  if (changes.length === 0) return <NothingPending />;
  return <DraftReview capabilities={capabilities} saved={saved} activeDocument={activeDocument} changes={changes} onNotice={onNotice} onReload={onReload} />;
}

function validationStateOf(query: { data?: ValidateDraftResponse; error: Error | null }, allowed: boolean): ValidationState {
  if (query.data) return { status: 'checked', issues: query.data.issues };
  if (!allowed) return { status: 'not_allowed' };
  return query.error ? { status: 'unavailable', message: query.error.message } : { status: 'checking' };
}

interface DraftReviewProps extends ContentProps {
  saved: DraftResponse;
  activeDocument: CatalogDocument | null;
  changes: CatalogChange[];
}

function DraftReview({ capabilities, saved, activeDocument, changes, onNotice, onReload }: DraftReviewProps): ReactElement {
  const validationQuery = useQuery({ ...draftValidationQueryOptions(saved.fingerprint), enabled: capabilities.writeDraft });
  const validation = validationStateOf(validationQuery, capabilities.writeDraft);
  const document: CatalogDocument = saved.draft.document;
  const issues = issuesOf(validation);
  const review = buildReview(changes, issues, document);
  const readiness = readinessOf(validation, review);

  return (
    <>
      <DraftCard capabilities={capabilities} saved={saved} activeDocument={activeDocument} review={review} onNotice={onNotice} />
      <ReadinessAlert readiness={readiness} onRetry={() => void validationQuery.refetch()} retrying={validationQuery.isFetching} />
      {changesBudgets(review) ? (
        <Alert intent="info" title="This draft changes budgets" className={styles.notice}>
          Budgets are normally set on the <Link to="/budgets">Budgets screen</Link>, which publishes them straight away. Publishing here ships them together with every other change
          below.
        </Alert>
      ) : null}
      {review.areas.map(area => (
        <section key={area.area} className={styles.area} aria-label={area.title}>
          <SectionHeader title={area.title} subtitle={area.changeCount > 0 ? plural(area.changeCount, 'change') : 'No changes, but problems to fix'} />
          <div className={styles.entities}>
            {area.entities.map(entity => (
              <EntityCard key={entity.id} entity={entity} />
            ))}
          </div>
        </section>
      ))}
      {review.catalogIssues.length > 0 ? (
        <section id={WHOLE_CATALOG_ID} className={styles.area} aria-label="Whole catalog">
          <SectionHeader title="Whole catalog" subtitle="Problems that don't belong to a single item" />
          <Card padding="md">
            <Card.Body>
              <IssueItems issues={review.catalogIssues} label="Problems with the whole catalog" />
              <FixLink target={{ screen: 'advanced' }} />
            </Card.Body>
          </Card>
        </section>
      ) : null}
      <section className={styles.area} aria-label="Publish">
        <SectionHeader title="Publish" subtitle="Every app switches to the published catalog. The current version is archived and can be restored from History." />
        <PublishCard
          key={`${saved.fingerprint}:${saved.draft.note ?? ''}`}
          capabilities={capabilities}
          saved={saved}
          review={review}
          readiness={readiness}
          onNotice={onNotice}
          onReload={onReload}
        />
      </section>
    </>
  );
}

interface DraftCardProps {
  capabilities: Capabilities;
  onNotice: NoticeHandler;
  saved: DraftResponse;
  activeDocument: CatalogDocument | null;
  review: ChangesReview;
}

function DraftCard({ capabilities, saved, activeDocument, review, onNotice }: DraftCardProps): ReactElement {
  const now = useMinuteClock();
  const me = useQuery(meQuery);
  const confirm = useConfirm();
  const discard = useDiscardDraftMutation();
  const blocker = capabilities.writeDraft ? discardBlocker(saved.draft.document, activeDocument, capabilities) : null;

  const handleDiscard = async (): Promise<void> => {
    const confirmed = await confirm({
      title: 'Discard this draft?',
      description: discardDescription(review.changeCount),
      confirmLabel: 'Discard draft',
      intent: 'danger',
    });
    if (!confirmed) return;
    onNotice(null);
    try {
      await discard.mutateAsync(saved.fingerprint);
      onNotice({ intent: 'success', title: 'Draft discarded', body: 'The active catalog is unchanged.' });
    } catch (error) {
      const failure = discardFailureOf(error);
      if (failure.kind === 'conflict') onNotice(CONFLICT_NOTICE);
      else if (failure.kind === 'forbidden')
        onNotice({
          intent: 'danger',
          title: "You can't discard this draft",
          body: "It changes budgets or providers, which your role can't edit. Ask someone who can edit them to discard it.",
        });
      else if (failure.kind === 'absent') onNotice({ intent: 'info', title: 'The draft was already gone', body: 'Someone else published or discarded it.' });
      else onNotice({ intent: 'danger', title: "Couldn't discard the draft", body: failure.message });
    }
  };

  const action = capabilities.writeDraft ? (
    <Button variant="danger" size="sm" onClick={() => void handleDiscard()} loading={discard.isPending} disabled={blocker !== null}>
      Discard draft
    </Button>
  ) : undefined;

  return (
    <Card padding="md" className={styles.notice}>
      <Card.Header title={plural(review.changeCount, 'unpublished change')} action={action} />
      <Card.Body>
        <p className={styles.origin}>{draftOriginText(saved.draft, me.data?.sub, now)}</p>
        {saved.draft.note ? <p className={styles.note}>“{saved.draft.note}”</p> : null}
        {blocker ? <p className={controls.hint}>{blocker}</p> : null}
      </Card.Body>
    </Card>
  );
}

function ReadinessAlert({ readiness, onRetry, retrying }: { readiness: Readiness; onRetry: () => void; retrying: boolean }): ReactElement {
  switch (readiness.kind) {
    case 'ready':
      return (
        <Alert intent="success" title="Ready to publish" className={styles.notice}>
          The checks found no problems in this draft.
        </Alert>
      );
    case 'checking':
      return <Alert intent="info" title="Checking the draft for problems…" className={styles.notice} />;
    case 'unavailable':
      return (
        <Alert intent="warning" title="Couldn't check the draft for problems" className={styles.notice} action={retrying ? undefined : { label: 'Try again', onClick: onRetry }}>
          {readiness.message} Publishing still checks it and refuses a draft with problems.
        </Alert>
      );
    case 'unchecked':
      return (
        <Alert intent="info" title="Problems are checked when the draft is published" className={styles.notice}>
          Your role can’t run the checks here. Publishing refuses a draft that has problems.
        </Alert>
      );
    case 'blocked':
      return (
        <Alert intent="danger" title={blockedTitle(readiness.problems)} className={styles.notice}>
          <ul className={styles.problemLinks}>
            {readiness.links.map(link => (
              <li key={link.id}>
                <a href={`#${link.id}`}>{link.label}</a> · {plural(link.count, 'problem')}
              </li>
            ))}
          </ul>
        </Alert>
      );
  }
}

function ChangeLineText({ line }: { line: ChangeLine }): ReactElement {
  if (line.kind === 'text') return <>{line.text}</>;
  return (
    <>
      {line.lead}: <span className={styles.before}>{line.before}</span>
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
      <span className="sr-only"> changes to </span>
      <span className={styles.after}>{line.after}</span>
      {line.suffix}
    </>
  );
}

function EntityCard({ entity }: { entity: EntityReview }): ReactElement {
  const badge =
    entity.issues.length > 0 ? (
      <Badge intent="danger" variant="soft">
        {plural(entity.issues.length, 'problem')}
      </Badge>
    ) : undefined;
  return (
    <Card padding="md" id={entity.id}>
      <Card.Header title={entity.label} action={badge} />
      <Card.Body>
        {entity.lines.length > 0 ? (
          <ul className={styles.lines} aria-label={`Changes to ${entity.label}`}>
            {entity.lines.map((line, index) => (
              <li key={index}>
                <ChangeLineText line={line} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.origin}>Not changed by this draft.</p>
        )}
        {entity.issues.length > 0 ? (
          <>
            <IssueItems issues={entity.issues} label={`Problems with ${entity.label}`} />
            <FixLink target={entity.fix} />
          </>
        ) : null}
      </Card.Body>
    </Card>
  );
}

function IssueItems({ issues, label }: { issues: readonly CatalogIssueResponse[]; label: string }): ReactElement {
  return (
    <ul className={styles.issues} aria-label={label}>
      {issues.map((issue, index) => (
        <li key={`${index}:${issue.path}:${issue.code}`} className={styles.issue}>
          <span className={styles.issueText}>{issueSentence(issue)}</span>
          <details className={styles.technical}>
            <summary>Technical details</summary>
            <span className={styles.technicalBody}>
              <Mono>{issue.path || '(whole document)'}</Mono>
              <Mono>{issue.code}</Mono>
            </span>
          </details>
        </li>
      ))}
    </ul>
  );
}

function FixLinkTo({ target, children }: { target: FixTarget; children: ReactNode }): ReactElement {
  switch (target.screen) {
    case 'feature':
      return (
        <Link to="/features/$task" params={{ task: target.task }}>
          {children}
        </Link>
      );
    case 'alias':
      return (
        <Link to="/aliases" search={{ alias: target.alias }}>
          {children}
        </Link>
      );
    case 'budgets':
      return <Link to="/budgets">{children}</Link>;
    case 'models':
      return <Link to="/models">{children}</Link>;
    case 'providers':
      return <Link to="/providers">{children}</Link>;
    case 'advanced':
      return <Link to="/advanced">{children}</Link>;
  }
}

const FIX_SCREEN_NAMES: Readonly<Record<FixTarget['screen'], string>> = {
  feature: 'Features',
  alias: 'Model names',
  budgets: 'Budgets',
  models: 'Models',
  providers: 'Providers',
  advanced: 'the advanced editor',
};

function FixLink({ target }: { target: FixTarget }): ReactElement {
  return (
    <p className={styles.fix}>
      <FixLinkTo target={target}>Fix it in {FIX_SCREEN_NAMES[target.screen]}</FixLinkTo>
    </p>
  );
}

function diffStateOf(diff: { data?: { fingerprint: string } | null; isFetching: boolean; error: Error | null }, fingerprint: string): DiffState {
  if (diff.isFetching) return 'loading';
  if (diff.error) return 'failed';
  if (diff.data === undefined) return 'loading';
  return diff.data?.fingerprint === fingerprint ? 'current' : 'stale';
}

interface PublishCardProps extends ContentProps {
  saved: DraftResponse;
  review: ChangesReview;
  readiness: Readiness;
}

function PublishCard({ capabilities, saved, review, readiness, onNotice, onReload }: PublishCardProps): ReactElement {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const publish = usePublishDraftMutation();
  const diff = useQuery({ ...diffQueryOptions(), enabled: capabilities.publish });
  const [note, setNote] = useState(saved.draft.note ?? '');
  const [savingNote, setSavingNote] = useState(false);

  if (!capabilities.publish)
    return (
      <Card padding="md">
        <Card.Body>
          <p className={styles.origin}>Your role can’t publish. Someone with publish rights must review this page and publish these changes.</p>
        </Card.Body>
      </Card>
    );

  const diffState = diffStateOf(diff, saved.fingerprint);
  const blocker = publishBlocker(readiness, diffState);
  const trimmed = note.trim();
  const noteChanged = capabilities.writeDraft && trimmed !== (saved.draft.note ?? '');

  /** The fingerprint covers the document only, so a note-only save keeps the draft the diff describes publishable. */
  const saveNote = async (): Promise<boolean> => {
    setSavingNote(true);
    try {
      const outcome = await saveDraft({ document: saved.draft.document, ...(trimmed && { note: trimmed }), expectedFingerprint: saved.fingerprint });
      if (outcome.kind === 'done') return true;
      onNotice({ intent: 'danger', title: "Couldn't save the note", body: 'The draft was refused. Nothing was published.' });
      return false;
    } catch (error) {
      if (isCatalogConflict(error)) {
        onNotice(CONFLICT_NOTICE);
        await onReload();
      } else onNotice({ intent: 'danger', title: "Couldn't save the note", body: `${error instanceof Error ? error.message : ''} Nothing was published.`.trim() });
      return false;
    } finally {
      setSavingNote(false);
    }
  };

  const handlePublish = async (): Promise<void> => {
    const fingerprint = diff.data?.fingerprint;
    if (!fingerprint || blocker) return;
    const confirmed = await confirm({
      title: 'Publish these changes?',
      description: `${publishSummary(review)} Every app switches to the new catalog within a minute; the current version is archived and can be restored from History.`,
      confirmLabel: 'Publish',
    });
    if (!confirmed) return;
    onNotice(null);
    if (noteChanged && !(await saveNote())) return;
    try {
      const outcome = await publish.mutateAsync(fingerprint);
      if (outcome.kind === 'done') {
        onNotice({ intent: 'success', title: `Published as version ${outcome.value.version}`, body: 'Apps pick it up within a minute.' });
        return;
      }
      queryClient.setQueryData<ValidateDraftResponse>(catalogKeys.validation(fingerprint), { valid: false, issues: outcome.issues });
      onNotice({
        intent: 'danger',
        title: 'Publishing was refused',
        body: `${plural(outcome.issues.length, 'problem')} must be fixed first; they are shown next to the items above.`,
      });
    } catch (error) {
      if (!isCatalogConflict(error)) return onNotice({ intent: 'danger', title: "Couldn't publish the draft", body: error instanceof Error ? error.message : undefined });
      onNotice(CONFLICT_NOTICE);
      await onReload();
    }
  };

  return (
    <Card padding="md">
      <Card.Body>
        <div className={styles.publishForm}>
          <FormField
            label="Note for the version history"
            optional
            helper={capabilities.writeDraft ? 'Saved with the published version.' : "Your role can't change the note; the draft's note is published with it."}
            className={styles.noteField}
          >
            <Input value={note} onValueChange={setNote} maxLength={NOTE_MAX_LENGTH} disabled={!capabilities.writeDraft} placeholder="What these changes are for" />
          </FormField>
          <Button variant="primary" onClick={() => void handlePublish()} loading={publish.isPending || savingNote} disabled={blocker !== null}>
            Publish changes
          </Button>
        </div>
        {diffState === 'stale' ? (
          <Alert intent="warning" title="The draft changed while you were reviewing it" className={styles.stale} action={{ label: 'Reload', onClick: () => void onReload() }}>
            Reload to review the current draft before publishing it.
          </Alert>
        ) : blocker ? (
          <p className={controls.hint}>{blocker}</p>
        ) : null}
      </Card.Body>
    </Card>
  );
}
