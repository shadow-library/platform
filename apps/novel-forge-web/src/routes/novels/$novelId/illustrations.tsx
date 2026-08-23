import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Dialog, FormField, Input, SegmentedControl, Select, Spinner, Textarea, toast, Tooltip } from '@shadow-library/ui';

import { ImageIcon, PlusIcon, SparkIcon, TrashIcon } from '@/components/icons';
import { type ChipIntent, PaneError, PaneLoader, RowAction, StatusChip } from '@/components/nf';
import {
  type IllustrationResponse,
  type IllustrationSaveTarget,
  type IllustrationStatus,
  type IllustrationSubjectType,
  listIllustrationsQueryOptions,
  type RefineIllustrationBody,
  useDiscardIllustrationMutation,
  useListEntitiesQuery,
  useListIllustrationsQuery,
  useRefineIllustrationMutation,
  useSaveIllustrationMutation,
  useSelectIllustrationMutation,
  useStartIllustrationMutation,
  useUpdateEntityMutation,
} from '@/lib/apis';
import { relativeTime } from '@/lib/format';

import styles from './illustrations.module.css';

type SubjectFilter = IllustrationSubjectType | 'all';

interface IllustrationsSearch {
  subject?: IllustrationSubjectType;
  key?: string;
  illustration?: string;
  start?: boolean;
}

function isSubjectType(value: unknown): value is IllustrationSubjectType {
  return value === 'entity' || value === 'chapter' || value === 'cover';
}

// The subject filter, the open illustration, and a pending "start" hand-off from another screen all
// live in the URL, so an entry-point button elsewhere is a plain link and a refresh lands in the same place.
export const Route = createFileRoute('/novels/$novelId/illustrations')({
  validateSearch: (search: Record<string, unknown>): IllustrationsSearch => ({
    subject: isSubjectType(search.subject) ? search.subject : undefined,
    key: typeof search.key === 'string' && search.key ? search.key : undefined,
    illustration: typeof search.illustration === 'string' && search.illustration ? search.illustration : undefined,
    start: search.start === true || search.start === 'true' ? true : undefined,
  }),
  loader: ({ context, params }) => context.queryClient.prefetchQuery(listIllustrationsQueryOptions(params.novelId)),
  component: IllustrationsScreen,
});

const SUBJECT_LABEL: Record<IllustrationSubjectType, string> = { entity: 'Entity', chapter: 'Chapter', cover: 'Cover' };

const STATUS_INTENT: Record<IllustrationStatus, ChipIntent> = { active: 'accent', saved: 'success', discarded: 'neutral' };

const SAVE_TARGETS: Record<IllustrationSubjectType, { target: IllustrationSaveTarget; label: string }[]> = {
  entity: [
    { target: 'portrait', label: 'Save as portrait' },
    { target: 'gallery', label: 'Add to gallery' },
  ],
  chapter: [{ target: 'chapter', label: 'Save as scene image' }],
  cover: [{ target: 'cover', label: 'Save as cover' }],
};

function subjectLabel(illustration: Pick<IllustrationResponse, 'subjectType' | 'subjectKey'>): string {
  if (illustration.subjectType === 'cover') return 'Project cover';
  if (illustration.subjectType === 'chapter') return `Chapter ${illustration.subjectKey}`;
  return illustration.subjectKey ?? 'Entity';
}

function thumbnailOf(illustration: IllustrationResponse): string | undefined {
  return illustration.selectedUrl ?? illustration.candidates.at(-1)?.imageUrl ?? undefined;
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

  useEffect(() => {
    if (!open) return;
    setSubjectType(initial.subjectType);
    setSubjectKey(initial.subjectKey);
    setInstruction('');
  }, [open, initial]);

  const resolvedKey = subjectType === 'entity' && !subjectKey ? (entities[0]?.entityKey ?? '') : subjectKey;
  const invalid = subjectType === 'cover' ? false : subjectType === 'chapter' ? !/^\d+$/.test(resolvedKey.trim()) : !resolvedKey;

  const submit = (): void => {
    start.mutate(
      { subjectType, subjectKey: subjectType === 'cover' ? undefined : resolvedKey.trim(), instruction: instruction.trim() || undefined },
      {
        onSuccess: created => {
          toast.success('Candidates generated');
          onOpenChange(false);
          onStarted(created);
        },
        onError: err => toast.danger(err.message),
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
          <Button variant="primary" prefix={<SparkIcon />} loading={start.isPending} disabled={invalid} onClick={submit}>
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
}

function AppearanceNotice({ novelId, entityKey, appearance }: AppearanceNoticeProps): React.JSX.Element {
  const updateEntity = useUpdateEntityMutation(novelId, entityKey);
  const [saved, setSaved] = useState(false);

  return (
    <Alert intent="warning" title="Forge invented this appearance">
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

  useEffect(() => {
    setDrafts(instructions);
    setAddition('');
  }, [instructions]);

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

interface IllustrationDetailProps {
  novelId: string;
  illustration: IllustrationResponse;
}

function IllustrationDetail({ novelId, illustration }: IllustrationDetailProps): React.JSX.Element {
  const illustrationId = illustration.id;
  const refine = useRefineIllustrationMutation(novelId, illustrationId);
  const select = useSelectIllustrationMutation(novelId, illustrationId);
  const save = useSaveIllustrationMutation(novelId, illustrationId);
  const discard = useDiscardIllustrationMutation(novelId, illustrationId);
  const [discardOpen, setDiscardOpen] = useState(false);

  const active = illustration.status === 'active';
  const busy = refine.isPending || select.isPending || save.isPending || discard.isPending;

  const runRefine = (body: RefineIllustrationBody): void => {
    refine.mutate(body, { onSuccess: () => toast.success('Re-rendered from the edited instructions'), onError: err => toast.danger(err.message) });
  };

  return (
    <>
      <div className={styles.detailHead}>
        <div className={styles.detailTitleWrap}>
          <h2 className={styles.detailTitle}>{subjectLabel(illustration)}</h2>
          <StatusChip intent={STATUS_INTENT[illustration.status]} dot>
            {illustration.status}
          </StatusChip>
          <span className={styles.detailMeta}>
            revision {illustration.revision} · {relativeTime(illustration.updatedAt)}
          </span>
        </div>
        <div className={styles.spacer} />
        {active &&
          SAVE_TARGETS[illustration.subjectType].map(({ target, label }) => (
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
        {active && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDiscardOpen(true)}>
            Discard
          </Button>
        )}
      </div>

      <div className={`nf-scroll ${styles.paneScroll}`}>
        <div className={styles.detailInner}>
          {illustration.suggestedAppearance && illustration.subjectKey && (
            <AppearanceNotice novelId={novelId} entityKey={illustration.subjectKey} appearance={illustration.suggestedAppearance} />
          )}

          <div>
            <div className={styles.sectionLabel}>Candidates · pick the one to keep</div>
            <div className={styles.candidates} aria-busy={busy || undefined}>
              {illustration.candidates.map(candidate => (
                <button
                  key={candidate.ref}
                  type="button"
                  className={styles.candidate}
                  data-selected={candidate.ref === illustration.selectedRef || undefined}
                  disabled={!active || busy}
                  onClick={() => select.mutate({ ref: candidate.ref }, { onError: err => toast.danger(err.message) })}
                >
                  <img src={candidate.imageUrl} alt="" className={styles.candidateImg} />
                  <span className={styles.candidateMeta}>{relativeTime(candidate.createdAt)}</span>
                </button>
              ))}
              {busy && (
                <div className={styles.candidatePending}>
                  <Spinner size="lg" label="Rendering" />
                  <span className={styles.candidateMeta}>Rendering — 30 to 60 seconds</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className={styles.sectionLabel}>Composed prompt · derived from the canon, not editable</div>
            <pre className={styles.prompt}>{illustration.prompt}</pre>
          </div>

          <div>
            <div className={styles.sectionLabel}>Art direction · every edit re-renders a new pair of candidates</div>
            {active ? (
              <InstructionList
                instructions={illustration.instructions}
                pending={busy}
                onReplace={(index, text) => runRefine({ replace: { index, text } })}
                onRemove={index => runRefine({ removeIndex: index })}
                onAdd={text => runRefine({ add: text })}
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
          </div>
        </div>
      </div>

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

function IllustrationsScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { subject, key, illustration: illustrationParam, start } = Route.useSearch();
  const goSearch = Route.useNavigate();
  const illustrationsQuery = useListIllustrationsQuery(novelId);
  const items = useMemo(() => illustrationsQuery.data?.items ?? [], [illustrationsQuery.data]);
  const filter: SubjectFilter = subject ?? 'all';

  const visible = useMemo(() => {
    const bySubject = filter === 'all' ? items : items.filter(item => item.subjectType === filter);
    return key ? bySubject.filter(item => item.subjectKey === key) : bySubject;
  }, [items, filter, key]);

  const selected = visible.find(item => item.id === illustrationParam) ?? visible[0];

  const openIllustration = (id?: string): Promise<void> => goSearch({ search: prev => ({ ...prev, illustration: id, start: undefined }) });
  const pickFilter = (next: SubjectFilter): Promise<void> => goSearch({ search: { subject: next === 'all' ? undefined : next } });
  const closeStart = (): Promise<void> => goSearch({ search: prev => ({ ...prev, start: undefined }) });

  return (
    <div className="nf-splitpane">
      <div className="nf-rail">
        <div className={styles.railHead}>
          <div className={styles.railTitleRow}>
            <span className={styles.railTitle}>Illustrations</span>
            <div className={styles.spacer} />
            <Tooltip content="Start a new illustration">
              <Button variant="ghost" size="sm" prefix={<PlusIcon />} onClick={() => goSearch({ search: prev => ({ ...prev, start: true }) })}>
                New
              </Button>
            </Tooltip>
          </div>
          <p className={styles.railHint}>Forge composes each prompt from the canon, renders two candidates, and only writes the one you pick back onto the story.</p>
          <SegmentedControl value={filter} onValueChange={v => pickFilter(v as SubjectFilter)}>
            <SegmentedControl.Item value="all">All</SegmentedControl.Item>
            <SegmentedControl.Item value="entity">Entities</SegmentedControl.Item>
            <SegmentedControl.Item value="chapter">Chapters</SegmentedControl.Item>
            <SegmentedControl.Item value="cover">Cover</SegmentedControl.Item>
          </SegmentedControl>
          {key && (
            <button type="button" className={styles.keyFilter} onClick={() => goSearch({ search: prev => ({ ...prev, key: undefined }) })}>
              Filtered to {key} · clear
            </button>
          )}
        </div>
        <div className={`nf-scroll ${styles.railList}`}>
          {illustrationsQuery.isLoading && <PaneLoader />}
          {illustrationsQuery.error && <PaneError error={illustrationsQuery.error} />}
          {!illustrationsQuery.isLoading && visible.length === 0 && <div className="nf-emptynote">No illustrations here yet.</div>}
          {visible.map(item => {
            const thumbnail = thumbnailOf(item);
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                className={`nf-selrow ${styles.itemRow}`}
                data-active={item.id === selected?.id || undefined}
                onClick={() => openIllustration(item.id)}
                onKeyDown={e => e.key === 'Enter' && openIllustration(item.id)}
              >
                {thumbnail ? (
                  <img src={thumbnail} alt="" className={styles.itemThumb} />
                ) : (
                  <div className={styles.itemThumbFallback}>
                    <ImageIcon size={15} />
                  </div>
                )}
                <div className={styles.itemBody}>
                  <div className={styles.itemName}>{subjectLabel(item)}</div>
                  <div className={styles.itemSub}>
                    {SUBJECT_LABEL[item.subjectType]} · rev {item.revision} · {relativeTime(item.updatedAt)}
                  </div>
                </div>
                <StatusChip intent={STATUS_INTENT[item.status]} dot>
                  {item.status}
                </StatusChip>
              </div>
            );
          })}
        </div>
      </div>

      <div className="nf-detail">
        {selected ? (
          <IllustrationDetail novelId={novelId} illustration={selected} />
        ) : (
          <div className="nf-pane-empty">Nothing rendered yet — start an illustration for an entity, a chapter scene, or the cover.</div>
        )}
      </div>

      <StartDialog
        novelId={novelId}
        open={Boolean(start)}
        onOpenChange={next => !next && closeStart()}
        initial={{ subjectType: subject ?? 'entity', subjectKey: key ?? '' }}
        onStarted={created => openIllustration(created.id)}
      />
    </div>
  );
}
