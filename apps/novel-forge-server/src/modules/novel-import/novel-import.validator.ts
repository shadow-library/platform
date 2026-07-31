/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type NovelBundle } from './novel-import.dto';

/**
 * Defining types
 */

export interface BundleIssue {
  field: string;
  msg: string;
}

export interface FlattenedChapter {
  /** 1-based, derived by flattening volumes in ordinal order — never carried in the bundle itself. */
  number: number;
  title: string;
  content: string;
}

export interface BundleValidation {
  issues: BundleIssue[];
  /** Present (possibly empty) even when `issues` is non-empty, so callers can still inspect the shape. */
  chapters: FlattenedChapter[];
}

/**
 * Declaring the constants
 */

// Sanity ceiling on chapter text + (estimated) decoded asset bytes, independent of the HTTP transport
// body limit (see `dynamic.modules.ts`) — catches a pathological bundle with a clear field error
// instead of a bare transport-level rejection. See novel-import-format.md for the documented figure.
const MAX_BUNDLE_CONTENT_BYTES = 48 * 1024 * 1024;

function findDuplicates<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const duplicates = new Set<T>();
  for (const item of items) (seen.has(item) ? duplicates : seen).add(item);
  return [...duplicates];
}

/** Base64 decodes to ~3/4 of its encoded length; used only for the sanity check, not the real decode. */
function estimateDecodedBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Cross-item invariants the DTO layer cannot express: volume ordinal contiguity/uniqueness, a cover
 * that names a real asset, duplicate asset names, empty-content guards beyond AJV's `minLength`, and a
 * total-size sanity check. Issues abort the import before any DB write, exactly like
 * `validatePlanBundle`. `chapters` is always returned (even alongside issues) as the flattened,
 * globally-numbered chapter list the import service and job payload consume on success.
 */
export function validateNovelBundle(bundle: NovelBundle): BundleValidation {
  const issues: BundleIssue[] = [];
  const assets = bundle.assets ?? [];

  const ordinals = bundle.volumes.map(v => v.ordinal);
  for (const dup of findDuplicates(ordinals)) issues.push({ field: 'volumes', msg: `duplicate volume ordinal ${dup}` });
  const sortedOrdinals = [...new Set(ordinals)].sort((a, b) => a - b);
  if (!sortedOrdinals.every((n, i) => n === i + 1)) issues.push({ field: 'volumes', msg: 'volume ordinals must be unique and contiguous starting at 1' });

  for (const dup of findDuplicates(assets.map(a => a.name))) issues.push({ field: 'assets', msg: `duplicate asset name '${dup}'` });

  if (bundle.novel.cover && !assets.some(a => a.name === bundle.novel.cover)) {
    issues.push({ field: 'novel.cover', msg: `cover references unknown asset '${bundle.novel.cover}'` });
  }

  // Empty-content guard beyond AJV's minLength: catches whitespace-only chapter bodies.
  for (const [vi, volume] of bundle.volumes.entries()) {
    for (const [ci, chapter] of volume.chapters.entries()) {
      if (!chapter.content.trim()) issues.push({ field: `volumes[${vi}].chapters[${ci}].content`, msg: `chapter '${chapter.title}' has empty or whitespace-only content` });
    }
  }

  // Flatten in ordinal order — the only place global chapter numbers are ever derived.
  const chapters: FlattenedChapter[] = [];
  for (const volume of [...bundle.volumes].sort((a, b) => a.ordinal - b.ordinal)) {
    for (const chapter of volume.chapters) chapters.push({ number: chapters.length + 1, title: chapter.title, content: chapter.content });
  }

  const textBytes = chapters.reduce((sum, c) => sum + Buffer.byteLength(c.content, 'utf8'), 0);
  const assetBytes = assets.reduce((sum, a) => sum + estimateDecodedBytes(a.dataBase64), 0);
  const totalBytes = textBytes + assetBytes;
  if (totalBytes > MAX_BUNDLE_CONTENT_BYTES) {
    issues.push({
      field: 'bundle',
      msg: `bundle content (~${Math.round(totalBytes / (1024 * 1024))}MB) exceeds the ${MAX_BUNDLE_CONTENT_BYTES / (1024 * 1024)}MB import limit`,
    });
  }

  return { issues, chapters };
}
