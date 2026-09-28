import { type NovelBundle } from './novel-import.dto';

interface BundleIssue {
  field: string;
  msg: string;
}

interface FlattenedChapter {
  /** 1-based, derived by flattening volumes in ordinal order — never carried in the bundle itself. */
  number: number;
  title: string;
  content: string;
  volumeOrdinal: number;
}

interface FlattenedVolume {
  ordinal: number;
  title: string | null;
}

export interface BundleValidation {
  issues: BundleIssue[];
  /** Present (possibly empty) even when `issues` is non-empty, so callers can still inspect the shape. */
  chapters: FlattenedChapter[];
  volumes: FlattenedVolume[];
}

/**
 * The import route's body limit, and the ceiling on a bundle's chapter text plus decoded asset bytes. An import peaks near nine times
 * its body — the request text, the parsed bundle, the jsonb it is staged as, then the job's read-back of that row, each twice the
 * bytes once the prose holds a character past Latin-1 — so 16 MiB keeps two concurrent imports inside a 1 GiB pod.
 */
export const NOVEL_IMPORT_BODY_LIMIT_BYTES = 16 * 1024 * 1024;

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
 * total-size sanity check. Issues abort the import before any DB write. `chapters` is always returned (even alongside issues) as the flattened,
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
  const volumes: FlattenedVolume[] = [];
  for (const volume of [...bundle.volumes].sort((a, b) => a.ordinal - b.ordinal)) {
    for (const chapter of volume.chapters) chapters.push({ number: chapters.length + 1, title: chapter.title, content: chapter.content, volumeOrdinal: volume.ordinal });
    volumes.push({ ordinal: volume.ordinal, title: volume.title?.trim() || null });
  }

  const textBytes = chapters.reduce((sum, c) => sum + Buffer.byteLength(c.content, 'utf8'), 0);
  const assetBytes = assets.reduce((sum, a) => sum + estimateDecodedBytes(a.dataBase64), 0);
  const totalBytes = textBytes + assetBytes;
  if (totalBytes > NOVEL_IMPORT_BODY_LIMIT_BYTES) {
    issues.push({
      field: 'bundle',
      msg: `bundle content (~${Math.round(totalBytes / (1024 * 1024))}MB) exceeds the ${NOVEL_IMPORT_BODY_LIMIT_BYTES / (1024 * 1024)}MB import limit`,
    });
  }

  return { issues, chapters, volumes };
}
