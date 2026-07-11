/**
 * Importing npm packages
 */
import { Button, Dialog, FormField, Input, Textarea, toast } from '@shadow-library/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

/**
 * Importing user defined modules
 */
import { ChevronRightIcon, SparkIcon } from '@/components/icons';
import { PaneError, PaneLoader, QueryState, StatusChip } from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';
import {
  type ArcResponse,
  type VolumeResponse,
  useApproveArcsMutation,
  useApproveVolumesMutation,
  useBriefQuery,
  useListArcsQuery,
  useListBriefsQuery,
  useListVolumesQuery,
  useOutlineArcMutation,
  usePlanArcsMutation,
  usePlanMutation,
  useUpdateBriefMutation,
  useVolumeQuery,
} from '@/lib/apis';

import styles from './volumes.module.css';

export const Route = createFileRoute('/novels/$novelId/volumes')({
  component: VolumesScreen,
});

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function roman(ordinal: number): string {
  return ROMAN[ordinal - 1] ?? String(ordinal);
}

interface CrumbProps {
  label: string;
  onClick?: () => void;
  current?: boolean;
}

function Crumb({ label, onClick, current }: CrumbProps): React.JSX.Element {
  if (current || !onClick) return <span className={styles.crumbCurrent}>{label}</span>;
  return (
    <button onClick={onClick} className={styles.crumbBtn}>
      {label}
    </button>
  );
}

interface FieldProps {
  label: string;
  value?: string | null;
}

function Field({ label, value }: FieldProps): React.JSX.Element | null {
  if (!value) return null;
  return (
    <>
      <div className={styles.sectionLabel}>{label}</div>
      <p className={styles.fieldText}>{value}</p>
    </>
  );
}

interface ForgeDockAreaProps {
  novelId: string;
  scope: React.ComponentProps<typeof ForgeBar>['scope'];
  placeholder?: string;
}

/** The floating Forge composer, centered at the bottom of the pane, above the scrolled content. */
function ForgeDockArea({ novelId, scope, placeholder }: ForgeDockAreaProps): React.JSX.Element {
  return (
    <div className={styles.forgeDock}>
      <ForgeBar novelId={novelId} scope={scope} placeholder={placeholder} />
    </div>
  );
}

// ─── Level 1: volumes ───────────────────────────────────────────────────────────

interface PlanDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

function PlanDialog({ novelId, open, onOpenChange }: PlanDialogProps): React.JSX.Element {
  const plan = usePlanMutation(novelId);
  const [volumeCount, setVolumeCount] = useState('3');
  const [chaptersPerVolume, setChaptersPerVolume] = useState('8');

  const vc = Number(volumeCount);
  const cpv = Number(chaptersPerVolume);
  const invalid = !Number.isInteger(vc) || vc < 1 || vc > 12 || !Number.isInteger(cpv) || cpv < 1 || cpv > 40;

  const submit = (): void => {
    plan.mutate(
      { volumeCount: vc, chaptersPerVolume: cpv },
      {
        onSuccess: res => {
          toast.success(`Planned ${res.volumes.length} volumes`);
          onOpenChange(false);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm">
        <Dialog.Header
          title="Generate volumes"
          description="Forge drafts a contiguous volume structure from your brief and story bible. You can refine or approve it afterwards."
        />
        <Dialog.Body>
          <div className={styles.dialogRow}>
            <FormField label="Volumes" className={styles.formCol}>
              <Input type="number" min={1} max={12} value={volumeCount} onValueChange={setVolumeCount} />
            </FormField>
            <FormField label="Chapters per volume" className={styles.formCol}>
              <Input type="number" min={1} max={40} value={chaptersPerVolume} onValueChange={setChaptersPerVolume} />
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" prefix={<SparkIcon />} loading={plan.isPending} disabled={invalid} onClick={submit}>
            Generate volumes
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

interface VolumesListProps {
  novelId: string;
  onOpen: (v: VolumeResponse) => void;
}

function VolumesList({ novelId, onOpen }: VolumesListProps): React.JSX.Element {
  const volumesQuery = useListVolumesQuery(novelId, { limit: 50 });
  const approve = useApproveVolumesMutation(novelId);
  const [planOpen, setPlanOpen] = useState(false);
  const volumes = [...(volumesQuery.data?.items ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  const anyDraft = volumes.some(v => v.status === 'draft');

  return (
    <div className={`nf-page ${styles.pageVolumes}`}>
      <div className={styles.listHead}>
        <div className={styles.listHeadMain}>
          <h1 className={styles.title}>Story Plan</h1>
          <p className={styles.subtitle}>Volumes → arcs → chapter briefs · {volumes.length} volumes planned</p>
        </div>
        {anyDraft && (
          <Button
            variant="primary"
            loading={approve.isPending}
            onClick={() => approve.mutate(undefined, { onSuccess: () => toast.success('Volume plan approved'), onError: e => toast.danger(e.message) })}
          >
            Approve plan
          </Button>
        )}
        <Button variant={volumes.length === 0 ? 'primary' : 'ghost'} prefix={<SparkIcon />} onClick={() => setPlanOpen(true)}>
          Generate volumes
        </Button>
      </div>
      <QueryState
        isLoading={volumesQuery.isLoading}
        error={volumesQuery.error}
        isEmpty={volumes.length === 0}
        emptyTitle="No volumes yet"
        emptyDescription="Generate a volume plan to structure your novel, then approve it to unlock arcs and chapter briefs."
        emptyAction={{ label: 'Generate volumes', onClick: () => setPlanOpen(true) }}
      >
        <div className={styles.list}>
          {volumes.map(v => (
            <button key={v.id} className={`${styles.row} ${styles.rowVolume}`} onClick={() => onOpen(v)}>
              <span className={styles.volNum}>{roman(v.ordinal)}</span>
              <span className={styles.rowMain}>
                <span className={styles.rowName}>{v.title ?? `Volume ${v.ordinal}`}</span>
                {v.objective && <span className={styles.rowSub}>{v.objective}</span>}
              </span>
              {v.startChapter != null && v.endChapter != null && (
                <span className={styles.rowRange}>
                  Ch {v.startChapter}–{v.endChapter}
                </span>
              )}
              <span className={styles.statusCol}>
                <StatusChip intent={v.status === 'approved' ? 'success' : v.status === 'source' ? 'info' : 'neutral'} dot>
                  {v.status}
                </StatusChip>
              </span>
              <ChevronRightIcon size={15} className={styles.iconTertiary} />
            </button>
          ))}
        </div>
      </QueryState>
      <PlanDialog novelId={novelId} open={planOpen} onOpenChange={setPlanOpen} />
    </div>
  );
}

// ─── Level 2: one volume, its arcs ──────────────────────────────────────────────

interface VolumeDetailProps {
  novelId: string;
  volumeKey: string;
  onOpenArc: (arc: ArcResponse) => void;
}

function VolumeDetail({ novelId, volumeKey, onOpenArc }: VolumeDetailProps): React.JSX.Element {
  const navigate = useNavigate();
  const volumeQuery = useVolumeQuery(novelId, volumeKey);
  const arcsQuery = useListArcsQuery(novelId, volumeKey);
  const planArcs = usePlanArcsMutation(novelId, volumeKey);
  const approveArcs = useApproveArcsMutation(novelId, volumeKey);

  if (volumeQuery.isLoading) return <PaneLoader />;
  if (volumeQuery.error) return <PaneError error={volumeQuery.error} />;
  const v = volumeQuery.data;
  if (!v) return <PaneLoader />;
  const start = v.startChapter ?? 1;
  const end = v.endChapter ?? start;
  const arcs = [...(arcsQuery.data?.arcs ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  const anyDraftArc = arcs.some(a => a.status === 'draft');

  const generateArcs = (): void => {
    planArcs.mutate(
      {},
      {
        onSuccess: () => toast.success('Arc plan proposed — review and apply it from Proposals'),
        onError: e => toast.danger(e.message),
      },
    );
  };

  return (
    <div className={`nf-page ${styles.pageDetail}`}>
      <div className={styles.recordKind}>VOLUME {roman(v.ordinal)}</div>
      <h1 className={styles.title}>{v.title ?? `Volume ${v.ordinal}`}</h1>
      <div className={styles.metaRow}>
        <span>
          Ch {start}–{end}
        </span>
        <span>·</span>
        <StatusChip intent={v.status === 'approved' ? 'success' : v.status === 'source' ? 'info' : 'neutral'} dot>
          {v.status}
        </StatusChip>
      </div>

      <Field label="Objective" value={v.objective} />
      <Field label="Central conflict" value={v.conflict} />
      <Field label="Payoff" value={v.payoff} />
      {v.body && <Field label="Notes" value={v.body} />}

      <div className={styles.sectionHeadRow}>
        <h2 className={styles.sectionH2}>Arcs</h2>
        <div className={styles.spacer} />
        {anyDraftArc && (
          <Button
            variant="secondary"
            size="sm"
            loading={approveArcs.isPending}
            onClick={() => approveArcs.mutate(undefined, { onSuccess: r => toast.success(`${r.arcsApproved} arcs approved`), onError: e => toast.danger(e.message) })}
          >
            Approve arcs
          </Button>
        )}
        <Button variant={arcs.length === 0 ? 'primary' : 'ghost'} size="sm" prefix={<SparkIcon />} loading={planArcs.isPending} onClick={generateArcs}>
          {arcs.length === 0 ? 'Generate arcs' : 'Re-plan arcs'}
        </Button>
      </div>

      {arcs.length === 0 ? (
        <p className={styles.emptyArcs}>
          No arcs yet. Generate arcs to split this volume&apos;s {end - start + 1} chapters into escalating story units — the plan lands as a proposal you review before it becomes
          canon.
          {planArcs.isSuccess && (
            <>
              {' '}
              <button onClick={() => navigate({ to: '/novels/$novelId/proposals', params: { novelId } })} className={styles.inlineLink}>
                Open Proposals →
              </button>
            </>
          )}
        </p>
      ) : (
        <div className={`${styles.listBordered} ${styles.listSpaced}`}>
          {arcs.map(arc => (
            <button key={arc.arcKey} className={`${styles.row} ${styles.rowArc}`} onClick={() => onOpenArc(arc)}>
              <span className={styles.arcNum}>{arc.ordinal}</span>
              <span className={styles.rowMain}>
                <span className={styles.rowName}>{arc.title ?? arc.arcKey}</span>
                {arc.objective && <span className={styles.rowSub}>{arc.objective}</span>}
              </span>
              {arc.chapterStart != null && arc.chapterEnd != null && (
                <span className={styles.rowRange}>
                  Ch {arc.chapterStart}–{arc.chapterEnd}
                </span>
              )}
              <span className={styles.statusColSm}>
                <StatusChip intent={arc.status === 'approved' ? 'success' : 'neutral'} dot>
                  {arc.staleReason ? 'stale' : arc.status}
                </StatusChip>
              </span>
              <ChevronRightIcon size={15} className={styles.iconTertiary} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Level 3: one arc, its chapter briefs ───────────────────────────────────────

interface ArcDetailProps {
  novelId: string;
  volumeKey: string;
  arcKey: string;
  onOpenBrief: (chapter: number) => void;
}

function ArcDetail({ novelId, volumeKey, arcKey, onOpenBrief }: ArcDetailProps): React.JSX.Element {
  const arcsQuery = useListArcsQuery(novelId, volumeKey);
  const briefsQuery = useListBriefsQuery(novelId);
  const outlineArc = useOutlineArcMutation(novelId, arcKey);

  if (arcsQuery.isLoading) return <PaneLoader />;
  if (arcsQuery.error) return <PaneError error={arcsQuery.error} />;
  const arc = arcsQuery.data?.arcs.find(a => a.arcKey === arcKey);
  if (!arc) return <PaneError error={{ message: `Arc ${arcKey} not found` } as never} />;

  const start = arc.chapterStart ?? 0;
  const end = arc.chapterEnd ?? start;
  const chapters = start > 0 ? Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i) : [];
  const briefByChapter = new Map((briefsQuery.data?.items ?? []).map(b => [b.chapter, b]));
  const missing = chapters.filter(n => !briefByChapter.has(n)).length;

  const generateBriefs = (): void => {
    outlineArc.mutate(undefined, {
      onSuccess: res => toast.success(`Drafted ${res.briefs.length} chapter briefs for this arc`),
      onError: e => toast.danger(e.message),
    });
  };

  return (
    <div className={`nf-page ${styles.pageDetail}`}>
      <div className={styles.recordKind}>ARC {arc.ordinal}</div>
      <h1 className={styles.title}>{arc.title ?? arc.arcKey}</h1>
      <div className={styles.metaRow}>
        <span>
          Ch {start}–{end}
        </span>
        <span>·</span>
        <StatusChip intent={arc.status === 'approved' ? 'success' : 'neutral'} dot>
          {arc.status}
        </StatusChip>
        {arc.staleReason && <StatusChip intent="warning">stale · {arc.staleReason}</StatusChip>}
      </div>

      <Field label="Objective" value={arc.objective} />
      <Field label="Escalation" value={arc.escalation} />
      <Field label="Payoff" value={arc.payoff} />
      <Field label="Hook (handoff to next arc)" value={arc.hook} />
      {arc.body && <Field label="Notes" value={arc.body} />}

      <div className={styles.sectionHeadRow}>
        <h2 className={styles.sectionH2}>Chapter briefs</h2>
        <span className={styles.written}>
          {chapters.length - missing} of {chapters.length} written
        </span>
        <div className={styles.spacer} />
        <Button variant={missing > 0 ? 'primary' : 'ghost'} size="sm" prefix={<SparkIcon />} loading={outlineArc.isPending} onClick={generateBriefs}>
          {missing > 0 ? 'Generate briefs' : 'Regenerate briefs'}
        </Button>
      </div>
      {arc.status !== 'approved' && <p className={styles.approveNote}>Brief generation needs every arc in this volume approved first — approve arcs from the volume page.</p>}
      <div className={styles.listBordered}>
        {chapters.map(n => {
          const brief = briefByChapter.get(n);
          return (
            <button key={n} className={`${styles.row} ${styles.rowBrief}`} onClick={() => onOpenBrief(n)}>
              <span className={styles.briefNum}>{String(n).padStart(2, '0')}</span>
              <span className={styles.briefName}>{brief?.title ?? `Chapter ${n}`}</span>
              <span className={styles.statusCol}>
                {brief ? (
                  <StatusChip intent={brief.staleReason ? 'warning' : 'success'} dot>
                    {brief.staleReason ? 'stale' : 'brief ready'}
                  </StatusChip>
                ) : (
                  <StatusChip intent="neutral" dot>
                    no brief
                  </StatusChip>
                )}
              </span>
              <ChevronRightIcon size={15} className={styles.iconTertiary} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Level 4: one chapter brief ────────────────────────────────────────────────

interface BriefDetailProps {
  novelId: string;
  chapter: number;
}

function BriefDetail({ novelId, chapter }: BriefDetailProps): React.JSX.Element {
  const navigate = useNavigate();
  const briefQuery = useBriefQuery(novelId, chapter);
  const updateBrief = useUpdateBriefMutation(novelId, chapter);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const brief = briefQuery.data;
  useEffect(() => {
    if (brief) setDraft(brief.body);
  }, [brief]);

  const save = (): void => {
    updateBrief.mutate(
      { body: draft, title: brief?.title ?? undefined },
      {
        onSuccess: () => {
          toast.success('Brief saved');
          setEditing(false);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  if (briefQuery.isLoading) return <PaneLoader />;

  return (
    <div className={`nf-page ${styles.pageDetail}`}>
      <div className={styles.recordKind}>CHAPTER {chapter} · BRIEF</div>
      <h1 className={`${styles.title} ${styles.titleBrief}`}>{brief?.title ?? `Chapter ${chapter}`}</h1>
      <div className={styles.briefMeta}>
        {brief ? (
          <StatusChip intent="success" dot>
            Brief ready
          </StatusChip>
        ) : (
          <StatusChip intent="neutral" dot>
            No brief yet
          </StatusChip>
        )}
      </div>

      <div className={styles.briefActions}>
        <Button variant="secondary" onClick={() => navigate({ to: '/novels/$novelId/chapters', params: { novelId } })}>
          Open in chapters →
        </Button>
        {brief && !editing && (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit brief
          </Button>
        )}
      </div>

      <div className={styles.sectionLabel}>Premise / synopsis</div>
      {editing ? (
        <div className={styles.editWrap}>
          <Textarea value={draft} onValueChange={setDraft} minRows={8} autoGrow />
          <div className={styles.editActions}>
            <Button variant="primary" loading={updateBrief.isPending} onClick={save}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className={styles.briefBody}>{brief?.body || 'No brief has been written for this chapter yet.'}</p>
      )}
    </div>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────────

type View =
  | { level: 'volumes' }
  | { level: 'volume'; volume: VolumeResponse }
  | { level: 'arc'; volume: VolumeResponse; arc: ArcResponse }
  | { level: 'brief'; volume: VolumeResponse; arc?: ArcResponse; chapter: number };

function VolumesScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const [view, setView] = useState<View>({ level: 'volumes' });

  const forgeScope = ((): React.ComponentProps<typeof ForgeBar>['scope'] => {
    if (view.level === 'volume') return { type: 'volume', ref: `volume:${view.volume.volumeKey}`, title: view.volume.title ?? `Volume ${view.volume.ordinal}` };
    if (view.level === 'arc') return { type: 'arc', ref: `arc:${view.arc.arcKey}`, title: view.arc.title ?? view.arc.arcKey };
    if (view.level === 'brief') return { type: 'brief', ref: `chapter:${view.chapter}`, title: `Chapter ${view.chapter}` };
    return { type: 'volume_plan', title: 'the volume plan' };
  })();

  return (
    <div className={styles.screen}>
      <div className={styles.crumbBar}>
        <Crumb label="Story Plan" onClick={view.level !== 'volumes' ? () => setView({ level: 'volumes' }) : undefined} current={view.level === 'volumes'} />
        {view.level !== 'volumes' && (
          <>
            <ChevronRightIcon size={15} className={styles.iconTertiary} />
            <Crumb
              label={view.volume.title ?? `Volume ${view.volume.ordinal}`}
              onClick={view.level !== 'volume' ? () => setView({ level: 'volume', volume: view.volume }) : undefined}
              current={view.level === 'volume'}
            />
          </>
        )}
        {(view.level === 'arc' || (view.level === 'brief' && view.arc)) && (
          <>
            <ChevronRightIcon size={15} className={styles.iconTertiary} />
            <Crumb
              label={(view.level === 'arc' ? view.arc : view.arc!).title ?? (view.level === 'arc' ? view.arc : view.arc!).arcKey}
              onClick={view.level === 'brief' ? () => setView({ level: 'arc', volume: view.volume, arc: view.arc! }) : undefined}
              current={view.level === 'arc'}
            />
          </>
        )}
        {view.level === 'brief' && (
          <>
            <ChevronRightIcon size={15} className={styles.iconTertiary} />
            <Crumb label={`Ch. ${view.chapter} · Brief`} current />
          </>
        )}
      </div>

      <div className={styles.body}>
        <div className={`nf-scroll ${styles.scrollFill}`}>
          {view.level === 'volumes' && <VolumesList novelId={novelId} onOpen={volume => setView({ level: 'volume', volume })} />}
          {view.level === 'volume' && <VolumeDetail novelId={novelId} volumeKey={view.volume.volumeKey} onOpenArc={arc => setView({ level: 'arc', volume: view.volume, arc })} />}
          {view.level === 'arc' && (
            <ArcDetail
              novelId={novelId}
              volumeKey={view.volume.volumeKey}
              arcKey={view.arc.arcKey}
              onOpenBrief={chapter => setView({ level: 'brief', volume: view.volume, arc: view.arc, chapter })}
            />
          )}
          {view.level === 'brief' && <BriefDetail novelId={novelId} chapter={view.chapter} />}
        </div>
        <ForgeDockArea novelId={novelId} scope={forgeScope} />
      </div>
    </div>
  );
}
