export interface HeadlineCandidate {
  imageRef: string | null;
  imageVisibleFromOrdinal: number | null;
}

export interface GalleryCandidate {
  imageRef: string;
  sortOrder: number;
  visibleFromOrdinal: number;
}

/**
 * The headline a reader at `gate` may see. SQL already masks a gated headline; this repeats the check so a query that forgot the mask
 * still cannot serve it. An ungated headline, including every row pushed before headlines were gated, shows as it always has.
 */
export function visibleHeadlineRef(entry: HeadlineCandidate, gate: number): string | null {
  if (entry.imageVisibleFromOrdinal === null || entry.imageVisibleFromOrdinal <= gate) return entry.imageRef;
  return null;
}

/**
 * The list thumbnail: the visible headline, else — only when a gate hides it — the latest gallery image the reader has reached, earliest in
 * the gallery on a tie. The entry page never falls back, because its gallery already shows that image.
 */
export function listThumbnailRef(entry: HeadlineCandidate, gallery: GalleryCandidate[], gate: number): string | null {
  const headline = visibleHeadlineRef(entry, gate);
  if (headline || entry.imageVisibleFromOrdinal === null) return headline;
  const [latest] = gallery.filter(image => image.visibleFromOrdinal <= gate).sort((a, b) => b.visibleFromOrdinal - a.visibleFromOrdinal || a.sortOrder - b.sortOrder);
  return latest?.imageRef ?? null;
}
