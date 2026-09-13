import { useId, useState } from 'react';
import { Alert, Badge, Button, Checkbox, Dialog, Input, Select, Spinner, Tabs, toast } from '@shadow-library/ui';

import { ImageIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { RowAction } from '@/components/nf';
import {
  type ApiError,
  type IllustrationAttachableReferenceRole,
  type IllustrationReferenceResponse,
  type IllustrationResponse,
  type IllustrationSubjectType,
  type ReferenceOptionResponse,
  type ReferenceOptionsResponse,
  type ReferenceWarningResponse,
  useReferenceOptionsQuery,
  useUpdateIllustrationReferencesMutation,
} from '@/lib/apis';
import {
  addDraftReference,
  attachedMarkers,
  type AttachedMarkers,
  buildAttachPayload,
  capitalize,
  collectReferenceMeta,
  describeReferenceWarning,
  type DraftReference,
  editSourceKeys,
  isAttached,
  labelOf,
  MAX_REFERENCE_NOTE_LENGTH,
  planRefineSlots,
  reasonLabel,
  referenceErrorMessage,
  referenceKey,
  type ReferenceMeta,
  type ReferenceRoundKind,
  ROLE_LABEL,
  sameAttachedSet,
  slotNoun,
  type StartSlotPlan,
  toDraftReferences,
  visibleRoundWarnings,
} from '@/lib/illustration-references';

import styles from './ReferenceImages.module.css';

type OptionGroup = 'cover' | 'portraits' | 'gallery' | 'chapterImages' | 'candidates';

interface OptionGroupEntry {
  value: OptionGroup;
  label: string;
  empty: string;
}

const OPTION_GROUPS: OptionGroupEntry[] = [
  { value: 'cover', label: 'Cover', empty: 'This project has no cover yet.' },
  { value: 'portraits', label: 'Portraits', empty: 'No entity has a portrait yet.' },
  { value: 'gallery', label: 'Gallery', empty: 'No entity gallery images yet.' },
  { value: 'chapterImages', label: 'Chapter images', empty: 'No chapter scene images yet.' },
  { value: 'candidates', label: 'Other illustrations', empty: 'No other illustration has a selected image yet.' },
];

const AUTO_DESCRIPTION: Record<IllustrationSubjectType, string> = {
  entity: 'Send the entity’s portrait so the likeness stays consistent. Turn off to choose references yourself.',
  chapter: 'Send portraits of the characters who appear in this chapter. Turn off to choose references yourself.',
  cover: 'Covers have no automatic references.',
};

const AUTO_EMPTY: Record<IllustrationSubjectType, string> = {
  entity: 'Nothing to add automatically — this entity has no portrait yet.',
  chapter: 'Nothing to add automatically — no character with a portrait appears in this chapter.',
  cover: '',
};

const WARNINGS_TITLE: Record<ReferenceRoundKind, string> = {
  start: 'Some reference images were not sent as attached',
  refine: 'Some reference images were not sent as attached',
  save: 'Some saved references won’t be sent on the next re-render',
};

const EDIT_SOURCE_ONLY_COPY = 'This model uses the image being edited as its only reference — start a new illustration to generate from a different image.';

function optionsIn(options: ReferenceOptionsResponse, group: OptionGroup): ReferenceOptionResponse[] {
  if (group === 'cover') return options.cover ? [options.cover] : [];
  return options[group];
}

interface ThumbProps {
  url?: string;
  size?: 'sm' | 'md';
}

function Thumb({ url, size = 'md' }: ThumbProps): React.JSX.Element {
  if (!url) {
    return (
      <span className={styles.thumbFallback} data-size={size}>
        <ImageIcon size={size === 'sm' ? 11 : 15} />
      </span>
    );
  }
  return <img src={url} alt="" className={styles.thumb} data-size={size} loading="lazy" />;
}

interface ReferencePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: ReferenceOptionsResponse | undefined;
  loading: boolean;
  attached: AttachedMarkers;
  excludeKeys?: Set<string>;
  onPick: (option: ReferenceOptionResponse) => void;
}

function ReferencePicker({ open, onOpenChange, options, loading, attached, excludeKeys, onPick }: ReferencePickerProps): React.JSX.Element {
  const visible = (group: OptionGroup): ReferenceOptionResponse[] => (options ? optionsIn(options, group).filter(option => !excludeKeys?.has(referenceKey(option))) : []);
  const firstFilled = OPTION_GROUPS.find(group => visible(group.value).length > 0)?.value ?? 'portraits';
  const [chosenTab, setChosenTab] = useState<OptionGroup>();
  const tab = chosenTab ?? firstFilled;

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setChosenTab(undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="lg">
        <Dialog.Header title="Add a reference image" description="Pick a project image for the model to look at. You choose whether it lends likeness or style after adding it." />
        <Dialog.Body>
          {loading || !options ? (
            <div className={styles.pickerLoading}>
              <Spinner label="Loading project images" />
            </div>
          ) : (
            <Tabs value={tab} onValueChange={value => setChosenTab(value as OptionGroup)}>
              <Tabs.List className={styles.pickerTabs}>
                {OPTION_GROUPS.map(group => (
                  <Tabs.Tab key={group.value} value={group.value} count={visible(group.value).length}>
                    {group.label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              {OPTION_GROUPS.map(group => {
                const items = visible(group.value);
                return (
                  <Tabs.Panel key={group.value} value={group.value}>
                    {items.length === 0 ? (
                      <p className={styles.muted}>{group.empty}</p>
                    ) : (
                      <ul className={styles.optionGrid}>
                        {items.map(option => {
                          const alreadyAttached = isAttached(option, attached);
                          return (
                            <li key={referenceKey(option)}>
                              <button
                                type="button"
                                className={styles.option}
                                aria-disabled={alreadyAttached || undefined}
                                onClick={() => {
                                  if (alreadyAttached) return;
                                  onPick(option);
                                  onOpenChange(false);
                                }}
                              >
                                <img src={option.url} alt="" className={styles.optionImg} loading="lazy" />
                                <span className={styles.optionLabel}>{capitalize(option.label)}</span>
                                {alreadyAttached && <span className={styles.optionAttached}>Attached</span>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Tabs.Panel>
                );
              })}
              {options.truncated && <p className={styles.muted}>Only the newest images in each group are listed.</p>}
            </Tabs>
          )}
        </Dialog.Body>
      </Dialog.Content>
    </Dialog>
  );
}

interface AttachedReferenceListProps {
  drafts: DraftReference[];
  meta: Map<string, ReferenceMeta>;
  disabled?: boolean;
  unsentKeys?: Set<string>;
  editSourceKeys?: Set<string>;
  onChange: (next: DraftReference[]) => void;
}

function AttachedReferenceList({ drafts, meta, disabled, unsentKeys, editSourceKeys: sentAsEditSource, onChange }: AttachedReferenceListProps): React.JSX.Element | null {
  if (drafts.length === 0) return null;
  const update = (key: string, patch: Partial<DraftReference>): void => onChange(drafts.map(draft => (referenceKey(draft) === key ? { ...draft, ...patch } : draft)));

  return (
    <ul className={styles.rows} aria-label="Attached reference images">
      {drafts.map(draft => {
        const key = referenceKey(draft);
        const label = labelOf(draft, meta);
        return (
          <li key={key} className={styles.row}>
            <Thumb url={meta.get(key)?.url} />
            <div className={styles.rowMain}>
              <div className={styles.rowHead}>
                <span className={styles.rowLabel}>{label}</span>
                {sentAsEditSource?.has(key) && (
                  <Badge intent="info" size="sm">
                    Sent as the image being edited · note not used
                  </Badge>
                )}
                {unsentKeys?.has(key) && (
                  <Badge intent="warning" size="sm">
                    Not sent · no free slot
                  </Badge>
                )}
                <span className={styles.spacer} />
                {!disabled && (
                  <RowAction label={`Remove ${label}`} danger onClick={() => onChange(drafts.filter(entry => referenceKey(entry) !== key))}>
                    <TrashIcon size={13} />
                  </RowAction>
                )}
              </div>
              <div className={styles.rowControls}>
                <Select
                  size="sm"
                  className={styles.roleSelect}
                  aria-label={`Role for ${label}`}
                  value={draft.role}
                  disabled={disabled}
                  onValueChange={role => update(key, { role: role as IllustrationAttachableReferenceRole })}
                >
                  <Select.Item value="likeness" description="Keeps this figure’s face, hair, build and attire">
                    {ROLE_LABEL.likeness}
                  </Select.Item>
                  <Select.Item value="style" description="Lends palette, medium and rendering only">
                    {ROLE_LABEL.style}
                  </Select.Item>
                </Select>
                <Input
                  size="sm"
                  className={styles.noteInput}
                  aria-label={`Note for ${label}`}
                  value={draft.note}
                  maxLength={MAX_REFERENCE_NOTE_LENGTH}
                  disabled={disabled}
                  placeholder="Which figure? e.g. the armored man in the center"
                  onValueChange={note => update(key, { note })}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface ReferenceWarningsProps {
  title: string;
  warnings: ReferenceWarningResponse[];
  meta: Map<string, ReferenceMeta>;
  onDismiss: () => void;
}

function ReferenceWarnings({ title, warnings, meta, onDismiss }: ReferenceWarningsProps): React.JSX.Element | null {
  if (warnings.length === 0) return null;
  return (
    <Alert intent="warning" title={title} onDismiss={onDismiss}>
      <ul className={styles.warningList}>
        {warnings.map((warning, index) => (
          <li key={`${referenceKey(warning)}-${warning.code}-${index}`}>{describeReferenceWarning(warning, meta)}</li>
        ))}
      </ul>
    </Alert>
  );
}

interface CandidateReferencesProps {
  references: IllustrationReferenceResponse[];
}

export function CandidateReferences({ references }: CandidateReferencesProps): React.JSX.Element | null {
  if (references.length === 0) return null;
  return (
    <ul className={styles.candidateRefs} aria-label="Reference images sent with this candidate">
      {references.map(reference => (
        <li key={reference.ref} className={styles.candidateRef}>
          <Thumb url={reference.url} size="sm" />
          <span className={styles.candidateRefText}>
            <span className={styles.candidateRefLabel}>
              {reference.role === 'edit-source' ? 'Image being edited' : capitalize(reference.name ?? reference.label ?? reference.source)}
            </span>
            {reference.role !== 'edit-source' && <span className={styles.candidateRefRole}>{ROLE_LABEL[reference.role]}</span>}
            {reference.note && <span className={styles.candidateRefNote}>“{reference.note}”</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface StartReferencesSectionProps {
  subjectType: IllustrationSubjectType;
  ready: boolean;
  options: ReferenceOptionsResponse | undefined;
  loading: boolean;
  refreshing: boolean;
  error: ApiError | null;
  plan: StartSlotPlan | undefined;
  drafts: DraftReference[];
  onDraftsChange: (next: DraftReference[]) => void;
  autoReferences: boolean;
  onAutoReferencesChange: (next: boolean) => void;
  disabled: boolean;
}

export function StartReferencesSection(props: StartReferencesSectionProps): React.JSX.Element {
  const { subjectType, ready, options, loading, refreshing, error, plan, drafts, onDraftsChange, autoReferences, onAutoReferencesChange, disabled } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const headingId = useId();
  const meta = collectReferenceMeta(options, options?.autoPreview);
  const attached = attachedMarkers(drafts, meta);
  const previewWarnings = autoReferences && !refreshing ? (options?.autoPreviewWarnings ?? []) : [];
  const nothingAuto = autoReferences && !refreshing && options && options.autoPreview.length === 0 && previewWarnings.length === 0;

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHead}>
        <span id={headingId} className={styles.sectionTitle}>
          Reference images
        </span>
        {plan && (
          <Badge intent={plan.overBy > 0 ? 'danger' : 'neutral'} aria-live="polite">
            {plan.overBy > 0
              ? `${plan.attachedCount} attached · ${plan.capacity} ${slotNoun(plan.capacity)} available`
              : `Sending ${plan.used} of ${plan.capacity} reference ${slotNoun(plan.capacity)}`}
          </Badge>
        )}
      </div>
      <p className={styles.muted}>Images the model looks at while rendering. Likeness keeps a figure consistent; style lends palette and medium.</p>

      {!ready && (
        <p className={styles.muted}>{subjectType === 'chapter' ? 'Enter a chapter number to see suggested references.' : 'Choose an entity to see suggested references.'}</p>
      )}
      {ready && loading && <Spinner size="sm" label="Loading reference images" />}
      {ready && error && <p className={styles.errorText}>Couldn’t load reference images: {error.message}</p>}

      {ready && options && subjectType !== 'cover' && (
        <>
          <Checkbox
            label="Use automatic references"
            description={AUTO_DESCRIPTION[subjectType]}
            checked={autoReferences}
            disabled={disabled}
            onCheckedChange={v => onAutoReferencesChange(v === true)}
          />
          {!refreshing && plan && plan.sentAuto.length > 0 && (
            <ul className={styles.chips} aria-label="Automatic reference images">
              {plan.sentAuto.map(reference => (
                <li key={referenceKey(reference)} className={styles.chip}>
                  <Thumb url={reference.url} size="sm" />
                  <span>
                    {capitalize(reference.label ?? reference.source)} — {reasonLabel(reference.reason)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!refreshing && plan && plan.droppedAuto.length > 0 && (
            <p className={styles.muted}>
              Not sent — attached references take priority: {plan.droppedAuto.map(reference => capitalize(reference.label ?? reference.source)).join(', ')}.
            </p>
          )}
          {previewWarnings.length > 0 && (
            <ul className={styles.mutedList}>
              {previewWarnings.map((warning, index) => (
                <li key={`${referenceKey(warning)}-${index}`}>{describeReferenceWarning(warning, meta)}</li>
              ))}
            </ul>
          )}
          {nothingAuto && <p className={styles.muted}>{AUTO_EMPTY[subjectType]}</p>}
        </>
      )}

      <AttachedReferenceList drafts={drafts} meta={meta} disabled={disabled} onChange={onDraftsChange} />

      {plan && plan.overBy > 0 && (
        <Alert intent="danger" title="Too many reference images">
          This image model takes {plan.capacity} reference {plan.capacity === 1 ? 'image' : 'images'} per generation. Remove {plan.overBy} to continue.
        </Alert>
      )}

      <div>
        <Button variant="secondary" size="sm" prefix={<PlusIcon />} disabled={disabled || !ready || !options} onClick={() => setPickerOpen(true)}>
          Add reference
        </Button>
      </div>

      <ReferencePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        options={options}
        loading={loading}
        attached={attached}
        onPick={option => onDraftsChange(addDraftReference(drafts, option, subjectType))}
      />
    </section>
  );
}

interface IllustrationReferencesPanelProps {
  novelId: string;
  illustration: IllustrationResponse;
  busy: boolean;
  warnings: ReferenceWarningResponse[];
  warningsKind: ReferenceRoundKind;
  onSaved: (result: IllustrationResponse) => void;
  onDismissWarnings: () => void;
}

export function IllustrationReferencesPanel(props: IllustrationReferencesPanelProps): React.JSX.Element {
  const { novelId, illustration, busy, warnings, warningsKind, onSaved, onDismissWarnings } = props;
  const active = illustration.status === 'active';
  const stored = illustration.attachedReferences;
  const optionsQuery = useReferenceOptionsQuery(novelId, { subjectType: illustration.subjectType, subjectKey: illustration.subjectKey ?? undefined }, active);
  const update = useUpdateIllustrationReferencesMutation(novelId, illustration.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drafts, setDrafts] = useState(() => toDraftReferences(stored));
  const [autoReferences, setAutoReferences] = useState(illustration.autoReferences);

  const signature = JSON.stringify([stored, illustration.autoReferences]);
  const [seeded, setSeeded] = useState(signature);
  const reset = (): void => {
    setDrafts(toDraftReferences(stored));
    setAutoReferences(illustration.autoReferences);
  };
  if (seeded !== signature) {
    setSeeded(signature);
    reset();
  }

  const options = optionsQuery.data;
  const meta = collectReferenceMeta(options, illustration.references);
  const editSourceUrl = illustration.selectedUrl ?? illustration.candidates.at(-1)?.imageUrl ?? undefined;
  const hasEditSource = editSourceUrl !== undefined;
  const plan = options ? planRefineSlots({ capacity: options.capacity, editSourceUrl, drafts, stored, meta }) : undefined;
  const dirty = !sameAttachedSet(drafts, stored) || autoReferences !== illustration.autoReferences;
  const pending = busy || update.isPending;
  const noFreeSlot = plan !== undefined && hasEditSource && plan.freeSlots === 0;
  const newFillFreeSlots = plan !== undefined && !noFreeSlot && !plan.canAdd;
  const shownWarnings = visibleRoundWarnings(warnings, warningsKind, noFreeSlot, stored);
  const warningsAlert = <ReferenceWarnings title={WARNINGS_TITLE[warningsKind]} warnings={shownWarnings} meta={meta} onDismiss={onDismissWarnings} />;

  if (!active) {
    return (
      <div className={styles.panel}>
        {warningsAlert}
        {stored.length === 0 ? (
          <p className={styles.muted}>No reference images were attached.</p>
        ) : (
          <AttachedReferenceList drafts={toDraftReferences(stored)} meta={meta} disabled onChange={() => undefined} />
        )}
        {illustration.subjectType !== 'cover' && <p className={styles.muted}>Automatic references were {illustration.autoReferences ? 'on' : 'off'}.</p>}
      </div>
    );
  }

  const save = (): void => {
    update.mutate(
      { references: buildAttachPayload(drafts), autoReferences },
      {
        onSuccess: result => {
          toast.success('References saved — the next re-render uses them');
          onSaved(result);
        },
        onError: err => toast.danger(referenceErrorMessage(err)),
      },
    );
  };

  return (
    <div className={styles.panel}>
      {warningsAlert}
      {optionsQuery.isLoading && <Spinner size="sm" label="Loading reference images" />}
      {optionsQuery.error && <p className={styles.errorText}>Couldn’t load reference images: {optionsQuery.error.message}</p>}

      {noFreeSlot ? (
        <Alert intent="info" title="No room for more references">
          {EDIT_SOURCE_ONLY_COPY}
        </Alert>
      ) : (
        plan && (
          <p className={styles.muted}>
            {hasEditSource
              ? `The image being edited takes 1 of ${plan.capacity} reference ${slotNoun(plan.capacity)}; ${plan.freeSlots} left for attached and automatic references.`
              : `${plan.capacity} reference ${slotNoun(plan.capacity)} per generation.`}
          </p>
        )
      )}

      {illustration.subjectType !== 'cover' && (
        <Checkbox
          label="Use automatic references"
          description={noFreeSlot ? 'Kept for later, but not sent while the image being edited fills the only slot.' : AUTO_DESCRIPTION[illustration.subjectType]}
          checked={autoReferences}
          disabled={pending}
          onCheckedChange={v => setAutoReferences(v === true)}
        />
      )}

      <AttachedReferenceList
        drafts={drafts}
        meta={meta}
        disabled={pending}
        unsentKeys={plan?.unsentKeys}
        editSourceKeys={editSourceKeys(drafts, meta, editSourceUrl)}
        onChange={setDrafts}
      />

      {plan && plan.overBy > 0 && (
        <Alert intent="danger" title="Too many new reference images">
          Only {plan.freeSlots} {slotNoun(plan.freeSlots)} {plan.freeSlots === 1 ? 'is' : 'are'} free beside the image being edited. Remove {plan.overBy} to save.
        </Alert>
      )}

      <div className={styles.actions}>
        <Button variant="secondary" size="sm" prefix={<PlusIcon />} disabled={pending || !plan?.canAdd} onClick={() => setPickerOpen(true)}>
          Add reference
        </Button>
        {newFillFreeSlots && <span className={styles.muted}>New references already fill the free {slotNoun(plan?.freeSlots ?? 0)}.</span>}
        {dirty && (
          <>
            <span className={styles.spacer} />
            <span className={styles.muted}>Unsaved — re-renders use the saved set.</span>
            <Button variant="ghost" size="sm" disabled={pending} onClick={reset}>
              Reset
            </Button>
            <Button variant="primary" size="sm" loading={update.isPending} disabled={busy || (plan?.overBy ?? 0) > 0} onClick={save}>
              Save references
            </Button>
          </>
        )}
      </div>

      <ReferencePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        options={options}
        loading={optionsQuery.isLoading}
        attached={attachedMarkers(drafts, meta)}
        excludeKeys={new Set([referenceKey({ source: 'candidate', sourceId: illustration.id })])}
        onPick={option => setDrafts(addDraftReference(drafts, option, illustration.subjectType))}
      />
    </div>
  );
}
