import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, FormField, IconButton, Input, Select, Textarea, toast, TokenInput } from '@shadow-library/ui';

import { ChevronRightIcon, CloseIcon, GripIcon, PlusIcon, SparkIcon } from '@/components/icons';
import { GenerationStatus, PaneError, PaneLoader, QueryState, RegenerateChapterButton, StatusChip, StopButton } from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';
import { BriefSections, DetailField } from '@/features/briefs';
import {
  type ArcResponse,
  type BriefResponse,
  listVolumesQueryOptions,
  useApproveArcsMutation,
  useApproveVolumesMutation,
  useBriefQuery,
  useDraftSummaryQuery,
  useGenerateMutation,
  useListArcsQuery,
  useListBriefsQuery,
  useListEntitiesQuery,
  useListProposalsQuery,
  useListVolumesQuery,
  useOutlineArcMutation,
  usePlanArcsMutation,
  usePlanMutation,
  useProjectStatusQuery,
  useUpdateBriefMutation,
  useVolumeQuery,
  type VolumeResponse,
} from '@/lib/apis';

import {
  briefBodyText,
  type BriefDraft,
  briefDraftOf,
  type BriefEditModel,
  type BriefEditSection,
  type BriefListItem,
  briefListItem,
  briefSaveOf,
  type EndingDraft,
  HOOK_TYPE_LABELS,
  HOOK_TYPES,
  outlineObjectiveProblem,
  toEditModel,
} from '@/lib/chapter-brief';
import { listedChapters, nextBriefChapter, pageOfChapter } from '@/lib/chapter-list';
import { chapterGeneration } from '@/lib/generation-activity';
import { proposalTitle } from '@/lib/proposals';
import { useGenerationActivity } from '@/lib/use-generation-activity';

import styles from './volumes.module.css';

interface VolumesSearch {
  volume?: string;
  arc?: string;
  chapter?: number;
}

// The drill-down (volume → arc → chapter brief) lives in the URL so a refresh or shared link lands on
// the same record instead of resetting to the volume list.
export const Route = createFileRoute('/novels/$novelId/volumes')({
  validateSearch: (search: Record<string, unknown>): VolumesSearch => {
    const chapter = Number(search.chapter);
    return {
      volume: typeof search.volume === 'string' && search.volume ? search.volume : undefined,
      arc: typeof search.arc === 'string' && search.arc ? search.arc : undefined,
      chapter: Number.isInteger(chapter) && chapter > 0 ? chapter : undefined,
    };
  },
  loader: ({ context, params }) => context.queryClient.prefetchQuery(listVolumesQueryOptions(params.novelId, { limit: 50 })),
  component: VolumesScreen,
});

const PENDING_PROPOSALS_SHOWN = 5;
const NO_POV = '__no_pov__';
const LIST_ITEM_DRAG_TYPE = 'application/x-brief-list-item';
const LIST_END_DROP_ID = '__list_end__';
const EDITING_REASON = 'Save or cancel your edits first';

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

interface ForgeDockAreaProps {
  novelId: string;
  scope: React.ComponentProps<typeof ForgeBar>['scope'];
  placeholder?: string;
}

function ForgeDockArea({ novelId, scope, placeholder }: ForgeDockAreaProps): React.JSX.Element {
  return (
    <div className={styles.forgeDock}>
      <ForgeBar novelId={novelId} scope={scope} placeholder={placeholder} />
    </div>
  );
}

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

      <DetailField label="Objective" value={v.objective} />
      <DetailField label="Central conflict" value={v.conflict} />
      <DetailField label="Payoff" value={v.payoff} />
      {v.body && <DetailField label="Notes" value={v.body} />}

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

      <DetailField label="Objective" value={arc.objective} />
      <DetailField label="Escalation" value={arc.escalation} />
      <DetailField label="Payoff" value={arc.payoff} />
      <DetailField label="Hook (handoff to next arc)" value={arc.hook} />
      {arc.body && <DetailField label="Notes" value={arc.body} />}

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
            <button key={n} className={`${styles.row} ${styles.rowBrief}`} disabled={!brief} onClick={() => onOpenBrief(n)}>
              <span className={styles.briefNum}>{String(n).padStart(2, '0')}</span>
              <span className={styles.briefName}>{brief?.title ?? `Chapter ${n}`}</span>
              <span className={styles.statusCol}>
                {brief ? (
                  <StatusChip intent={brief.staleReason || brief.densityRisk ? 'warning' : 'success'} dot>
                    {brief.staleReason ? 'stale' : brief.densityRisk ? 'too thin' : 'brief ready'}
                  </StatusChip>
                ) : (
                  <StatusChip intent="neutral" dot>
                    no brief
                  </StatusChip>
                )}
              </span>
              {brief && <ChevronRightIcon size={15} className={styles.iconTertiary} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface BriefDetailProps {
  novelId: string;
  chapter: number;
}

function ChapterProposals({ novelId, chapter }: BriefDetailProps): React.JSX.Element | null {
  const proposalsQuery = useListProposalsQuery(novelId, { status: 'pending', chapter, limit: PENDING_PROPOSALS_SHOWN });
  const pending = proposalsQuery.data?.items ?? [];
  const more = (proposalsQuery.data?.total ?? 0) - pending.length;
  if (pending.length === 0) return null;

  return (
    <section className={styles.pendingProposals}>
      <h2 className={styles.sectionLabel}>Waiting for your review</h2>
      {pending.map(proposal => (
        <Link key={proposal.id} to="/novels/$novelId/review" params={{ novelId }} search={{ view: 'proposals', proposal: proposal.id }} className={styles.pendingProposal}>
          <span className={styles.pendingSummary}>{proposalTitle(proposal)}</span>
          {proposal.warnings.length > 0 && <StatusChip intent="warning">{proposal.warnings.length === 1 ? '1 warning' : `${proposal.warnings.length} warnings`}</StatusChip>}
          <span className={styles.pendingLink}>Review →</span>
        </Link>
      ))}
      {more > 0 && (
        <Link to="/novels/$novelId/review" params={{ novelId }} search={{ view: 'proposals' }} className={styles.pendingMore}>
          {more} more waiting in Review →
        </Link>
      )}
    </section>
  );
}

function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(to, 0, item);
  return next;
}

interface EditFieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function EditField({ label, hint, children }: EditFieldProps): React.JSX.Element {
  return (
    <section className={styles.briefSection}>
      <div className={styles.editLabelRow}>
        <h2 className={`${styles.sectionLabel} ${styles.editLabel}`}>{label}</h2>
        {hint && <span className={styles.editHint}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

type PendingFocus = { target: 'field' | 'handle'; id: string } | { target: 'add' };

interface ListEditorProps {
  items: BriefListItem[];
  onChange: (items: BriefListItem[]) => void;
  noun: string;
  addLabel: string;
}

function ListEditor({ items, onChange, noun, addLabel }: ListEditorProps): React.JSX.Element {
  const fields = useRef(new Map<string, HTMLTextAreaElement>());
  const handles = useRef(new Map<string, HTMLElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<PendingFocus | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    if (pending.target === 'add') return addButton.current?.focus();
    (pending.target === 'field' ? fields : handles).current.get(pending.id)?.focus();
  });

  useEffect(() => {
    if (!armedId) return;
    const disarm = (): void => setArmedId(null);
    window.addEventListener('pointerup', disarm);
    window.addEventListener('pointercancel', disarm);
    return () => {
      window.removeEventListener('pointerup', disarm);
      window.removeEventListener('pointercancel', disarm);
    };
  }, [armedId]);

  const insertAt = (index: number): void => {
    const item = briefListItem();
    pendingFocus.current = { target: 'field', id: item.id };
    onChange([...items.slice(0, index), item, ...items.slice(index)]);
  };

  const removeAt = (index: number, towards: 'previous' | 'next'): void => {
    const neighbour = towards === 'previous' ? (items[index - 1] ?? items[index + 1]) : (items[index + 1] ?? items[index - 1]);
    pendingFocus.current = neighbour ? { target: 'field', id: neighbour.id } : { target: 'add' };
    onChange(items.filter((_, position) => position !== index));
  };

  const move = (from: number, to: number): void => {
    const item = items[from];
    if (!item || to < 0 || to >= items.length || from === to) return;
    pendingFocus.current = { target: 'handle', id: item.id };
    onChange(moved(items, from, to));
  };

  const dropBefore = (index: number): void => {
    const from = items.findIndex(entry => entry.id === dragId);
    if (from >= 0) move(from, from < index ? index - 1 : index);
  };

  const endDrag = (): void => {
    setArmedId(null);
    setDragId(null);
    setOverId(null);
  };

  const onDropTargetDragOver = (event: React.DragEvent, id: string): void => {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOverId(id);
  };

  const onDropTargetDragLeave = (event: React.DragEvent, id: string): void => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOverId(current => (current === id ? null : current));
  };

  const onDropTargetDrop = (event: React.DragEvent, index: number): void => {
    if (!dragId) return;
    event.preventDefault();
    dropBefore(index);
    endDrag();
  };

  const onHandleKeyDown = (event: React.KeyboardEvent, index: number): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    move(index, event.key === 'ArrowUp' ? index - 1 : index + 1);
  };

  const onFieldKeyDown = (event: React.KeyboardEvent, item: BriefListItem, index: number): void => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      insertAt(index + 1);
    } else if (event.key === 'Backspace' && item.text === '') {
      event.preventDefault();
      removeAt(index, 'previous');
    }
  };

  return (
    <div className={styles.listEditor}>
      {items.length > 0 && (
        <ol className={styles.listRows}>
          {items.map((item, index) => (
            <li
              key={item.id}
              draggable={armedId === item.id}
              className={`${styles.listRow} ${overId === item.id && dragId !== item.id ? styles.listRowOver : ''} ${dragId === item.id ? styles.listRowDragging : ''}`}
              onDragStart={event => {
                if (event.target !== event.currentTarget) return;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData(LIST_ITEM_DRAG_TYPE, item.id);
                setDragId(item.id);
              }}
              onDragEnd={endDrag}
              onDragOver={event => onDropTargetDragOver(event, item.id)}
              onDragLeave={event => onDropTargetDragLeave(event, item.id)}
              onDrop={event => onDropTargetDrop(event, index)}
            >
              {/* A span, not a button: Firefox never starts a drag from inside a <button>. */}
              <span
                role="button"
                tabIndex={0}
                ref={node => {
                  if (node) handles.current.set(item.id, node);
                  else handles.current.delete(item.id);
                }}
                className={styles.dragHandle}
                aria-label={`Reorder ${noun} ${index + 1} — drag, or press the up and down arrow keys`}
                title="Drag to reorder"
                onPointerDown={() => setArmedId(item.id)}
                onKeyDown={event => onHandleKeyDown(event, index)}
              >
                <GripIcon size={14} />
              </span>
              <Textarea
                ref={node => {
                  if (node) fields.current.set(item.id, node);
                  else fields.current.delete(item.id);
                }}
                className={styles.listField}
                value={item.text}
                onValueChange={text => onChange(items.map(entry => (entry.id === item.id ? { ...entry, text } : entry)))}
                onKeyDown={event => onFieldKeyDown(event, item, index)}
                minRows={1}
                autoGrow
                aria-label={`${noun} ${index + 1}`}
              />
              <IconButton size="sm" icon={<CloseIcon />} aria-label={`Remove ${noun} ${index + 1}`} onClick={() => removeAt(index, 'next')} />
            </li>
          ))}
        </ol>
      )}
      {dragId && (
        <div
          className={`${styles.listDropEnd} ${overId === LIST_END_DROP_ID ? styles.listDropEndOver : ''}`}
          onDragOver={event => onDropTargetDragOver(event, LIST_END_DROP_ID)}
          onDragLeave={event => onDropTargetDragLeave(event, LIST_END_DROP_ID)}
          onDrop={event => onDropTargetDrop(event, items.length)}
        />
      )}
      <button ref={addButton} type="button" className={styles.addRow} onClick={() => insertAt(items.length)}>
        <PlusIcon size={14} />
        {addLabel}
      </button>
    </div>
  );
}

interface BodyFieldsProps {
  model: BriefEditModel;
  onChange: (model: BriefEditModel) => void;
}

function LabelledSectionFields({ section, onChange }: { section: BriefEditSection; onChange: (section: BriefEditSection) => void }): React.JSX.Element {
  const label = section.heading ?? 'Notes';
  return (
    <EditField label={label}>
      <div className={styles.editStack}>
        {section.layout !== 'list' && <Textarea value={section.text} onValueChange={text => onChange({ ...section, text })} minRows={2} autoGrow aria-label={label} />}
        {section.layout !== 'text' && <ListEditor items={section.items} onChange={items => onChange({ ...section, items })} noun="item" addLabel="Add item" />}
      </div>
    </EditField>
  );
}

function BodyFields({ model, onChange }: BodyFieldsProps): React.JSX.Element {
  if (model.shape === 'labelled') {
    return (
      <>
        {model.sections.map(section => (
          <LabelledSectionFields
            key={section.id}
            section={section}
            onChange={next => onChange({ ...model, sections: model.sections.map(entry => (entry.id === next.id ? next : entry)) })}
          />
        ))}
      </>
    );
  }

  return (
    <>
      <EditField label="Objective" hint="What the chapter must accomplish">
        <Textarea value={model.objective} onValueChange={objective => onChange({ ...model, objective })} minRows={2} autoGrow aria-label="Objective" />
      </EditField>
      <EditField label="Beats">
        <ListEditor items={model.beats} onChange={beats => onChange({ ...model, beats })} noun="beat" addLabel="Add beat" />
      </EditField>
      <EditField label="Continuity" hint="Carries into the next chapter">
        <ListEditor items={model.continuity} onChange={continuity => onChange({ ...model, continuity })} noun="note" addLabel="Add note" />
      </EditField>
    </>
  );
}

interface PovSelectProps {
  novelId: string;
  value: string;
  onChange: (pov: string) => void;
}

function PovSelect({ novelId, value, onChange }: PovSelectProps): React.JSX.Element {
  const charactersQuery = useListEntitiesQuery(novelId, { type: 'character', limit: 500 });
  const characters = [...(charactersQuery.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const unlisted = value !== '' && !characters.some(character => character.entityKey === value);

  return (
    <Select value={value || NO_POV} onValueChange={next => onChange(next === NO_POV ? '' : next)} loading={charactersQuery.isLoading} aria-label="POV" className={styles.povSelect}>
      <Select.Item value={NO_POV}>No POV</Select.Item>
      {unlisted && <Select.Item value={value}>{value}</Select.Item>}
      {characters.map(character => (
        <Select.Item key={character.entityKey} value={character.entityKey}>
          {character.name}
        </Select.Item>
      ))}
    </Select>
  );
}

interface EndingEditorProps {
  ending: EndingDraft;
  missing: string[];
  onChange: (ending: EndingDraft) => void;
}

function EndingEditor({ ending, missing, onChange }: EndingEditorProps): React.JSX.Element {
  const set = <K extends keyof EndingDraft>(key: K, value: EndingDraft[K]): void => onChange({ ...ending, [key]: value });
  const invalid = (label: string): boolean => missing.includes(label);

  return (
    <EditField label="Ending">
      <div className={styles.endingEditGrid}>
        <span className={styles.endingEditLabel}>Hook</span>
        <Select
          value={ending.hookType}
          onValueChange={value => set('hookType', HOOK_TYPES.find(hook => hook === value) ?? '')}
          placeholder="Choose a hook"
          invalid={invalid('Hook')}
          aria-label="Hook"
        >
          {HOOK_TYPES.map(hook => (
            <Select.Item key={hook} value={hook}>
              {HOOK_TYPE_LABELS[hook]}
            </Select.Item>
          ))}
        </Select>
        <span className={styles.endingEditLabel}>Feeling</span>
        <Input value={ending.emotionalBeat} onValueChange={value => set('emotionalBeat', value)} invalid={invalid('Feeling')} aria-label="Feeling" />
        <span className={styles.endingEditLabel}>Open question</span>
        <Input value={ending.openQuestion} onValueChange={value => set('openQuestion', value)} invalid={invalid('Open question')} aria-label="Open question" />
        <span className={styles.endingEditLabel}>Hands off</span>
        <Input value={ending.handoffState} onValueChange={value => set('handoffState', value)} invalid={invalid('Hands off')} aria-label="Hands off" />
        <span className={styles.endingEditLabel}>Leave open</span>
        <TokenInput
          value={ending.mustNotResolve.map(entry => ({ value: entry, valid: true }))}
          onValueChange={tokens => set('mustNotResolve', tokens.map(token => token.value.trim()).filter(Boolean))}
          separators={['Enter']}
          placeholder="Add and press Enter"
          aria-label="Leave open"
        />
      </div>
      {missing.length > 0 && <p className={styles.editError}>An ending needs {missing.join(', ')} — fill them in, or empty every ending field to remove it.</p>}
    </EditField>
  );
}

interface BriefEditorProps {
  novelId: string;
  brief: BriefResponse;
  draft: BriefDraft;
  endingMissing: string[];
  onChange: (draft: BriefDraft) => void;
}

function BriefEditor({ novelId, brief, draft, endingMissing, onChange }: BriefEditorProps): React.JSX.Element {
  const [toggleRefused, setToggleRefused] = useState(false);
  const readerValue = (brief.readerValue ?? []).map(value => value.replace(/_/g, ' ')).join(', ');
  const repetitionRisks = (brief.repetitionRisks ?? []).join('; ');
  const plannerNotes = [readerValue && `Delivers: ${readerValue}`, repetitionRisks && `Avoid repeating: ${repetitionRisks}`].filter(Boolean).join(' · ');
  const plainText = draft.plainBody !== null;
  const toggleProblem = toggleRefused && !plainText ? outlineObjectiveProblem(draft.body) : null;

  const togglePlainText = (): void => {
    if (draft.plainBody !== null) return onChange({ ...draft, body: toEditModel(draft.plainBody), plainBody: null });
    if (outlineObjectiveProblem(draft.body)) return setToggleRefused(true);
    setToggleRefused(false);
    onChange({ ...draft, plainBody: briefBodyText(draft) });
  };

  return (
    <div className={styles.briefSections}>
      <EditField label="Purpose" hint="Why this chapter exists in the arc">
        <Textarea value={draft.chapterPurpose} onValueChange={chapterPurpose => onChange({ ...draft, chapterPurpose })} minRows={2} autoGrow aria-label="Purpose" />
      </EditField>
      {plainText ? (
        <EditField label="Brief" hint="One entry per line">
          <Textarea value={draft.plainBody ?? ''} onValueChange={plainBody => onChange({ ...draft, plainBody })} minRows={8} autoGrow aria-label="Brief as plain text" />
        </EditField>
      ) : (
        <BodyFields model={draft.body} onChange={body => onChange({ ...draft, body })} />
      )}
      <EditField label="POV">
        <PovSelect novelId={novelId} value={draft.pov} onChange={pov => onChange({ ...draft, pov })} />
      </EditField>
      <EndingEditor ending={draft.ending} missing={endingMissing} onChange={ending => onChange({ ...draft, ending })} />
      <EditField label="Author guidance">
        <Textarea value={draft.guidance} onValueChange={guidance => onChange({ ...draft, guidance })} minRows={2} autoGrow aria-label="Author guidance" />
      </EditField>
      {plannerNotes && (
        <EditField label="Planner notes" hint="Set by the planner · read-only">
          <p className={styles.plannerNotes}>{plannerNotes}</p>
        </EditField>
      )}
      <button type="button" className={`${styles.inlineLink} ${styles.plainToggle}`} onClick={togglePlainText}>
        {plainText ? 'Edit as separate fields' : draft.body.shape === 'outline' ? 'Edit objective, beats and continuity as plain text' : 'Edit these sections as plain text'}
      </button>
      {toggleProblem && <p className={`${styles.editError} ${styles.toggleError}`}>{toggleProblem}</p>}
    </div>
  );
}

interface BriefEdit {
  base: BriefResponse;
  draft: BriefDraft;
}

function BriefDetail({ novelId, chapter }: BriefDetailProps): React.JSX.Element {
  const navigate = useNavigate();
  const briefQuery = useBriefQuery(novelId, chapter);
  const draftsQuery = useDraftSummaryQuery(novelId);
  const briefsQuery = useListBriefsQuery(novelId);
  const statusQuery = useProjectStatusQuery(novelId);
  const updateBrief = useUpdateBriefMutation(novelId, chapter);
  const generate = useGenerateMutation(novelId);
  const { activity, stop, stopping } = useGenerationActivity(novelId);
  const [edit, setEdit] = useState<BriefEdit | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const brief = briefQuery.data;
  const editing = edit !== null;
  const saveState = edit ? briefSaveOf(edit.base, edit.draft, brief?.body ?? edit.base.body) : null;
  const dirty = saveState !== null && saveState.kind !== 'unchanged';
  const invalid = saveState?.kind === 'invalid' && showErrors ? saveState : null;
  const changedElsewhere = Boolean(edit && brief && brief.updatedAt !== edit.base.updatedAt);

  const summaries = draftsQuery.data?.items ?? [];
  const briefs = briefsQuery.data?.items ?? [];
  const chapterDraft = summaries.find(item => item.chapter === chapter);
  const generation = chapterGeneration(activity, chapter);
  const busyReason = activity && !generation ? `Chapter ${activity.current} is being written — wait for it to finish` : undefined;
  const regenerable = Boolean(brief && chapterDraft && chapterDraft.status !== 'final');
  const staleReason = brief?.staleReason ? `The brief is stale (${brief.staleReason}) — refresh the outline before regenerating.` : undefined;
  const regenerateBlocked = editing ? EDITING_REASON : (staleReason ?? busyReason);

  // Generation gates mirror the backend (PLN_001 / DRF_003 / BRF_002); `generate` only ever writes the lowest unwritten brief.
  const generatable = Boolean(brief && !chapterDraft && nextBriefChapter(briefs, summaries) === chapter);
  const contradicted = summaries.find(item => item.reviewStatus === 'contradiction');
  const generateBlocked = editing
    ? EDITING_REASON
    : brief?.staleReason
      ? `The brief is stale (${brief.staleReason}) — refresh the outline first.`
      : !statusQuery.data?.planApproved
        ? 'Approve the volume plan first'
        : contradicted
          ? `Resolve chapter ${contradicted.chapter}’s flagged contradiction first`
          : busyReason;

  const runGenerate = (): void => {
    generate.mutate({ limit: 1, autoFix: true }, { onError: err => toast.danger(err.message) });
  };

  const openInChapters = (): Promise<void> => {
    if (chapterDraft) return navigate({ to: '/novels/$novelId/chapters', params: { novelId }, search: { chapter } });
    const page = pageOfChapter(listedChapters(briefs, summaries), chapter);
    return navigate({ to: '/novels/$novelId/chapters', params: { novelId }, search: { page: page > 1 ? page : undefined } });
  };
  const briefIsNewer = Boolean(brief && chapterDraft && !staleReason && new Date(brief.updatedAt) > new Date(chapterDraft.writtenAt));

  const setDraft = (draft: BriefDraft): void => setEdit(current => (current ? { ...current, draft } : current));

  const startEditing = (): void => {
    if (!brief) return;
    setEdit({ base: brief, draft: briefDraftOf(brief) });
    setShowErrors(false);
  };

  const cancel = (): void => {
    setEdit(null);
    setShowErrors(false);
  };

  const save = (): void => {
    if (!saveState || saveState.kind === 'unchanged') return cancel();
    if (saveState.kind === 'invalid') return setShowErrors(true);
    updateBrief.mutate(saveState.update, {
      onSuccess: () => {
        toast.success('Brief saved');
        cancel();
      },
      onError: err => toast.danger(err.message),
    });
  };

  if (briefQuery.isLoading) return <PaneLoader />;

  return (
    <div className={`nf-page ${styles.pageDetail}`}>
      <div className={styles.recordKind}>
        CHAPTER {chapter} · BRIEF{editing ? ' · EDITING' : ''}
      </div>
      {edit ? (
        <input
          className={`${styles.title} ${styles.titleBrief} ${styles.titleInput}`}
          value={edit.draft.title}
          onChange={event => setDraft({ ...edit.draft, title: event.target.value })}
          placeholder={`Chapter ${chapter}`}
          aria-label="Title"
          aria-invalid={invalid?.missing.includes('Title') || undefined}
        />
      ) : (
        <h1 className={`${styles.title} ${styles.titleBrief}`}>{brief?.title ?? `Chapter ${chapter}`}</h1>
      )}
      <div className={styles.briefMeta}>
        {brief ? (
          <StatusChip intent={brief.staleReason ? 'warning' : 'success'} dot>
            {brief.staleReason ? 'Brief is stale' : 'Brief ready'}
          </StatusChip>
        ) : (
          <StatusChip intent="neutral" dot>
            No brief yet
          </StatusChip>
        )}
      </div>

      <div className={styles.briefActions}>
        <Button variant="secondary" onClick={openInChapters}>
          {chapterDraft ? 'Open chapter →' : 'Show in chapter list →'}
        </Button>
        {brief && !editing && (
          <Button variant="ghost" onClick={startEditing}>
            Edit brief
          </Button>
        )}
        {generation ? (
          <span className={styles.briefGeneration}>
            <GenerationStatus generation={generation} label={chapterDraft ? 'Regenerating' : 'Writing'} />
            {generation.phase === 'writing' && <StopButton onStop={stop} stopping={stopping} />}
          </span>
        ) : (
          <>
            {generatable && (
              <Button variant="primary" prefix={<SparkIcon />} loading={generate.isPending} disabled={Boolean(generateBlocked)} onClick={runGenerate}>
                Generate chapter
              </Button>
            )}
            {generatable && generateBlocked && <span className={styles.actionReason}>{generateBlocked}</span>}
            {regenerable && !briefIsNewer && <RegenerateChapterButton novelId={novelId} chapter={chapter} label="Regenerate chapter" disabledReason={regenerateBlocked} />}
          </>
        )}
      </div>

      {!generation && regenerable && briefIsNewer && (
        <div className={styles.regenerateCallout}>
          <p className={styles.regenerateNote}>The brief changed after chapter {chapter} was drafted. Regenerate it to write the chapter from the updated plan.</p>
          <RegenerateChapterButton novelId={novelId} chapter={chapter} variant="primary" disabledReason={editing ? EDITING_REASON : busyReason} />
        </div>
      )}

      <ChapterProposals novelId={novelId} chapter={chapter} />

      {edit ? (
        <>
          {changedElsewhere && <p className={styles.editNotice}>This brief was changed elsewhere while you were editing. Saving overwrites only the fields you changed here.</p>}
          <BriefEditor novelId={novelId} brief={edit.base} draft={edit.draft} endingMissing={invalid?.endingMissing ?? []} onChange={setDraft} />
          <div className={styles.saveBar}>
            {invalid ? <span className={styles.saveError}>{invalid.problems.join(' ')}</span> : dirty && <span className={styles.unsaved}>● Unsaved changes</span>}
            <div className={styles.spacer} />
            <Button variant="ghost" onClick={cancel} disabled={updateBrief.isPending}>
              Cancel
            </Button>
            <Button variant="primary" loading={updateBrief.isPending} onClick={save}>
              Save brief
            </Button>
          </div>
        </>
      ) : brief ? (
        <BriefSections brief={brief} />
      ) : (
        <p className={styles.briefBody}>No brief has been written for this chapter yet.</p>
      )}
    </div>
  );
}

function VolumesScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { volume: volumeKey, arc: arcKey, chapter } = Route.useSearch();
  const navigate = Route.useNavigate();

  const level = chapter != null ? 'brief' : arcKey && volumeKey ? 'arc' : volumeKey ? 'volume' : 'volumes';

  const volumeQuery = useVolumeQuery(novelId, volumeKey ?? '', Boolean(volumeKey));
  const arcsQuery = useListArcsQuery(novelId, volumeKey, Boolean(volumeKey) && (Boolean(arcKey) || chapter != null));
  const volumeTitle = volumeQuery.data ? (volumeQuery.data.title ?? `Volume ${volumeQuery.data.ordinal}`) : (volumeKey ?? '');
  const arcTitle = arcsQuery.data?.arcs.find(a => a.arcKey === arcKey)?.title ?? arcKey ?? '';

  const goVolumes = (): Promise<void> => navigate({ search: {} });
  const goVolume = (key: string): Promise<void> => navigate({ search: { volume: key } });
  const goArc = (key: string): Promise<void> => navigate({ search: { volume: volumeKey, arc: key } });
  const goBrief = (n: number): Promise<void> => navigate({ search: { volume: volumeKey, arc: arcKey, chapter: n } });

  const forgeScope = ((): React.ComponentProps<typeof ForgeBar>['scope'] => {
    if (level === 'volume') return { type: 'volume', ref: `volume:${volumeKey}`, title: volumeTitle };
    if (level === 'arc') return { type: 'arc', ref: `arc:${arcKey}`, title: arcTitle };
    if (level === 'brief') return { type: 'brief', ref: `chapter:${chapter}`, title: `Chapter ${chapter}` };
    return { type: 'volume_plan', title: 'the volume plan' };
  })();

  return (
    <div className={styles.screen}>
      <div className={styles.crumbBar}>
        <Crumb label="Story Plan" onClick={level !== 'volumes' ? goVolumes : undefined} current={level === 'volumes'} />
        {level !== 'volumes' && volumeKey && (
          <>
            <ChevronRightIcon size={15} className={styles.iconTertiary} />
            <Crumb label={volumeTitle || volumeKey} onClick={level !== 'volume' ? () => goVolume(volumeKey) : undefined} current={level === 'volume'} />
          </>
        )}
        {arcKey && (level === 'arc' || level === 'brief') && (
          <>
            <ChevronRightIcon size={15} className={styles.iconTertiary} />
            <Crumb label={arcTitle || arcKey} onClick={level === 'brief' ? () => goArc(arcKey) : undefined} current={level === 'arc'} />
          </>
        )}
        {level === 'brief' && (
          <>
            <ChevronRightIcon size={15} className={styles.iconTertiary} />
            <Crumb label={`Ch. ${chapter} · Brief`} current />
          </>
        )}
      </div>

      <div className={styles.body}>
        <div className={`nf-scroll ${styles.scrollFill}`}>
          {level === 'volumes' && <VolumesList novelId={novelId} onOpen={volume => goVolume(volume.volumeKey)} />}
          {level === 'volume' && volumeKey != null && <VolumeDetail novelId={novelId} volumeKey={volumeKey} onOpenArc={arc => goArc(arc.arcKey)} />}
          {level === 'arc' && volumeKey != null && arcKey != null && <ArcDetail novelId={novelId} volumeKey={volumeKey} arcKey={arcKey} onOpenBrief={goBrief} />}
          {level === 'brief' && chapter != null && <BriefDetail key={chapter} novelId={novelId} chapter={chapter} />}
        </div>
        <ForgeDockArea novelId={novelId} scope={forgeScope} />
      </div>
    </div>
  );
}
