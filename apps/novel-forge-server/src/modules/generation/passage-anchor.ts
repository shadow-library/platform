import { createHash } from 'node:crypto';

export const MAX_PASSAGE_CHARS = 6000;
export const ANCHOR_CONTEXT_CHARS = 32;

/** Offsets are UTF-16 code units into the draft body, the same indices a browser's string and selection APIs use. */
export interface PassageAnchor {
  start: number;
  end: number;
  passageHash: string;
  passage: string;
  contextBefore: string;
  contextAfter: string;
}

export type PassageLocation = { freshness: 'fresh' | 'relocated'; start: number; end: number } | { freshness: 'stale'; start: null; end: null };

const STALE: PassageLocation = { freshness: 'stale', start: null, end: null };

export function passageHash(passage: string): string {
  return createHash('sha256').update(passage).digest('hex');
}

export function isWithinBody(body: string, start: number, end: number): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= body.length && end - start <= MAX_PASSAGE_CHARS;
}

export function anchorContext(body: string, start: number, end: number): Pick<PassageAnchor, 'contextBefore' | 'contextAfter'> {
  return { contextBefore: body.slice(Math.max(0, start - ANCHOR_CONTEXT_CHARS), start), contextAfter: body.slice(end, end + ANCHOR_CONTEXT_CHARS) };
}

function surroundedAt(body: string, anchor: PassageAnchor, start: number, end: number): boolean {
  return body.slice(Math.max(0, start - anchor.contextBefore.length), start) === anchor.contextBefore && body.slice(end, end + anchor.contextAfter.length) === anchor.contextAfter;
}

/**
 * Where the anchored passage sits in the body as it stands. It is fresh when its offsets still hold the hashed text between the same context, and
 * relocated when that text with the same context on both sides now occurs exactly once elsewhere — a clean move. Anything else is stale: an edit in
 * or around the passage, or a copy that cannot be told apart, could otherwise rewrite the wrong words.
 */
export function locatePassage(body: string, anchor: PassageAnchor): PassageLocation {
  const inPlace = passageHash(body.slice(anchor.start, anchor.end)) === anchor.passageHash;
  if (inPlace && surroundedAt(body, anchor, anchor.start, anchor.end)) return { freshness: 'fresh', start: anchor.start, end: anchor.end };
  if (passageHash(anchor.passage) !== anchor.passageHash) return STALE;

  const needle = `${anchor.contextBefore}${anchor.passage}${anchor.contextAfter}`;
  const found = body.indexOf(needle);
  if (found === -1 || body.indexOf(needle, found + 1) !== -1) return STALE;
  const start = found + anchor.contextBefore.length;
  return { freshness: 'relocated', start, end: start + anchor.passage.length };
}

export function replacePassage(body: string, location: { start: number; end: number }, replacement: string): string {
  return `${body.slice(0, location.start)}${replacement}${body.slice(location.end)}`;
}
