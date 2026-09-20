import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Dialog, FormField, Input, Select, Spinner, Textarea, toast, Tooltip } from '@shadow-library/ui';

import { ImageIcon, SearchIcon, SparkIcon, TrashIcon } from '@/components/icons';
import { useCollectionJump } from '@/components/Layout';
import { type ChipIntent, CollectionPage, DetailPage, EmptyState, ItemPager, type ItemPagerJump, PaneError, PaneLoader, RowAction, StatusChip } from '@/components/nf';
import { CandidateReferences, IllustrationReferencesPanel, StartReferencesSection } from '@/features/illustrations/ReferenceImages';
import {
  type AppearanceConfidenceLevel,
  type AppearanceDescriptionResponse,
  type IllustrationCandidateResponse,
  type IllustrationResponse,
  type IllustrationSaveTarget,
  type IllustrationStatus,
  type IllustrationSubjectType,
  listIllustrationsQueryOptions,
  type ReferenceWarningResponse,
  type RefineIllustrationBody,
  useDiscardIllustrationMutation,
  useListEntitiesQuery,
  useListIllustrationsQuery,
  useReferenceOptionsQuery,
  useRefineIllustrationMutation,
  useSaveIllustrationMutation,
  useSelectIllustrationMutation,
  useStartIllustrationMutation,
  useUpdateEntityMutation,
} from '@/lib/apis';
import { relativeTime } from '@/lib/format';
import {
  candidateSlots,
  countBySubject,
  FILTER_LABEL,
  filterIllustrations,
  identityMeta,
  illustrationCaption,
  parseSubjectType,
  type SubjectFilter,
  subjectLabel,
  thumbnailOf,
} from '@/lib/illustration-board';
import {
  buildAttachPayload,
  collectReferenceMeta,
  type DraftReference,
  planStartSlots,
  referenceErrorMessage,
  type ReferenceRoundKind,
  settledStartOptions,
} from '@/lib/illustration-references';

import styles from './illustrations.module.css';

interface IllustrationsSearch {
  subject?: IllustrationSubjectType;
  key?: string;
  illustration?: string;
  start?: boolean;
}

interface RoundWarnings {
  illustrationId: string;
  kind: ReferenceRoundKind;
  warnings: ReferenceWarningResponse[];
}

const CHAPTER_KEY = /^[1-9]\d*$/;
const OPTIONS_DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// The subject filter, the open illustration, and a pending "start" hand-off from another screen all
// live in the URL, so an entry-point button elsewhere is a plain link and a refresh lands in the same place.
export const Route = createFileRoute('/novels/$novelId/illustrations')({
  validateSearch: (search: Record<string, unknown>): IllustrationsSearch => ({
    subject: parseSubjectType(search.subject),
    key: typeof search.key === 'string' && search.key ? search.key : undefined,
    illustration: typeof search.illustration === 'string' && search.illustration ? search.illustration : undefined,
    start: search.start === true || search.start === 'true' ? true : undefined,
  }),
  loader: ({ context, params }) => context.queryClient.prefetchQuery(listIllustrationsQueryOptions(params.novelId)),
  component: IllustrationsScreen,
});

const STATUS_INTENT: Record<IllustrationStatus, ChipIntent> = { active: 'accent', saved: 'success', discarded: 'neutral' };

const SAVE_TARGETS: Record<IllustrationSubjectType, { target: IllustrationSaveTarget; label: string }[]> = {
  entity: [
    { target: 'portrait', label: 'Save as portrait' },
    { target: 'gallery', label: 'Add to gallery' },
  ],
  chapter: [{ target: 'chapter', label: 'Save as scene image' }],
  cover: [{ target: 'cover', label: 'Save as cover' }],
};

interface IllustrationImageProps {
  src: string | undefined;
}

/** A missing or unreachable object-storage URL still has to hold its slot, or one broken tile reflows the gallery. */
function IllustrationImage({ src }: IllustrationImageProps): React.JSX.Element {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(src);
  if (loaded !== src) {
    setLoaded(src);
    setBroken(false);
  }

  if (!src || broken)
    return (
      <span className={styles.imageFallback}>
        <ImageIcon size={20} />
      </span>
    );
  return <img src={src} alt="" className={styles.image} onError={() => setBroken(true)} />;
}

interface StartDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: { subjectType: IllustrationSubjectType; subjectKey: string };
  onStarted: (illustration: IllustrationResponse) => void;
}

function StartDialog({ novelId, open, onOpenChange, initial, onStarted }: StartDialogProps): React.JSX.Element {
  const start = useStartIllustrationMutation(novelId);
  const entitiesQuery = useListEntitiesQuery(novelId, { limit: 500 });
  const entities = entitiesQuery.data?.items ?? [];
  const [subjectType, setSubjectType] = useState(initial.subjectType);
  const [subjectKey, setSubjectKey] = useState(initial.subjectKey);
  const [instruction, setInstruction] = useState('');
  const [references, setReferences] = useState<DraftReference[]>([]);
  const [autoReferences, setAutoReferences] = useState(true);

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setSubjectType(initial.subjectType);
      setSubjectKey(initial.subjectKey);
      setInstruction('');
      setReferences([]);
      setAutoReferences(true);
    }
  }

  const resolvedKey = subjectType === 'entity' && !subjectKey ? (entities[0]?.entityKey ?? '') : subjectKey;
  const invalid = subjectType === 'cover' ? false : subjectType === 'chapter' ? !CHAPTER_KEY.test(resolvedKey.trim()) : !resolvedKey;
  const optionsKey = useDebouncedValue(subjectType === 'chapter' ? resolvedKey.trim() : '', OPTIONS_DEBOUNCE_MS);
  const optionsSubjectKey = subjectType === 'cover' ? undefined : subjectType === 'chapter' ? optionsKey : resolvedKey.trim();
  const optionsReady = subjectType !== 'chapter' || (optionsKey === resolvedKey.trim() && CHAPTER_KEY.test(optionsKey));
  const optionsQuery = useReferenceOptionsQuery(novelId, { subjectType, subjectKey: optionsSubjectKey }, open && !invalid && optionsReady);
  const settling = !invalid && !optionsReady;
  const refreshing = optionsQuery.isPlaceholderData || settling;
  const options = settledStartOptions(optionsQuery.data, refreshing);
  const meta = collectReferenceMeta(options, options?.autoPreview);
  const plan = options ? planStartSlots(options.capacity, references, subjectType !== 'cover' && autoReferences, options.autoPreview, meta) : undefined;
  const awaitingCapacity = references.length > 0 && !plan && !optionsQuery.error;
  const overCapacity = (plan?.overBy ?? 0) > 0;

  const submit = (): void => {
    const payload = buildAttachPayload(references);
    start.mutate(
      {
        subjectType,
        subjectKey: subjectType === 'cover' ? undefined : resolvedKey.trim(),
        instruction: instruction.trim() || undefined,
        references: payload.length > 0 ? payload : undefined,
        autoReferences: subjectType === 'cover' ? undefined : autoReferences,
      },
      {
        onSuccess: created => {
          toast.success('Candidates generated');
          onOpenChange(false);
          onStarted(created);
        },
        onError: err => toast.danger(referenceErrorMessage(err)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={next => !(start.isPending && !next) && onOpenChange(next)}>
      <Dialog.Content size="md">
        <Dialog.Header title="Start an illustration" description="Forge composes a prompt from the canon for this subject, then renders two candidates to choose between." />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            <FormField label="Subject">
              <Select value={subjectType} onValueChange={v => setSubjectType(v as IllustrationSubjectType)}>
                <Select.Item value="entity">An entity</Select.Item>
                <Select.Item value="chapter">A chapter scene</Select.Item>
                <Select.Item value="cover">The project cover</Select.Item>
              </Select>
            </FormField>
            {subjectType === 'entity' && (
              <FormField label="Entity" required>
                <Select value={resolvedKey} onValueChange={setSubjectKey}>
                  {entities.map(entity => (
                    <Select.Item key={entity.entityKey} value={entity.entityKey}>
                      {entity.name}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
            )}
            {subjectType === 'chapter' && (
              <FormField label="Chapter number" required>
                <Input type="number" min={1} value={subjectKey} onValueChange={setSubjectKey} />
              </FormField>
            )}
            <StartReferencesSection
              subjectType={subjectType}
              ready={!invalid}
              options={options}
              loading={optionsQuery.isLoading || settling || (optionsQuery.isFetching && optionsQuery.isPlaceholderData)}
              refreshing={refreshing}
              error={optionsQuery.error}
              plan={plan}
              drafts={references}
              onDraftsChange={setReferences}
              autoReferences={autoReferences}
              onAutoReferencesChange={setAutoReferences}
              disabled={start.isPending}
            />
            <FormField label="Art direction" helper="Optional — becomes the first entry in the instruction list you can keep editing afterwards.">
              <Textarea value={instruction} onValueChange={setInstruction} minRows={3} autoGrow placeholder="e.g. three-quarter view, rain-soaked alley, cold blue key light" />
            </FormField>
            {start.isPending && (
              <Alert intent="info" title="Rendering candidates">
                The image model runs synchronously — this usually takes 30 to 60 seconds. Leave this dialog open.
              </Alert>
            )}
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost" disabled={start.isPending}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button variant="primary" prefix={<SparkIcon />} loading={start.isPending} disabled={invalid || overCapacity || awaitingCapacity} onClick={submit}>
            Generate
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

interface AppearanceNoticeProps {
  novelId: string;
  entityKey: string;
  appearance: string;
  description?: AppearanceDescriptionResponse;
}

interface ConfidenceBadge {
  intent: 'success' | 'info' | 'warning';
  label: string;
}

const CONFIDENCE_BADGE: Record<AppearanceConfidenceLevel, ConfidenceBadge> = {
  high: { intent: 'success', label: 'High confidence' },
  medium: { intent: 'info', label: 'Medium confidence' },
  low: { intent: 'warning', label: 'Low confidence' },
};

function AppearanceNotice({ novelId, entityKey, appearance, description }: AppearanceNoticeProps): React.JSX.Element {
  const updateEntity = useUpdateEntityMutation(novelId, entityKey);
  const [saved, setSaved] = useState(false);
  const confidence = description ? CONFIDENCE_BADGE[description.confidence] : undefined;
  const cautious = !description || description.confidence === 'low';

  return (
    <Alert intent={cautious ? 'warning' : 'info'} title={description ? 'Forge described this appearance from a reference image' : 'Forge invented this appearance'}>
      {confidence && (
        <div className={styles.confidenceRow}>
          <Badge intent={confidence.intent} dot>
            {confidence.label}
          </Badge>
          {description?.confidence === 'low' && <span className={styles.confidenceHint}>It may describe the wrong figure — check it before adopting.</span>}
        </div>
      )}
      {description?.ambiguity && <p className={styles.alertText}>{description.ambiguity}</p>}
      <p className={styles.alertText}>{appearance}</p>
      <Button
        variant="secondary"
        size="sm"
        loading={updateEntity.isPending}
        disabled={saved}
        onClick={() =>
          updateEntity.mutate(
            { appearance },
            {
              onSuccess: () => {
                setSaved(true);
                toast.success('Saved as the entity’s appearance anchor');
              },
              onError: err => toast.danger(err.message),
            },
          )
        }
      >
        {saved ? 'Saved as appearance anchor' : 'Save as appearance anchor'}
      </Button>
    </Alert>
  );
}

interface InstructionListProps {
  instructions: string[];
  pending: boolean;
  onReplace: (index: number, text: string) => void;
  onRemove: (index: number) => void;
  onAdd: (text: string) => void;
}

function InstructionList({ instructions, pending, onReplace, onRemove, onAdd }: InstructionListProps): React.JSX.Element {
  const [drafts, setDrafts] = useState(instructions);
  const [addition, setAddition] = useState('');

  const [seeded, setSeeded] = useState(instructions);
  if (seeded !== instructions) {
    setSeeded(instructions);
    setDrafts(instructions);
    setAddition('');
  }

  return (
    <div className={styles.instructions}>
      {drafts.map((text, index) => {
        const changed = text.trim() !== (instructions[index] ?? '') && Boolean(text.trim());
        return (
          <div key={index} className={styles.instructionRow}>
            <Textarea value={text} onValueChange={value => setDrafts(prev => prev.map((entry, i) => (i === index ? value : entry)))} minRows={1} autoGrow disabled={pending} />
            <Tooltip content="Apply this wording and re-render">
              <Button variant="secondary" size="sm" disabled={pending || !changed} onClick={() => onReplace(index, text.trim())}>
                Apply
              </Button>
            </Tooltip>
            <RowAction label={`Remove instruction ${index + 1}`} danger onClick={() => !pending && onRemove(index)}>
              <TrashIcon size={13} />
            </RowAction>
          </div>
        );
      })}
      <div className={styles.instructionRow}>
        <Textarea value={addition} onValueChange={setAddition} minRows={1} autoGrow disabled={pending} placeholder="Add an instruction — e.g. warmer palette, tighter crop" />
        <Button variant="primary" size="sm" prefix={<SparkIcon />} disabled={pending || !addition.trim()} onClick={() => onAdd(addition.trim())}>
          Add & regenerate
        </Button>
      </div>
    </div>
  );
}

interface CandidateGridProps {
  illustration: IllustrationResponse;
  busy: boolean;
  onSelect: (candidate: IllustrationCandidateResponse) => void;
}

function CandidateGrid({ illustration, busy, onSelect }: CandidateGridProps): React.JSX.Element {
  const active = illustration.status === 'active';
  const slots = candidateSlots(illustration.candidates, busy);

  return (
    <div className={styles.candidates} aria-busy={busy || undefined}>
      {slots.map((slot, index) => {
        if (slot.kind === 'rendering')
          return (
            <div key={`rendering-${index}`} className={styles.placeholder}>
              <Spinner size="lg" label="Rendering" />
              <span className={styles.placeholderNote}>Rendering — 30 to 60 seconds</span>
            </div>
          );
        if (slot.kind === 'empty')
          return (
            <div key={`empty-${index}`} className={styles.placeholder}>
              <ImageIcon size={20} />
              <span className={styles.placeholderNote}>Every edit re-renders a pair</span>
            </div>
          );

        const { candidate } = slot;
        const selected = candidate.ref === illustration.selectedRef;
        return (
          <div key={candidate.ref} className={styles.candidateCell}>
            <button
              type="button"
              className={styles.candidate}
              data-selected={selected || undefined}
              aria-pressed={selected}
              disabled={!active || busy}
              onClick={() => onSelect(candidate)}
            >
              <span className={styles.frame}>
                <IllustrationImage src={candidate.imageUrl} />
              </span>
              <span className={styles.candidateMeta}>{relativeTime(candidate.createdAt)}</span>
            </button>
            <CandidateReferences references={candidate.references} />
          </div>
        );
      })}
    </div>
  );
}

interface IllustrationControlsProps {
  novelId: string;
  illustration: IllustrationResponse;
  busy: boolean;
  roundWarnings: RoundWarnings | undefined;
  onRefine: (body: RefineIllustrationBody) => void;
  onRound: (kind: ReferenceRoundKind, result: IllustrationResponse) => void;
  onDismissWarnings: () => void;
}

function IllustrationControls({ novelId, illustration, busy, roundWarnings, onRefine, onRound, onDismissWarnings }: IllustrationControlsProps): React.JSX.Element {
  const active = illustration.status === 'active';

  return (
    <>
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Art direction · every edit re-renders a new pair of candidates</h2>
        {active ? (
          <InstructionList
            instructions={illustration.instructions}
            pending={busy}
            onReplace={(index, text) => onRefine({ replace: { index, text } })}
            onRemove={index => onRefine({ removeIndex: index })}
            onAdd={text => onRefine({ add: text })}
          />
        ) : illustration.instructions.length === 0 ? (
          <p className={styles.emptyNote}>No art direction was given.</p>
        ) : (
          <ol className={styles.frozenInstructions}>
            {illustration.instructions.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>
          {illustration.origin === 'uploaded' ? 'Rework prompt · renders from the selected image, not editable' : 'Composed prompt · derived from the canon, not editable'}
        </h2>
        <pre className={styles.prompt}>{illustration.prompt}</pre>
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>{active ? 'Reference images · sent with every re-render' : 'Reference images'}</h2>
        <IllustrationReferencesPanel
          key={illustration.id}
          novelId={novelId}
          illustration={illustration}
          busy={busy}
          warnings={roundWarnings?.warnings ?? []}
          warningsKind={roundWarnings?.kind ?? 'start'}
          onSaved={result => onRound('save', result)}
          onDismissWarnings={onDismissWarnings}
        />
      </section>
    </>
  );
}

interface IllustrationDetailProps {
  novelId: string;
  illustration: IllustrationResponse;
  filter: { subject?: IllustrationSubjectType; key?: string };
  ids: readonly string[] | undefined;
  jump?: ItemPagerJump;
  roundWarnings: RoundWarnings | undefined;
  onSelect: (id: string) => void;
  onRound: (kind: ReferenceRoundKind, result: IllustrationResponse) => void;
  onDismissWarnings: () => void;
}

function IllustrationDetail({ novelId, illustration, filter, ids, jump, roundWarnings, onSelect, onRound, onDismissWarnings }: IllustrationDetailProps): React.JSX.Element {
  const illustrationId = illustration.id;
  const refine = useRefineIllustrationMutation(novelId, illustrationId);
  const select = useSelectIllustrationMutation(novelId, illustrationId);
  const save = useSaveIllustrationMutation(novelId, illustrationId);
  const discard = useDiscardIllustrationMutation(novelId, illustrationId);
  const [discardOpen, setDiscardOpen] = useState(false);

  const name = subjectLabel(illustration);
  const active = illustration.status === 'active';
  const busy = refine.isPending || select.isPending || save.isPending || discard.isPending;

  const runRefine = (body: RefineIllustrationBody): void => {
    refine.mutate(body, {
      onSuccess: result => {
        toast.success('Re-rendered from the edited instructions');
        onRound('refine', result);
      },
      onError: err => toast.danger(referenceErrorMessage(err)),
    });
  };

  return (
    <>
      <DetailPage
        back={
          <Link to="/novels/$novelId/illustrations" params={{ novelId }} search={filter}>
            All illustrations
          </Link>
        }
        identity={
          <DetailPage.Identity title={name}>
            <StatusChip intent={STATUS_INTENT[illustration.status]} dot>
              {illustration.status}
            </StatusChip>
            <span className={styles.identityMeta}>{identityMeta(illustration, relativeTime(illustration.updatedAt))}</span>
          </DetailPage.Identity>
        }
        pager={<ItemPager ids={ids} currentId={illustrationId} onSelect={onSelect} itemNoun="illustration" jump={jump} />}
        actions={
          active && (
            <>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDiscardOpen(true)}>
                Discard
              </Button>
              {SAVE_TARGETS[illustration.subjectType].map(({ target, label }) => (
                <Button
                  key={target}
                  variant={target === 'gallery' ? 'ghost' : 'primary'}
                  size="sm"
                  loading={save.isPending}
                  disabled={busy || !illustration.selectedRef}
                  onClick={() => save.mutate({ target }, { onSuccess: () => toast.success(label.replace('Save as', 'Saved as')), onError: err => toast.danger(err.message) })}
                >
                  {label}
                </Button>
              ))}
            </>
          )
        }
        aside={
          <IllustrationControls
            novelId={novelId}
            illustration={illustration}
            busy={busy}
            roundWarnings={roundWarnings}
            onRefine={runRefine}
            onRound={onRound}
            onDismissWarnings={onDismissWarnings}
          />
        }
        asideLabel={`${name} controls`}
        asideWidth="prose"
      >
        {illustration.suggestedAppearance && illustration.subjectKey && (
          <AppearanceNotice
            key={illustrationId}
            novelId={novelId}
            entityKey={illustration.subjectKey}
            appearance={illustration.suggestedAppearance}
            description={illustration.appearanceDescription}
          />
        )}

        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Candidates · pick the one to keep</h2>
          <CandidateGrid illustration={illustration} busy={busy} onSelect={candidate => select.mutate({ ref: candidate.ref }, { onError: err => toast.danger(err.message) })} />
        </section>
      </DetailPage>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <Dialog.Content size="sm">
          <Dialog.Header title="Discard this illustration?" description="Every candidate no other record points at is deleted from storage. It cannot be undone." />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button
              variant="danger"
              loading={discard.isPending}
              onClick={() =>
                discard.mutate(undefined, {
                  onSuccess: () => {
                    toast.success('Illustration discarded');
                    setDiscardOpen(false);
                  },
                  onError: err => toast.danger(err.message),
                })
              }
            >
              Discard
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </>
  );
}

interface IllustrationTileProps {
  novelId: string;
  illustration: IllustrationResponse;
  filter: { subject?: IllustrationSubjectType; key?: string };
}

function IllustrationTile({ novelId, illustration, filter }: IllustrationTileProps): React.JSX.Element {
  return (
    <Link to="/novels/$novelId/illustrations" params={{ novelId }} search={{ ...filter, illustration: illustration.id }} className={styles.tile}>
      <span className={styles.tileFrame}>
        <IllustrationImage src={thumbnailOf(illustration)} />
        <StatusChip intent={STATUS_INTENT[illustration.status]} dot>
          {illustration.status}
        </StatusChip>
      </span>
      <span className={styles.tileName}>{subjectLabel(illustration)}</span>
      <span className={styles.tileMeta}>
        {illustrationCaption(illustration)} · {relativeTime(illustration.updatedAt)}
      </span>
    </Link>
  );
}

function IllustrationsScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { subject, key, illustration: illustrationParam, start } = Route.useSearch();
  const goSearch = Route.useNavigate();
  const illustrationsQuery = useListIllustrationsQuery(novelId);
  const items = useMemo(() => illustrationsQuery.data?.items ?? [], [illustrationsQuery.data]);
  const [roundWarnings, setRoundWarnings] = useState<RoundWarnings>();

  const activeFilter: SubjectFilter = subject ?? 'all';
  const resolved = !illustrationsQuery.isLoading && !illustrationsQuery.error;
  const total = resolved ? items.length : undefined;
  const filtering = subject !== undefined || key !== undefined;

  const counts = useMemo(() => countBySubject(items), [items]);
  const visible = useMemo(() => filterIllustrations(items, activeFilter, key), [items, activeFilter, key]);
  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const visibleIds = useMemo(() => (resolved ? visible.map(item => item.id) : undefined), [resolved, visible]);
  const selected = illustrationParam ? byId.get(illustrationParam) : undefined;

  const openIllustration = (id?: string): Promise<void> => goSearch({ search: prev => ({ ...prev, illustration: id, start: undefined }) });
  const pickFilter = (next: string): Promise<void> => goSearch({ search: { subject: parseSubjectType(next) } });
  const clearFilters = (): Promise<void> => goSearch({ search: {} });
  const clearKey = (): Promise<void> => goSearch({ search: prev => ({ ...prev, key: undefined }) });
  const openStart = (): Promise<void> => goSearch({ search: prev => ({ ...prev, start: true }) });
  const closeStart = (): Promise<void> => goSearch({ search: prev => ({ ...prev, start: undefined }) });
  const recordRound = (kind: ReferenceRoundKind, result: IllustrationResponse): void =>
    setRoundWarnings({ illustrationId: result.id, kind, warnings: result.referenceWarnings ?? [] });

  const jumpItems = useMemo(() => visible.map(item => ({ id: item.id, label: subjectLabel(item), caption: illustrationCaption(item) })), [visible]);
  const allJumpItems = useMemo(
    () => (filtering ? items.map(item => ({ id: item.id, label: subjectLabel(item), caption: illustrationCaption(item) })) : undefined),
    [filtering, items],
  );
  const jump = useCollectionJump(
    resolved
      ? {
          collection: 'illustrations',
          items: jumpItems,
          filterLabel: subject ? FILTER_LABEL[subject] : undefined,
          allItems: allJumpItems,
          currentId: illustrationParam,
          onSelect: id => void openIllustration(id),
        }
      : null,
  );

  const staleLink = resolved && Boolean(illustrationParam);
  const notice =
    staleLink || key ? (
      <>
        {staleLink && (
          <Alert intent="warning" title="That illustration is no longer here." action={{ label: 'Back to the directory', onClick: () => void openIllustration(undefined) }}>
            It was deleted, its session was replaced, or the link was typed by hand.
          </Alert>
        )}
        {key && (
          <button type="button" className={styles.keyFilter} onClick={() => void clearKey()}>
            Filtered to {key} · clear
          </button>
        )}
      </>
    ) : undefined;

  const startDialog = (
    <StartDialog
      novelId={novelId}
      open={Boolean(start)}
      onOpenChange={next => !next && closeStart()}
      initial={{ subjectType: subject ?? 'entity', subjectKey: key ?? '' }}
      onStarted={created => {
        recordRound('start', created);
        return openIllustration(created.id);
      }}
    />
  );

  if (selected)
    return (
      <>
        <IllustrationDetail
          novelId={novelId}
          illustration={selected}
          filter={{ subject, key }}
          ids={visibleIds}
          jump={jump}
          roundWarnings={roundWarnings?.illustrationId === selected.id ? roundWarnings : undefined}
          onSelect={id => void openIllustration(id)}
          onRound={recordRound}
          onDismissWarnings={() => setRoundWarnings(undefined)}
        />
        {startDialog}
      </>
    );

  return (
    <>
      <CollectionPage
        title="Illustrations"
        subtitle="Forge composes each prompt from the canon, renders two candidates, and only writes the one you pick back onto the story."
        total={total}
        actions={
          <Button variant="primary" prefix={<SparkIcon />} onClick={() => void openStart()}>
            Start an illustration
          </Button>
        }
        segments={{
          label: 'Illustration subject',
          value: activeFilter,
          onValueChange: pickFilter,
          items: [
            { value: 'all', label: FILTER_LABEL.all, count: items.length },
            { value: 'entity', label: FILTER_LABEL.entity, count: counts.entity },
            { value: 'chapter', label: FILTER_LABEL.chapter, count: counts.chapter },
            { value: 'cover', label: FILTER_LABEL.cover, count: counts.cover },
          ],
        }}
        notice={notice}
        empty={
          <EmptyState
            icon={<ImageIcon size={24} />}
            title="No illustrations yet"
            description="Forge composes a prompt from the canon, renders two candidates, and only writes the one you pick back onto the story. Start one for an entity, a chapter scene, or the cover."
            actions={
              <Button variant="primary" prefix={<SparkIcon />} onClick={() => void openStart()}>
                Start an illustration
              </Button>
            }
          />
        }
      >
        {illustrationsQuery.isLoading ? (
          <PaneLoader />
        ) : illustrationsQuery.error ? (
          <PaneError error={illustrationsQuery.error} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={24} />}
            title="Nothing matches"
            description={`No illustration matches this filter${key ? ` — nothing has been rendered for ${key}.` : '.'}`}
            actions={
              <Button variant="secondary" onClick={() => void clearFilters()}>
                Clear the filter
              </Button>
            }
          />
        ) : (
          <div className={styles.gallery}>
            {visible.map(item => (
              <IllustrationTile key={item.id} novelId={novelId} illustration={item} filter={{ subject, key }} />
            ))}
          </div>
        )}
      </CollectionPage>
      {startDialog}
    </>
  );
}
