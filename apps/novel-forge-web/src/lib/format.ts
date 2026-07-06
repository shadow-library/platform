/**
 * Presentation helpers for backend resources.
 *
 * The API models are intentionally lean (no cover art, no display genre), so
 * the UI derives a few stable presentational bits from the data it does have.
 */
import { type ProjectResponse } from '@/lib/apis';

/** A deterministic, pleasant cover colour derived from an id — stable per project. */
export function coverColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 42% 32%)`;
}

/** The best human title for a project — its explicit title, falling back to its name. */
export function projectTitle(project: Pick<ProjectResponse, 'name' | 'title'>): string {
  return project.title?.trim() || project.name;
}

const kindLabels: Record<ProjectResponse['kind'], string> = {
  new_novel: 'Original novel',
  source: 'Adapted from source',
};

export function projectKindLabel(kind: ProjectResponse['kind']): string {
  return kindLabels[kind] ?? kind;
}
