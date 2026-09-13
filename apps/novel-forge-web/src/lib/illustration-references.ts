import {
  type AttachedReferenceResponse,
  type AttachReferenceBody,
  type IllustrationAttachableReferenceRole,
  type IllustrationReferenceResponse,
  type IllustrationReferenceRole,
  type IllustrationReferenceSource,
  type IllustrationSubjectType,
  type ReferenceOptionResponse,
  type ReferenceOptionsResponse,
  type ReferenceWarningResponse,
} from './apis/api-types.gen';
import { type ApiError } from './apis/transport';

export const MAX_REFERENCE_NOTE_LENGTH = 300;

export interface DraftReference {
  source: IllustrationReferenceSource;
  sourceId?: string;
  role: IllustrationAttachableReferenceRole;
  note: string;
}

export interface ReferenceMeta {
  label?: string;
  url: string;
}

export interface StartSlotPlan {
  capacity: number;
  attachedCount: number;
  used: number;
  overBy: number;
  sentAuto: IllustrationReferenceResponse[];
  droppedAuto: IllustrationReferenceResponse[];
}

export interface RefineSlotPlanInput {
  capacity: number;
  editSourceUrl?: string;
  drafts: DraftReference[];
  stored: AttachedReferenceResponse[];
  meta: Map<string, ReferenceMeta>;
}

export interface RefineSlotPlan {
  capacity: number;
  freeSlots: number;
  newCount: number;
  canAdd: boolean;
  overBy: number;
  unsentKeys: Set<string>;
}

export interface AttachedMarkers {
  keys: Set<string>;
  urls: Set<string>;
}

export type ReferenceRoundKind = 'start' | 'refine' | 'save';

type ReferenceIdentity = Pick<AttachReferenceBody, 'source' | 'sourceId'>;

const SOURCE_FALLBACK_LABEL: Record<IllustrationReferenceSource, string> = {
  cover: 'the project cover',
  portrait: 'a portrait',
  gallery: 'a gallery image',
  'chapter-image': 'a chapter scene image',
  candidate: 'another illustration',
};

export const ROLE_LABEL: Record<IllustrationReferenceRole, string> = { likeness: 'Likeness', style: 'Style', 'edit-source': 'Image being edited' };

const REASON_LABEL: Record<string, string> = {
  'auto:entity-portrait': 'auto',
  'auto:chapter-cast': 'chapter cast',
  'auto:edit-source': 'being edited',
  attached: 'attached',
};

export function referenceKey(reference: ReferenceIdentity): string {
  return `${reference.source}:${reference.sourceId ?? ''}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? (reason.startsWith('auto:') ? 'auto' : reason);
}

export function slotNoun(count: number): string {
  return count === 1 ? 'slot' : 'slots';
}

export function defaultRole(subjectType: IllustrationSubjectType, option: Pick<ReferenceOptionResponse, 'source' | 'subjectType'>): IllustrationAttachableReferenceRole {
  if (subjectType === 'cover') return 'style';
  if (option.source === 'portrait' || option.source === 'gallery' || option.source === 'cover') return 'likeness';
  if (option.source === 'candidate' && option.subjectType === 'entity') return 'likeness';
  return 'style';
}

export function allOptions(options: ReferenceOptionsResponse | undefined): ReferenceOptionResponse[] {
  if (!options) return [];
  return [...(options.cover ? [options.cover] : []), ...options.portraits, ...options.gallery, ...options.chapterImages, ...options.candidates];
}

export function collectReferenceMeta(options: ReferenceOptionsResponse | undefined, sent: IllustrationReferenceResponse[] = []): Map<string, ReferenceMeta> {
  const meta = new Map<string, ReferenceMeta>();
  for (const reference of sent) if (reference.role !== 'edit-source') meta.set(referenceKey(reference), { label: reference.label, url: reference.url });
  for (const option of allOptions(options)) meta.set(referenceKey(option), { label: option.label, url: option.url });
  return meta;
}

export function labelOf(reference: ReferenceIdentity, meta: Map<string, ReferenceMeta>): string {
  const known = meta.get(referenceKey(reference))?.label;
  if (known) return capitalize(known);
  if (reference.source === 'portrait' && reference.sourceId) return `Portrait of ${reference.sourceId}`;
  return capitalize(SOURCE_FALLBACK_LABEL[reference.source]);
}

/** The server dedupes references by storage object, and an option's public `url` is derived from that object, so it identifies the image across sources. */
export function imageOf(reference: ReferenceIdentity, meta: Map<string, ReferenceMeta>): string {
  return meta.get(referenceKey(reference))?.url ?? referenceKey(reference);
}

function uniqueImages<T extends ReferenceIdentity>(references: T[], meta: Map<string, ReferenceMeta>): T[] {
  const seen = new Set<string>();
  return references.filter(reference => {
    const image = imageOf(reference, meta);
    if (seen.has(image)) return false;
    seen.add(image);
    return true;
  });
}

export function attachedMarkers(drafts: DraftReference[], meta: Map<string, ReferenceMeta>): AttachedMarkers {
  return { keys: new Set(drafts.map(referenceKey)), urls: new Set(drafts.map(draft => meta.get(referenceKey(draft))?.url).filter(url => url !== undefined)) };
}

export function isAttached(reference: ReferenceIdentity & { url: string }, markers: AttachedMarkers): boolean {
  return markers.keys.has(referenceKey(reference)) || markers.urls.has(reference.url);
}

export function addDraftReference(drafts: DraftReference[], option: ReferenceOptionResponse, subjectType: IllustrationSubjectType): DraftReference[] {
  if (drafts.some(draft => referenceKey(draft) === referenceKey(option))) return drafts;
  return [...drafts, { source: option.source, ...(option.sourceId === undefined ? {} : { sourceId: option.sourceId }), role: defaultRole(subjectType, option), note: '' }];
}

export function toDraftReferences(stored: AttachedReferenceResponse[]): DraftReference[] {
  return stored.map(reference => ({
    source: reference.source,
    ...(reference.sourceId === undefined ? {} : { sourceId: reference.sourceId }),
    role: reference.role,
    note: reference.note ?? '',
  }));
}

export function buildAttachPayload(drafts: DraftReference[]): AttachReferenceBody[] {
  const seen = new Set<string>();
  const payload: AttachReferenceBody[] = [];
  for (const draft of drafts) {
    const key = referenceKey(draft);
    if (seen.has(key)) continue;
    seen.add(key);
    const note = draft.note.trim().slice(0, MAX_REFERENCE_NOTE_LENGTH);
    payload.push({ source: draft.source, ...(draft.sourceId === undefined ? {} : { sourceId: draft.sourceId }), role: draft.role, ...(note ? { note } : {}) });
  }
  return payload;
}

export function sameAttachedSet(drafts: DraftReference[], stored: AttachedReferenceResponse[]): boolean {
  return JSON.stringify(buildAttachPayload(drafts)) === JSON.stringify(buildAttachPayload(toDraftReferences(stored)));
}

/** Placeholder data belongs to the previous subject: its capacity is project-wide and still valid, its auto preview is not. */
export function settledStartOptions(options: ReferenceOptionsResponse | undefined, isPlaceholderData: boolean): ReferenceOptionsResponse | undefined {
  if (!options || !isPlaceholderData) return options;
  return { ...options, autoPreview: [], autoPreviewWarnings: [] };
}

export function editSourceKeys(drafts: DraftReference[], meta: Map<string, ReferenceMeta>, editSourceUrl: string | undefined): Set<string> {
  if (!editSourceUrl) return new Set();
  return new Set(drafts.filter(draft => imageOf(draft, meta) === editSourceUrl).map(referenceKey));
}

export function planStartSlots(
  capacity: number,
  drafts: DraftReference[],
  autoReferences: boolean,
  autoPreview: IllustrationReferenceResponse[],
  meta: Map<string, ReferenceMeta>,
): StartSlotPlan {
  const markers = attachedMarkers(drafts, meta);
  const attachedCount = uniqueImages(buildAttachPayload(drafts), meta).length;
  const autos = autoReferences ? autoPreview.filter(reference => !isAttached(reference, markers)) : [];
  const freeForAuto = Math.max(0, capacity - attachedCount);
  const sentAuto = autos.slice(0, freeForAuto);
  return {
    capacity,
    attachedCount,
    used: Math.min(capacity, attachedCount) + sentAuto.length,
    overBy: Math.max(0, attachedCount - capacity),
    sentAuto,
    droppedAuto: autos.slice(freeForAuto),
  };
}

/**
 * On refine the edited image always takes the first slot. Stored entries are carried and only warn when out of slots,
 * while entries new to the stored set must fit beside the edit source or the server refuses the update with ILL_011.
 */
export function planRefineSlots({ capacity, editSourceUrl, drafts, stored, meta }: RefineSlotPlanInput): RefineSlotPlan {
  const freeSlots = Math.max(0, capacity - (editSourceUrl ? 1 : 0));
  const storedKeys = new Set(stored.map(referenceKey));
  const payload = buildAttachPayload(drafts).filter(reference => imageOf(reference, meta) !== editSourceUrl);
  const fresh = uniqueImages(
    payload.filter(reference => !storedKeys.has(referenceKey(reference))),
    meta,
  );
  const sentOrder = uniqueImages([...fresh, ...payload.filter(reference => storedKeys.has(referenceKey(reference)))], meta);
  const unsentImages = new Set(sentOrder.slice(freeSlots).map(reference => imageOf(reference, meta)));
  return {
    capacity,
    freeSlots,
    newCount: fresh.length,
    canAdd: fresh.length < freeSlots,
    overBy: Math.max(0, fresh.length - freeSlots),
    unsentKeys: new Set(payload.filter(reference => unsentImages.has(imageOf(reference, meta))).map(referenceKey)),
  };
}

/** A capacity-trimmed warning for a reference the author never attached came from the auto-rules, which the no-free-slot notice already explains on refine and save. */
export function visibleRoundWarnings(
  warnings: ReferenceWarningResponse[],
  kind: ReferenceRoundKind,
  noFreeSlot: boolean,
  stored: AttachedReferenceResponse[],
): ReferenceWarningResponse[] {
  if (kind === 'start' || !noFreeSlot) return warnings;
  const storedKeys = new Set(stored.map(referenceKey));
  return warnings.filter(warning => warning.code !== 'capacity-trimmed' || storedKeys.has(referenceKey(warning)));
}

export function describeReferenceWarning(warning: ReferenceWarningResponse, meta: Map<string, ReferenceMeta>): string {
  const label = labelOf(warning, meta);
  switch (warning.code) {
    case 'capacity-trimmed':
      return `${label} not sent: no free reference slot`;
    case 'merged-with-edit-source': {
      const noteDropped = warning.reason.includes('note') ? ', and its note was not used' : '';
      return `${label} is the image being edited, so it is sent once as the edit source${noteDropped}`;
    }
    case 'missing-file':
      return `${label} skipped: the image no longer exists`;
    case 'too-large':
      return `${label} skipped: the file is too large to send as a reference`;
    case 'unsupported-format':
      return `${label} skipped: only PNG, JPEG and WebP images can be sent`;
  }
}

function numbersIn(message: string): number[] {
  return [...message.matchAll(/\d+/g)].map(match => Number(match[0]));
}

function megabytes(bytes: number | undefined): string {
  return bytes ? `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB` : 'the size limit';
}

function tooManyMessage(capacity: number | undefined, count: number | undefined): string {
  if (capacity === undefined || count === undefined) return 'The image model cannot take this many reference images. Remove references until they fit.';
  const excess = count - capacity;
  return `The image model accepts ${capacity} reference image${capacity === 1 ? '' : 's'} per generation, but ${count} were requested. Remove ${excess} to continue.`;
}

export function referenceErrorMessage(error: Pick<ApiError, 'code' | 'message'>): string {
  const numbers = numbersIn(error.message);
  switch (error.code) {
    case 'ILL_009':
      return 'A reference image could not be identified. Remove it and pick it again from the list.';
    case 'ILL_010':
      return 'A reference image no longer exists in this project. Remove it and pick another.';
    case 'ILL_011':
      return tooManyMessage(numbers[0], numbers[1]);
    case 'ILL_012':
      return `A reference image is over ${megabytes(numbers.at(-1))}. Pick a smaller image.`;
    case 'ILL_013':
      return `The reference images together are over ${megabytes(numbers.at(-1))}. Remove one or pick smaller images.`;
    case 'ILL_014':
      return 'A reference image is not PNG, JPEG or WebP, so it cannot be sent.';
    case 'ILL_015':
      return 'The image being edited is already sent as the edit source and cannot be attached again.';
    case 'AI_010':
      return tooManyMessage(numbers.at(-2), numbers.at(-1));
    default:
      return error.message;
  }
}
