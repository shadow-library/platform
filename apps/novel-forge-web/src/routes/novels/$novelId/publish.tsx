/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, FormField, Input, SegmentedControl, Textarea, toast, Tooltip } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { type ChipIntent, PageContainer, PageHeader, QueryState, SectionCard, StatusChip } from '@/components/nf';
import {
  type ChapterPublication,
  type ChapterPublicationStatus,
  type DraftResponse,
  type GrantState,
  type Publication,
  type PublicationStatus,
  type PublicationVisibility,
  type PublishNovelBody,
  type ReconcileResult,
  useListDraftsQuery,
  useProjectQuery,
  usePublicationAccessQuery,
  usePublicationsQuery,
  usePublishChapterMutation,
  usePublishNovelMutation,
  useReconcileMutation,
  useSetPublicationAccessMutation,
  useUnpublishChapterMutation,
} from '@/lib/apis';
import { messageTime, projectTitle, relativeTime } from '@/lib/format';

import styles from './publish.module.css';

// No loader by design (category D): a release dashboard over the publication ledger — it polls while
// pushes are in flight, so there is nothing stable to prefetch for the first server paint.
export const Route = createFileRoute('/novels/$novelId/publish')({
  component: PublishScreen,
});

/**
 * Declaring the constants
 */

const STATUS_CHIP: Record<ChapterPublicationStatus, ChipIntent> = { scheduled: 'info', published: 'success', failed: 'danger', unpublished: 'neutral' };

/** A draft is releasable once review signed it off; anything unreviewed trips the backend's PUB_002 gate. */
function isApproved(draft: DraftResponse): boolean {
  return draft.reviewStatus === 'approved' || draft.reviewStatus === 'final';
}

interface ChapterRow {
  chapter: number;
  draft?: DraftResponse;
  ledger?: ChapterPublication;
}

interface ActionError {
  chapter: number;
  message: string;
}

// ─── Novel metadata card ─────────────────────────────────────────────────────

interface NovelCardProps {
  novelId: string;
  publication: Publication | undefined;
  ready: boolean;
  defaultTitle: string;
}

function NovelCard({ novelId, publication, ready, defaultTitle }: NovelCardProps): React.JSX.Element {
  const publishNovel = usePublishNovelMutation(novelId);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [blurb, setBlurb] = useState('');
  const [coverPath, setCoverPath] = useState('');
  const [genres, setGenres] = useState('');
  const [status, setStatus] = useState<PublicationStatus>('live');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !ready) return;
    setSlug(publication?.novelSlug ?? '');
    setTitle(publication?.title ?? defaultTitle);
    setBlurb(publication?.blurb ?? '');
    setCoverPath(publication?.coverPath ?? '');
    setGenres((publication?.genres ?? []).join(', '));
    setStatus(publication?.status ?? 'live');
    setHydrated(true);
  }, [publication, ready, hydrated, defaultTitle]);

  const save = (): void => {
    const body: PublishNovelBody = {
      title: title.trim() || undefined,
      blurb: blurb.trim() || null,
      coverPath: coverPath.trim() || null,
      genres: genres
        .split(',')
        .map(genre => genre.trim())
        .filter(Boolean),
    };
    // The slug only travels on first publish (immutable afterwards); status only once the listing exists —
    // on first publish an omitted status is the go-live default.
    if (!publication && slug.trim()) body.novelSlug = slug.trim();
    if (publication) body.status = status;
    publishNovel.mutate(body, {
      onSuccess: result => {
        setSlug(result.novelSlug);
        toast.success(publication ? 'Publication updated' : `Live as “${result.novelSlug}”`);
      },
      onError: error => toast.danger(error.message),
    });
  };

  const fieldErrors = publishNovel.error?.fieldErrors ?? {};

  return (
    <SectionCard
      title="Novel listing"
      action={
        publication && (
          <span className={styles.metaRow}>
            <StatusChip intent={publication.status === 'live' ? 'success' : 'neutral'} dot>
              {publication.status}
            </StatusChip>
            <span className={styles.metaText}>rev {publication.revision}</span>
            <span className={styles.metaText}>updated {relativeTime(publication.updatedAt)}</span>
          </span>
        )
      }
    >
      <div className={styles.form}>
        <div className={styles.formGrid}>
          <FormField
            label="Slug"
            error={fieldErrors['novelSlug']}
            helper={
              publication
                ? 'Immutable — the slug anchors reader URLs and bookmarks.'
                : 'Lowercase and dashes; left blank it is derived from the title. Immutable after first publish.'
            }
          >
            <Input value={slug} onValueChange={setSlug} placeholder="derived-from-title" disabled={Boolean(publication)} />
          </FormField>
          <FormField label="Title" error={fieldErrors['title']}>
            <Input value={title} onValueChange={setTitle} placeholder="Reader-facing title" />
          </FormField>
        </div>
        <FormField label="Blurb" error={fieldErrors['blurb']} helper="The catalog description readers see.">
          <Textarea value={blurb} onChange={e => setBlurb(e.target.value)} placeholder="A one-paragraph pitch for the shelf." />
        </FormField>
        <div className={styles.formGrid}>
          <FormField label="Cover path" error={fieldErrors['coverPath']} helper="A forge asset path; the push renders it for the reader.">
            <Input value={coverPath} onValueChange={setCoverPath} placeholder="assets/cover.png" />
          </FormField>
          <FormField label="Genres" error={fieldErrors['genres']} helper="Comma-separated.">
            <Input value={genres} onValueChange={setGenres} placeholder="fantasy, adventure" />
          </FormField>
        </div>
        {publication && (
          <FormField label="Status" error={fieldErrors['status']} helper="Retired novels stay readable but leave the catalog.">
            <SegmentedControl value={status} onValueChange={value => setStatus(value as PublicationStatus)} size="sm">
              <SegmentedControl.Item value="live">Live</SegmentedControl.Item>
              <SegmentedControl.Item value="retired">Retired</SegmentedControl.Item>
            </SegmentedControl>
          </FormField>
        )}
        <div className={styles.formActions}>
          <Button variant="primary" loading={publishNovel.isPending} onClick={save}>
            {publication ? 'Save changes' : 'Publish novel'}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Visibility & access card ────────────────────────────────────────────────

const VISIBILITY_HELP: Record<PublicationVisibility, string> = {
  PUBLIC: 'Anyone can find and read it. Listed in browse, search and sort.',
  ORGANISATION: 'Every member of your current organisation can read it. Hidden from browse, search and sort.',
  RESTRICTED: 'Only the people you name can read it. Hidden from browse, search and sort.',
};

interface AccessCardProps {
  novelId: string;
  published: boolean;
}

/**
 * Editing access here rather than on the reader is deliberate: the forge is the system of record for
 * who may read a published novel, and the reader holds a projection it never writes.
 */
function AccessCard({ novelId, published }: AccessCardProps): React.JSX.Element {
  const access = usePublicationAccessQuery(novelId, published);
  const setAccess = useSetPublicationAccessMutation(novelId);
  const [visibility, setVisibility] = useState<PublicationVisibility>('PUBLIC');
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !access.data) return;
    setVisibility(access.data.visibility);
    setEmails(access.data.grants.map(grant => grant.email));
    setHydrated(true);
  }, [access.data, hydrated]);

  /** Accepts a comma- or space-separated paste, so an author can bring a list from anywhere. */
  const addDraft = (): void => {
    const added = draft
      .split(/[\s,;]+/)
      .map(value => value.trim().toLowerCase())
      .filter(Boolean);
    if (added.length === 0) return;
    setEmails(current => [...new Set([...current, ...added])]);
    setDraft('');
  };

  const save = (): void => {
    setAccess.mutate(
      { visibility, grants: visibility === 'RESTRICTED' ? emails.map(email => ({ email })) : [] },
      {
        onSuccess: result => {
          setEmails(result.grants.map(grant => grant.email));
          const pending = result.grants.filter(grant => grant.state === 'pending').length;
          if (pending > 0) toast.warning(`Saved — ${pending} address${pending === 1 ? '' : 'es'} have no account yet and cannot read it until they sign up`);
          else toast.success('Access updated');
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  const stateOf = (email: string): GrantState | undefined => access.data?.grants.find(grant => grant.email === email)?.state;

  if (!published) {
    return (
      <SectionCard title="Visibility & access">
        <Alert intent="info" title="Publish the novel first">
          Visibility is part of the published listing, so there is nothing to share until this novel has been published once.
        </Alert>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Visibility & access"
      action={
        access.data && (
          <span className={styles.metaRow}>
            <StatusChip intent={access.data.visibility === 'PUBLIC' ? 'neutral' : 'warning'} dot>
              {access.data.visibility.toLowerCase()}
            </StatusChip>
            <span className={styles.metaText}>rev {access.data.accessRevision}</span>
          </span>
        )
      }
    >
      <QueryState isLoading={access.isLoading} error={access.error}>
        <div className={styles.form}>
          <FormField label="Who can read this" helper={VISIBILITY_HELP[visibility]}>
            <SegmentedControl value={visibility} onValueChange={value => setVisibility(value as PublicationVisibility)} size="sm">
              <SegmentedControl.Item value="PUBLIC">Public</SegmentedControl.Item>
              <SegmentedControl.Item value="ORGANISATION">My organisation</SegmentedControl.Item>
              <SegmentedControl.Item value="RESTRICTED">Specific people</SegmentedControl.Item>
            </SegmentedControl>
          </FormField>

          {visibility === 'RESTRICTED' && (
            <FormField label="Shared with" helper="Enter an email address. Paste a list to add several at once.">
              <div className={styles.chipRow}>
                {emails.map(email => (
                  <StatusChip key={email} intent={stateOf(email) === 'pending' ? 'warning' : 'info'}>
                    {email}
                    {stateOf(email) === 'pending' ? ' · no account yet' : ''}
                    <Button variant="ghost" size="sm" onClick={() => setEmails(current => current.filter(value => value !== email))} aria-label={`Remove ${email}`}>
                      ×
                    </Button>
                  </StatusChip>
                ))}
                {emails.length === 0 && <span className={styles.metaText}>Nobody yet — this novel is readable only by you.</span>}
              </div>
              <div className={styles.formGrid}>
                <Input
                  value={draft}
                  onValueChange={setDraft}
                  placeholder="reader@example.com"
                  onKeyDown={event => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    addDraft();
                  }}
                />
                <Button variant="secondary" onClick={addDraft} disabled={!draft.trim()}>
                  Add
                </Button>
              </div>
            </FormField>
          )}

          {visibility === 'ORGANISATION' && access.data?.organisationId && <span className={styles.metaText}>Shared with organisation {access.data.organisationId}.</span>}

          <div className={styles.formActions}>
            <Button variant="primary" loading={setAccess.isPending} onClick={save}>
              Save access
            </Button>
          </div>
        </div>
      </QueryState>
    </SectionCard>
  );
}

// ─── Reconcile summary ───────────────────────────────────────────────────────

interface ReconcileSummaryProps {
  result: ReconcileResult;
}

function ReconcileSummary({ result }: ReconcileSummaryProps): React.JSX.Element {
  return (
    <SectionCard title="Reconcile result">
      <div className={styles.chipRow}>
        <StatusChip intent={result.novel === 'applied' ? 'info' : 'neutral'}>novel {result.novel}</StatusChip>
        <StatusChip intent={result.pushed.length > 0 ? 'success' : 'neutral'}>{result.pushed.length} pushed</StatusChip>
        <StatusChip intent={result.deleted.length > 0 ? 'warning' : 'neutral'}>{result.deleted.length} deleted</StatusChip>
        <StatusChip intent="neutral">{result.skipped.length} in sync</StatusChip>
        <StatusChip intent={result.failed.length > 0 ? 'danger' : 'neutral'}>{result.failed.length} failed</StatusChip>
      </div>
      {result.failed.length > 0 && (
        <Alert intent="danger" title="Some chapters failed to push">
          <ul className={styles.issueList}>
            {result.failed.map(failure => (
              <li key={failure.ordinal}>
                Reader chapter {failure.ordinal} — {failure.error}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {result.unknownOrdinals.length > 0 && (
        <Alert intent="warning" title="Unknown reader chapters">
          The reader serves ordinals the ledger cannot account for: {result.unknownOrdinals.join(', ')}. They were left untouched.
        </Alert>
      )}
    </SectionCard>
  );
}

// ─── Chapter ledger ──────────────────────────────────────────────────────────

interface PublicationCellProps {
  ledger: ChapterPublication | undefined;
}

function PublicationCell({ ledger }: PublicationCellProps): React.JSX.Element {
  if (!ledger) return <StatusChip intent="neutral">not published</StatusChip>;
  const chip = <StatusChip intent={STATUS_CHIP[ledger.status]}>{ledger.status}</StatusChip>;
  return (
    <span className={styles.pubCell}>
      {ledger.status === 'failed' ? (
        // The tooltip trigger must be a DOM element (Radix `asChild` spreads props), so the chip gets a span shell.
        <Tooltip content={ledger.error ?? 'Push failed'}>
          <span>{chip}</span>
        </Tooltip>
      ) : (
        chip
      )}
      {ledger.status === 'scheduled' && ledger.scheduledAt && <span className={styles.metaText}>{messageTime(ledger.scheduledAt)}</span>}
      {ledger.status === 'published' && ledger.publishedAt && <span className={styles.metaText}>{relativeTime(ledger.publishedAt)}</span>}
      {ledger.revision > 1 && <span className={styles.metaText}>rev {ledger.revision}</span>}
    </span>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

function PublishScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const projectQuery = useProjectQuery(novelId);
  const ledgerQuery = usePublicationsQuery(novelId);
  const draftsQuery = useListDraftsQuery(novelId);
  const publishChapter = usePublishChapterMutation(novelId);
  const unpublishChapter = useUnpublishChapterMutation(novelId);
  const reconcile = useReconcileMutation(novelId);

  const [scheduling, setScheduling] = useState<number | null>(null);
  const [scheduleAt, setScheduleAt] = useState('');
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);

  const publication = ledgerQuery.data?.publication;
  const ledgerRows = ledgerQuery.data?.chapters ?? [];
  const drafts = draftsQuery.data?.items ?? [];
  const ledgerByChapter = new Map(ledgerRows.map(row => [row.chapter, row]));

  // Every draft, plus ledger rows whose forge chapter no longer has a draft (e.g. after a renumber) —
  // those must stay visible so they can still be unpublished or reconciled.
  const rows: ChapterRow[] = [
    ...drafts.map(draft => ({ chapter: draft.chapter, draft, ledger: ledgerByChapter.get(draft.chapter) })),
    ...ledgerRows.filter(row => !drafts.some(draft => draft.chapter === row.chapter)).map(row => ({ chapter: row.chapter, ledger: row })),
  ].sort((a, b) => a.chapter - b.chapter);

  const act = (chapter: number, scheduledAt?: string): void => {
    setScheduling(null);
    publishChapter.mutate(
      { chapter, scheduledAt },
      {
        onSuccess: row => {
          setActionError(null);
          toast.success(row.status === 'scheduled' ? `Chapter ${chapter} scheduled` : `Chapter ${chapter} queued for publish`);
        },
        onError: error => setActionError({ chapter, message: error.message }),
      },
    );
  };

  const unpublish = (chapter: number): void => {
    unpublishChapter.mutate(chapter, {
      onSuccess: () => {
        setActionError(null);
        toast.success(`Chapter ${chapter} unpublished`);
      },
      onError: error => setActionError({ chapter, message: error.message }),
    });
  };

  const runReconcile = (): void => {
    reconcile.mutate(undefined, {
      onSuccess: result => {
        setReconcileResult(result);
        toast.success('Reconcile complete');
      },
      onError: error => toast.danger(error.message),
    });
  };

  const busy = publishChapter.isPending || unpublishChapter.isPending;

  return (
    <PageContainer>
      <PageHeader
        title="Publish"
        subtitle="Push the novel and its approved chapters to the reader service — explicit releases, scheduling, and a ledger of what is live."
        extra={
          <Button variant="secondary" loading={reconcile.isPending} disabled={!publication} onClick={runReconcile}>
            Reconcile reader
          </Button>
        }
      />

      <QueryState isLoading={ledgerQuery.isLoading || projectQuery.isLoading} error={ledgerQuery.error ?? projectQuery.error}>
        <div className={styles.stack}>
          <NovelCard
            novelId={novelId}
            publication={publication}
            ready={!ledgerQuery.isLoading && Boolean(projectQuery.data)}
            defaultTitle={projectQuery.data ? projectTitle(projectQuery.data) : ''}
          />

          <AccessCard novelId={novelId} published={Boolean(publication)} />

          {reconcileResult && <ReconcileSummary result={reconcileResult} />}

          <SectionCard title="Chapters" action={<StatusChip intent="neutral">{rows.length}</StatusChip>}>
            {actionError && (
              <Alert intent="danger" title={`Chapter ${actionError.chapter}`}>
                {actionError.message}
              </Alert>
            )}
            <QueryState
              isLoading={draftsQuery.isLoading}
              error={draftsQuery.error}
              isEmpty={rows.length === 0}
              emptyTitle="Nothing to publish yet"
              emptyDescription="Chapters appear here once drafts exist; only approved chapters clear the release gate."
            >
              <div className={styles.table}>
                <div className={styles.headerRow}>
                  <span>#</span>
                  <span>Reader #</span>
                  <span>Title</span>
                  <span>Review</span>
                  <span>Publication</span>
                  <span className={styles.headerActions}>Actions</span>
                </div>
                {rows.map(({ chapter, draft, ledger }) => {
                  const approved = draft ? isApproved(draft) : false;
                  const status = ledger?.status;
                  return (
                    <div key={chapter} className={styles.row} data-chapter={chapter}>
                      <span className={styles.rowNum}>{String(chapter).padStart(2, '0')}</span>
                      <span className={styles.rowNum}>{ledger ? String(ledger.publishedOrdinal).padStart(2, '0') : '—'}</span>
                      <span className={styles.rowTitle}>{ledger?.title ?? draft?.title ?? 'Untitled'}</span>
                      <span>
                        {draft ? (
                          <StatusChip intent={approved ? 'success' : 'warning'}>{draft.reviewStatus.replace('_', ' ')}</StatusChip>
                        ) : (
                          <StatusChip intent="neutral">no draft</StatusChip>
                        )}
                      </span>
                      <span>
                        <PublicationCell ledger={ledger} />
                      </span>
                      <span className={styles.rowActions}>
                        {(!status || status === 'scheduled' || status === 'failed') && (
                          <Button variant="text" size="sm" disabled={busy} onClick={() => act(chapter)}>
                            {status === 'failed' ? 'Retry' : 'Publish now'}
                          </Button>
                        )}
                        {(status === 'published' || status === 'unpublished') && (
                          <Button variant="text" size="sm" disabled={busy} onClick={() => act(chapter)}>
                            Republish
                          </Button>
                        )}
                        {(!status || status === 'unpublished') && (
                          <Button variant="text" size="sm" disabled={busy} onClick={() => setScheduling(chapter)}>
                            Schedule…
                          </Button>
                        )}
                        {status && status !== 'unpublished' && (
                          <Button variant="text" size="sm" disabled={busy} onClick={() => unpublish(chapter)}>
                            Unpublish
                          </Button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </QueryState>
          </SectionCard>
        </div>
      </QueryState>

      <Dialog
        open={scheduling !== null}
        onOpenChange={open => {
          if (!open) setScheduling(null);
        }}
      >
        <Dialog.Content size="sm">
          <Dialog.Header title={`Schedule chapter ${scheduling ?? ''}`} description="The forge pushes it to the reader at the chosen time." />
          <Dialog.Body>
            <FormField label="Publish at" helper="Your local timezone; a past time publishes immediately.">
              <Input type="datetime-local" value={scheduleAt} onValueChange={setScheduleAt} />
            </FormField>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" disabled={!scheduleAt} onClick={() => scheduling !== null && act(scheduling, new Date(scheduleAt).toISOString())}>
              Schedule
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </PageContainer>
  );
}
