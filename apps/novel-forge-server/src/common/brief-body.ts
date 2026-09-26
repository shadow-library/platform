export interface BriefBodyInput {
  objective: string;
  events: string[];
  continuesIntoNextChapter?: boolean;
  startsFromPreviousChapter?: boolean;
  handoffBeat?: string;
}

export const CONTINUES_LINE = "[CONTINUES INTO NEXT CHAPTER] Do not resolve this chapter's central action/tension.";
export const STARTS_LINE =
  "[STARTS FROM PREVIOUS CHAPTER] Continue forward in new sentences from the exact beat the previous chapter handed off — no time skip, no recap, and never repeat the previous chapter's closing line(s) verbatim; the reader already read them.";
export const HANDOFF_PREFIX = 'Handoff beat: ';

export interface BriefSceneInput {
  goal: string;
  obstacle: string;
  turn: string;
  beats: string[];
  estimatedWords: number;
}

function asSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return /[.!?…"'”’)]$/u.test(flat) ? flat : `${flat}.`;
}

// Each scene is one event line: `parseBriefBody` reads every line between the objective and the continuation markers as an event.
export function renderSceneEvents(scenes: readonly BriefSceneInput[]): string[] {
  return scenes.map((scene, index) => {
    const beats = scene.beats.map(beat => beat.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const parts = [`Goal: ${asSentence(scene.goal)}`, `Obstacle: ${asSentence(scene.obstacle)}`, `Turn: ${asSentence(scene.turn)}`];
    if (beats.length > 0) parts.push(`Beats: ${asSentence(beats.join('; '))}`);
    return `Scene ${index + 1} (~${scene.estimatedWords} words). ${parts.join(' ')}`;
  });
}

const SCENE_LINE = /^Scene \d+\b/;

function isContinuationLine(line: string): boolean {
  return line === CONTINUES_LINE || line === STARTS_LINE || line.startsWith(HANDOFF_PREFIX);
}

export interface PlanSceneLine {
  summary: string;
  pov: string | null;
  goal?: string;
  obstacle?: string;
  turn?: string;
  beats?: string[];
  estimatedWords?: number;
}

export function renderPlanScene(scene: PlanSceneLine, index: number): string {
  const words = scene.estimatedWords ? ` (~${scene.estimatedWords} words)` : '';
  const parts = [asSentence(scene.summary)];
  if (scene.goal) parts.push(`Goal: ${asSentence(scene.goal)}`);
  if (scene.obstacle) parts.push(`Obstacle: ${asSentence(scene.obstacle)}`);
  if (scene.turn) parts.push(`Turn: ${asSentence(scene.turn)}`);
  const beats = (scene.beats ?? []).map(beat => beat.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (beats.length > 0) parts.push(`Beats: ${asSentence(beats.join('; '))}`);
  if (scene.pov) parts.push(`POV: ${scene.pov}.`);
  return `Scene ${index + 1}${words}. ${parts.join(' ')}`;
}

/**
 * A plan's writer body carries its scenes, so an edit to a scene reaches the writer. Only the block of rendered scene lines is replaced —
 * together with the blank lines inside it — and everything else the author wrote keeps its place. A body with no scene lines yet takes the
 * block before its continuation markers, or at its end; an empty scene list removes the block.
 */
export function composePlanBody(body: string, scenes: readonly PlanSceneLine[]): string {
  const lines = body === '' ? [] : body.split('\n');
  const sceneIndexes = lines.flatMap((line, index) => (SCENE_LINE.test(line) ? [index] : []));
  const rendered = scenes.map(renderPlanScene);
  if (sceneIndexes.length === 0) {
    if (rendered.length === 0) return body;
    const marker = lines.findIndex(isContinuationLine);
    const at = marker === -1 ? lines.length : marker;
    return [...lines.slice(0, at), ...rendered, ...lines.slice(at)].join('\n');
  }
  const first = sceneIndexes[0] as number;
  const last = sceneIndexes.at(-1) as number;
  const inBlock = (line: string, index: number): boolean => index >= first && index <= last && (SCENE_LINE.test(line) || line.trim() === '');
  const kept = lines.slice(first, last + 1).filter((line, offset) => !inBlock(line, first + offset));
  return [...lines.slice(0, first), ...rendered, ...kept, ...lines.slice(last + 1)].join('\n');
}

// Folds outline-time continuation decisions into the stored brief body so the drafter — which only
// ever reads `chapterBrief` as plain text — actually sees them.
export function renderBriefBody(c: BriefBodyInput): string {
  const lines = [c.objective, ...(c.events ?? [])];
  if (c.continuesIntoNextChapter) lines.push(CONTINUES_LINE);
  if (c.startsFromPreviousChapter) lines.push(STARTS_LINE);
  if (c.handoffBeat) lines.push(`${HANDOFF_PREFIX}${c.handoffBeat}`);
  return lines.join('\n');
}

export interface ChapterBriefInput {
  body?: string | null;
  pov?: string | null;
  chapterPurpose?: string | null;
  readerValue?: unknown;
  repetitionRisks?: unknown;
  guidance?: string | null;
}

const GUIDANCE_HEADING = 'Author guidance:';

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map(v => v.trim());
}

// The single authority for the `chapterBrief` prompt variable. Briefs written before the outliner
// authored these fields carry them as null, and must render byte-identically to the stored body alone.
export function renderChapterBrief(brief: ChapterBriefInput | null | undefined): string {
  const body = brief?.body ?? '';
  const directives: string[] = [];
  const pov = brief?.pov?.trim();
  const purpose = brief?.chapterPurpose?.trim();
  const readerValue = stringList(brief?.readerValue);
  const repetitionRisks = stringList(brief?.repetitionRisks);
  if (pov) directives.push(`POV: ${pov}`);
  if (purpose) directives.push(`Chapter purpose: ${purpose}`);
  if (readerValue.length > 0) directives.push(`This chapter must deliver: ${readerValue.join(', ')}`);
  if (repetitionRisks.length > 0) directives.push(`Avoid repeating recent patterns: ${repetitionRisks.join('; ')}`);
  const authorGuidance = brief?.guidance?.trim();
  const sections = [body, directives.join('\n'), authorGuidance ? `${GUIDANCE_HEADING}\n${authorGuidance}` : ''];
  return sections.filter(Boolean).join('\n\n');
}
