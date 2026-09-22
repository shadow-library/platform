import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

import { type AnchoredLine, anchorLine, EMPTY_ANCHORED_LINE, readAnchoredLine } from './anchored-line';
import { decisionPayload, lockedDecision, passList, passText, sameJson } from './engine-pass';

export const PLACES_TOPIC = 'places';
export const PLACES_BACKLOG_TOPIC = 'places.backlog';
export const PLACES_NAME_MAX = 80;
export const PLACES_LINE_MAX = 200;
export const PLACES_WRITER_LINE_MAX = 240;
export const PLACES_WHY_MAX = 400;
export const PLACES_MAX = 12;
export const BACKLOG_MAX = 8;

export type PlaceKind = 'place' | 'faction';
export type PlaceDepth = 'deep' | 'sketch';

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = { place: 'Place', faction: 'Faction' };
export const PLACE_DEPTH_LABELS: Record<PlaceDepth, string> = { deep: 'In detail', sketch: 'A sketch' };

/** The coach's test, shown where the author decides: it is the one question that keeps world-building from outrunning the chapters. */
export const BACKLOG_TEST = 'Does this change a sentence in the next 20 chapters? If not, backlog it.';

export interface PlaceOption {
  id: string;
  name: string;
  kind: PlaceKind;
  detail: PlaceDepth;
  summary: string;
  usedIn: string;
}

export interface BacklogOption {
  id: string;
  item: string;
  why: string;
}

export interface PlacesRound {
  places: PlaceOption[];
  backlog: BacklogOption[];
}

const isKind = (value: unknown): value is PlaceKind => value === 'place' || value === 'faction';
const isDepth = (value: unknown): value is PlaceDepth => value === 'deep' || value === 'sketch';

export function parsePlacesRound(round: BlueprintRoundResponse | null): PlacesRound {
  const options = round?.options as { places?: unknown; backlog?: unknown } | null;
  const places = passList(options?.places).flatMap(item => {
    const place = item as Partial<PlaceOption>;
    return typeof place.id === 'string'
      ? [
          {
            id: place.id,
            name: passText(place.name),
            kind: isKind(place.kind) ? place.kind : ('place' as const),
            detail: isDepth(place.detail) ? place.detail : ('sketch' as const),
            summary: passText(place.summary),
            usedIn: passText(place.usedIn),
          },
        ]
      : [];
  });
  const backlog = passList(options?.backlog).flatMap(item => {
    const entry = item as Partial<BacklogOption>;
    return typeof entry.id === 'string' ? [{ id: entry.id, item: passText(entry.item), why: passText(entry.why) }] : [];
  });
  return { places, backlog };
}

export interface PlaceDraft {
  optionId?: string;
  name: string;
  kind: PlaceKind;
  detail: PlaceDepth;
  summary: string;
  usedIn: string;
}

export interface BacklogDraft {
  optionId?: string;
  item: string;
  why: string;
}

export interface PlacesDraft {
  places: PlaceDraft[];
  backlog: BacklogDraft[];
  why: AnchoredLine;
  writerLine: AnchoredLine;
}

export function placesAnchor(places: PlaceDraft[]): string {
  return places
    .filter(place => place.name.trim())
    .map(place => place.name.trim())
    .join(', ');
}

export function editPlace(places: PlaceDraft[], index: number, patch: Partial<Omit<PlaceDraft, 'optionId'>>): PlaceDraft[] {
  const next = places.map((place, at) => {
    if (at !== index) return place;
    const name = patch.name ?? place.name;
    return { ...place, ...patch, ...(name.trim() === place.name.trim() ? {} : { optionId: undefined }) };
  });
  return next.filter((place, at) => place.name.trim().length > 0 || at === index);
}

export function editBacklogItem(backlog: BacklogDraft[], index: number, patch: Partial<Omit<BacklogDraft, 'optionId'>>): BacklogDraft[] {
  const next = backlog.map((entry, at) => {
    if (at !== index) return entry;
    const item = patch.item ?? entry.item;
    return { ...entry, ...patch, ...(item.trim() === entry.item.trim() ? {} : { optionId: undefined }) };
  });
  return next.filter((entry, at) => entry.item.trim().length > 0 || at === index);
}

/**
 * Sending a place to the backlog keeps the idea and takes it out of what volume one is built from — the deferral, not the refusal. The
 * screen hands it the list it renders, which ends in the blank row offered for the next place; that row is dropped, never committed.
 */
export function backlogPlace(draft: PlacesDraft, index: number): PlacesDraft {
  const place = draft.places[index];
  if (!place?.name.trim()) return { ...draft, places: draft.places.filter(candidate => candidate.name.trim().length > 0) };
  return {
    ...draft,
    places: draft.places.filter((candidate, at) => at !== index && candidate.name.trim().length > 0),
    backlog: [...draft.backlog, { item: place.name.trim(), why: place.summary.trim() }].slice(0, BACKLOG_MAX),
  };
}

/** Exactly the places a lock would carry: the screen anchors its lines to these, so what it shows and what it sends can never disagree. */
export function committedPlaces(draft: PlacesDraft): PlaceDraft[] {
  return draft.places.filter(place => place.name.trim() && place.summary.trim()).slice(0, PLACES_MAX);
}

export function placesDraftAnchor(draft: PlacesDraft): string {
  return placesAnchor(committedPlaces(draft));
}

/** Why the lock is unavailable, in the author's words. `buildPlacesSelection` refuses exactly when this answers. */
export function placesLockIssue(draft: PlacesDraft): string | null {
  const places = committedPlaces(draft);
  if (places.length === 0) return 'Every place and faction needs a name and a line saying what it is.';
  if (!places.some(place => place.detail === 'deep')) return 'Nowhere is detailed — say which of these volume one actually happens in.';
  if (!readAnchoredLine(draft.writerLine, placesAnchor(places)).text.trim()) return 'Say what these places mean for whoever writes chapter one.';
  return null;
}

export interface PlacesSelectionBody {
  places: { optionId?: string; name: string; kind: PlaceKind; detail: PlaceDepth; summary: string; usedIn?: string }[];
  backlog?: { optionId?: string; item: string; why?: string }[];
  why?: string;
  writerLine: string;
}

export function buildPlacesSelection(draft: PlacesDraft): PlacesSelectionBody | null {
  if (placesLockIssue(draft)) return null;

  const places = committedPlaces(draft);
  const anchor = placesAnchor(places);
  const writerLine = readAnchoredLine(draft.writerLine, anchor).text.trim();
  const backlog = draft.backlog.filter(entry => entry.item.trim()).slice(0, BACKLOG_MAX);
  const why = readAnchoredLine(draft.why, anchor).text.trim();

  return {
    places: places.map(place => ({
      ...(place.optionId ? { optionId: place.optionId } : {}),
      name: place.name.trim(),
      kind: place.kind,
      detail: place.detail,
      summary: place.summary.trim(),
      ...(place.usedIn.trim() ? { usedIn: place.usedIn.trim() } : {}),
    })),
    ...(backlog.length > 0
      ? {
          backlog: backlog.map(entry => ({
            ...(entry.optionId ? { optionId: entry.optionId } : {}),
            item: entry.item.trim(),
            ...(entry.why.trim() ? { why: entry.why.trim() } : {}),
          })),
        }
      : {}),
    ...(why ? { why } : {}),
    writerLine,
  };
}

export function placesDraftFrom(round: PlacesRound): PlacesDraft {
  return {
    places: round.places.map(place => ({ optionId: place.id, name: place.name, kind: place.kind, detail: place.detail, summary: place.summary, usedIn: place.usedIn })),
    backlog: round.backlog.map(entry => ({ optionId: entry.id, item: entry.item, why: entry.why })),
    why: EMPTY_ANCHORED_LINE,
    writerLine: EMPTY_ANCHORED_LINE,
  };
}

/**
 * The places decision plus every backlog entry already in the Notebook. A backlog entry no lock replaces, so restoring it is what keeps
 * the screen from asking the author to defer the same idea twice.
 */
export function restorePlacesDraft(entries: LedgerEntryResponse[]): PlacesDraft | null {
  const decided = lockedDecision(entries, PLACES_TOPIC);
  const backlog = entries.filter(entry => entry.kind === 'backlog' && entry.topic === PLACES_BACKLOG_TOPIC);
  if (!decided && backlog.length === 0) return null;

  const places = passList(decisionPayload(decided)['places']).map(item => {
    const place = item as { name?: unknown; kind?: unknown; detail?: unknown; summary?: unknown; usedIn?: unknown };
    return {
      name: passText(place.name),
      kind: isKind(place.kind) ? place.kind : ('place' as const),
      detail: isDepth(place.detail) ? place.detail : ('sketch' as const),
      summary: passText(place.summary),
      usedIn: passText(place.usedIn),
    };
  });
  const anchor = placesAnchor(places);
  return {
    places,
    backlog: backlog.map(entry => ({ item: entry.statement, why: entry.why ?? '' })),
    why: anchorLine(decided?.why ?? '', anchor),
    writerLine: anchorLine(decided?.writerLine ?? '', anchor),
  };
}

function resolvePlaces(places: PlaceDraft[], round: PlacesRound): PlaceDraft[] {
  return places.map(place => ({ ...place, optionId: round.places.find(option => option.name.trim() === place.name.trim())?.id }));
}

function resolveBacklog(backlog: BacklogDraft[], round: PlacesRound): BacklogDraft[] {
  return backlog.map(entry => ({ ...entry, optionId: round.backlog.find(option => option.item.trim() === entry.item.trim())?.id }));
}

export function nextPlacesDraft(current: PlacesDraft, offered: PlacesDraft, round: PlacesRound): PlacesDraft {
  const fresh = placesDraftFrom(round);
  return {
    places: sameJson(current.places, offered.places) ? fresh.places : resolvePlaces(current.places, round),
    backlog: sameJson(current.backlog, offered.backlog) ? fresh.backlog : resolveBacklog(current.backlog, round),
    why: current.why,
    writerLine: current.writerLine,
  };
}
