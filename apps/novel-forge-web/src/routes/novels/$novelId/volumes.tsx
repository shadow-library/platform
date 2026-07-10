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

export const Route = createFileRoute('/novels/$novelId/volumes')({
  component: VolumesScreen,
});

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function roman(ordinal: number): string {
  return ROMAN[ordinal - 1] ?? String(ordinal);
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--sh-text-tertiary)',
  marginBottom: 9,
};

interface CrumbProps {
  label: string;
  onClick?: () => void;
  current?: boolean;
}

function Crumb({ label, onClick, current }: CrumbProps): React.JSX.Element {
  if (current || !onClick) return <span style={{ color: 'var(--sh-text-primary)', fontSize: 'var(--sh-text-body-sm)', fontWeight: 700, padding: '5px 7px' }}>{label}</span>;
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        background: 'transparent',
        color: 'var(--sh-text-secondary)',
        fontSize: 'var(--sh-text-body-sm)',
        fontWeight: 600,
        cursor: 'pointer',
        padding: '5px 7px',
        borderRadius: 6,
      }}
    >
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
      <div style={SECTION_LABEL}>{label}</div>
      <p style={{ margin: '0 0 30px', fontSize: 'var(--sh-text-body)', lineHeight: 1.7, maxWidth: 660 }}>{value}</p>
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
    <div
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 22,
        width: 'min(680px, calc(100% - 60px))',
        display: 'flex',
        justifyContent: 'center',
        zIndex: 5,
      }}
    >
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
          <div style={{ display: 'flex', gap: 12 }}>
            <FormField label="Volumes" style={{ flex: 1 }}>
              <Input type="number" min={1} max={12} value={volumeCount} onValueChange={setVolumeCount} />
            </FormField>
            <FormField label="Chapters per volume" style={{ flex: 1 }}>
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
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '32px 32px 120px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: '0 0 5px', fontSize: 'var(--sh-text-h1)', fontWeight: 700, letterSpacing: '-0.02em' }}>Story Plan</h1>
          <p style={{ margin: 0, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)' }}>Volumes → arcs → chapter briefs · {volumes.length} volumes planned</p>
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
        <div style={{ marginTop: 20, borderTop: '1px solid var(--sh-border-subtle)' }}>
          {volumes.map(v => (
            <button
              key={v.id}
              className="nf-selrow"
              onClick={() => onOpen(v)}
              style={{ gap: 18, padding: '16px 12px', borderRadius: 0, borderBottom: '1px solid var(--sh-border-subtle)' }}
            >
              <span style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 15, fontWeight: 700, width: 32, flexShrink: 0, textAlign: 'center' }}>{roman(v.ordinal)}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ display: 'block', fontSize: 'var(--sh-text-body)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {v.title ?? `Volume ${v.ordinal}`}
                </span>
                {v.objective && (
                  <span
                    style={{ display: 'block', fontSize: 12, color: 'var(--sh-text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {v.objective}
                  </span>
                )}
              </span>
              {v.startChapter != null && v.endChapter != null && (
                <span style={{ fontSize: 12, color: 'var(--sh-text-tertiary)', width: 86, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  Ch {v.startChapter}–{v.endChapter}
                </span>
              )}
              <span style={{ width: 110, flexShrink: 0 }}>
                <StatusChip intent={v.status === 'approved' ? 'success' : v.status === 'source' ? 'info' : 'neutral'} dot>
                  {v.status}
                </StatusChip>
              </span>
              <ChevronRightIcon size={15} style={{ color: 'var(--sh-text-tertiary)', flexShrink: 0 }} />
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
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 32px 130px' }}>
      <div style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 12, letterSpacing: '0.06em', color: 'var(--sh-text-tertiary)', marginBottom: 8 }}>VOLUME {roman(v.ordinal)}</div>
      <h1 style={{ margin: '0 0 6px', fontSize: 'var(--sh-text-h1)', fontWeight: 700, letterSpacing: '-0.02em' }}>{v.title ?? `Volume ${v.ordinal}`}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--sh-text-tertiary)', marginBottom: 30 }}>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 'var(--sh-text-h3)', fontWeight: 700 }}>Arcs</h2>
        <div style={{ flex: 1 }} />
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
        <p style={{ margin: '0 0 30px', fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)', lineHeight: 1.6 }}>
          No arcs yet. Generate arcs to split this volume&apos;s {end - start + 1} chapters into escalating story units — the plan lands as a proposal you review before it becomes
          canon.
          {planArcs.isSuccess && (
            <>
              {' '}
              <button
                onClick={() => navigate({ to: '/novels/$novelId/proposals', params: { novelId } })}
                style={{ border: 'none', background: 'transparent', color: 'var(--sh-accent)', cursor: 'pointer', fontSize: 'inherit', padding: 0, fontWeight: 600 }}
              >
                Open Proposals →
              </button>
            </>
          )}
        </p>
      ) : (
        <div style={{ borderTop: '1px solid var(--sh-border-subtle)', marginBottom: 30 }}>
          {arcs.map(arc => (
            <button
              key={arc.arcKey}
              className="nf-selrow"
              onClick={() => onOpenArc(arc)}
              style={{ gap: 14, padding: '14px 12px', borderRadius: 0, borderBottom: '1px solid var(--sh-border-subtle)' }}
            >
              <span style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 12, color: 'var(--sh-text-tertiary)', width: 22, flexShrink: 0 }}>{arc.ordinal}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ display: 'block', fontSize: 'var(--sh-text-body)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {arc.title ?? arc.arcKey}
                </span>
                {arc.objective && (
                  <span
                    style={{ display: 'block', fontSize: 12, color: 'var(--sh-text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {arc.objective}
                  </span>
                )}
              </span>
              {arc.chapterStart != null && arc.chapterEnd != null && (
                <span style={{ fontSize: 12, color: 'var(--sh-text-tertiary)', width: 86, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  Ch {arc.chapterStart}–{arc.chapterEnd}
                </span>
              )}
              <span style={{ width: 100, flexShrink: 0 }}>
                <StatusChip intent={arc.status === 'approved' ? 'success' : 'neutral'} dot>
                  {arc.staleReason ? 'stale' : arc.status}
                </StatusChip>
              </span>
              <ChevronRightIcon size={15} style={{ color: 'var(--sh-text-tertiary)', flexShrink: 0 }} />
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
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 32px 130px' }}>
      <div style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 12, letterSpacing: '0.06em', color: 'var(--sh-text-tertiary)', marginBottom: 8 }}>ARC {arc.ordinal}</div>
      <h1 style={{ margin: '0 0 6px', fontSize: 'var(--sh-text-h1)', fontWeight: 700, letterSpacing: '-0.02em' }}>{arc.title ?? arc.arcKey}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--sh-text-tertiary)', marginBottom: 30 }}>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 'var(--sh-text-h3)', fontWeight: 700 }}>Chapter briefs</h2>
        <span style={{ fontSize: 12, color: 'var(--sh-text-tertiary)' }}>
          {chapters.length - missing} of {chapters.length} written
        </span>
        <div style={{ flex: 1 }} />
        <Button variant={missing > 0 ? 'primary' : 'ghost'} size="sm" prefix={<SparkIcon />} loading={outlineArc.isPending} onClick={generateBriefs}>
          {missing > 0 ? 'Generate briefs' : 'Regenerate briefs'}
        </Button>
      </div>
      {arc.status !== 'approved' && (
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--sh-text-tertiary)' }}>
          Brief generation needs every arc in this volume approved first — approve arcs from the volume page.
        </p>
      )}
      <div style={{ borderTop: '1px solid var(--sh-border-subtle)' }}>
        {chapters.map(n => {
          const brief = briefByChapter.get(n);
          return (
            <button
              key={n}
              className="nf-selrow"
              onClick={() => onOpenBrief(n)}
              style={{ gap: 14, padding: '13px 12px', borderRadius: 0, borderBottom: '1px solid var(--sh-border-subtle)' }}
            >
              <span style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 12, color: 'var(--sh-text-tertiary)', width: 30, flexShrink: 0 }}>{String(n).padStart(2, '0')}</span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  fontSize: 'var(--sh-text-body-sm)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {brief?.title ?? `Chapter ${n}`}
              </span>
              <span style={{ width: 110, flexShrink: 0 }}>
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
              <ChevronRightIcon size={15} style={{ color: 'var(--sh-text-tertiary)', flexShrink: 0 }} />
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
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 32px 130px' }}>
      <div style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 12, letterSpacing: '0.06em', color: 'var(--sh-text-tertiary)', marginBottom: 8 }}>CHAPTER {chapter} · BRIEF</div>
      <h1 style={{ margin: '0 0 10px', fontSize: 'var(--sh-text-h1)', fontWeight: 700, letterSpacing: '-0.02em' }}>{brief?.title ?? `Chapter ${chapter}`}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
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

      <div style={{ display: 'flex', gap: 10, marginBottom: 34 }}>
        <Button variant="secondary" onClick={() => navigate({ to: '/novels/$novelId/chapters', params: { novelId } })}>
          Open in chapters →
        </Button>
        {brief && !editing && (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit brief
          </Button>
        )}
      </div>

      <div style={SECTION_LABEL}>Premise / synopsis</div>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 30 }}>
          <Textarea value={draft} onValueChange={setDraft} minRows={8} autoGrow />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" loading={updateBrief.isPending} onClick={save}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p style={{ margin: '0 0 30px', fontSize: 'var(--sh-text-body)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {brief?.body || 'No brief has been written for this chapter yet.'}
        </p>
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
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--sh-surface-app)', overflow: 'hidden' }}>
      <div style={{ height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '0 22px' }}>
        <Crumb label="Story Plan" onClick={view.level !== 'volumes' ? () => setView({ level: 'volumes' }) : undefined} current={view.level === 'volumes'} />
        {view.level !== 'volumes' && (
          <>
            <ChevronRightIcon size={15} style={{ color: 'var(--sh-text-tertiary)' }} />
            <Crumb
              label={view.volume.title ?? `Volume ${view.volume.ordinal}`}
              onClick={view.level !== 'volume' ? () => setView({ level: 'volume', volume: view.volume }) : undefined}
              current={view.level === 'volume'}
            />
          </>
        )}
        {(view.level === 'arc' || (view.level === 'brief' && view.arc)) && (
          <>
            <ChevronRightIcon size={15} style={{ color: 'var(--sh-text-tertiary)' }} />
            <Crumb
              label={(view.level === 'arc' ? view.arc : view.arc!).title ?? (view.level === 'arc' ? view.arc : view.arc!).arcKey}
              onClick={view.level === 'brief' ? () => setView({ level: 'arc', volume: view.volume, arc: view.arc! }) : undefined}
              current={view.level === 'arc'}
            />
          </>
        )}
        {view.level === 'brief' && (
          <>
            <ChevronRightIcon size={15} style={{ color: 'var(--sh-text-tertiary)' }} />
            <Crumb label={`Ch. ${view.chapter} · Brief`} current />
          </>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div className="nf-scroll" style={{ position: 'absolute', inset: 0 }}>
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
