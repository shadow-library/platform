export interface HeadlineCandidate {
  imageRef: string | null;
  imageVisibleFromOrdinal: number | null;
}

export interface GalleryCandidate {
  imageRef: string;
  sortOrder: number;
  visibleFromOrdinal: number;
}

/** SQL already masks a gated headline; this repeats the check so a query that forgot the mask still cannot serve it. */
export function visibleHeadlineRef(entry: HeadlineCandidate, gate: number): string | null {
  if (entry.imageVisibleFromOrdinal === null || entry.imageVisibleFromOrdinal <= gate) return entry.imageRef;
  return null;
}

/** The list thumbnail falls back to the latest reached gallery image only when a gate hides the headline; the entry page never falls back, as its gallery already shows it. */
export function listThumbnailRef(entry: HeadlineCandidate, gallery: GalleryCandidate[], gate: number): string | null {
  const headline = visibleHeadlineRef(entry, gate);
  if (headline || entry.imageVisibleFromOrdinal === null) return headline;
  const [latest] = gallery.filter(image => image.visibleFromOrdinal <= gate).sort((a, b) => b.visibleFromOrdinal - a.visibleFromOrdinal || a.sortOrder - b.sortOrder);
  return latest?.imageRef ?? null;
}
