import { type GenerationJobItem } from '@/lib/apis';

export type ChapterGenerationPhase = 'writing' | 'queued';

export interface ChapterGeneration {
  phase: ChapterGenerationPhase;
  /** Set on the chapter being written: when the worker started it, or when the job was enqueued while it waits to start. */
  startedAt?: string;
}

export interface GenerationActivity {
  jobId: string;
  chapters: number[];
  current: number;
  startedAt: string;
}

interface GenerateProgress {
  current?: unknown;
  phase?: unknown;
  startedAt?: unknown;
}

export function isRunningJob(job: Pick<GenerationJobItem, 'status'>): boolean {
  return job.status === 'pending' || job.status === 'in_progress';
}

export function jobChapters(target: string): number[] {
  return target
    .split(',')
    .map(Number)
    .filter(n => Number.isInteger(n) && n > 0);
}

export function activeGenerateJob(jobs: readonly GenerationJobItem[] | undefined): GenerationJobItem | undefined {
  return jobs?.find(job => job.kind === 'generate' && isRunningJob(job));
}

// The worker writes `current` + `startedAt` as each chapter begins; before its first write the job is
// still pending and the first chapter in the target is the one about to start.
export function generationActivityOf(job: GenerationJobItem | undefined): GenerationActivity | undefined {
  if (!job || job.kind !== 'generate' || !isRunningJob(job)) return undefined;
  const chapters = jobChapters(job.target);
  const [first] = chapters;
  if (first === undefined) return undefined;

  const progress = (job.progress ?? {}) as GenerateProgress;
  const current = Number(progress.current);
  const writing = progress.phase === 'generating' && chapters.includes(current);
  return {
    jobId: job.id,
    chapters,
    current: writing ? current : first,
    startedAt: writing && typeof progress.startedAt === 'string' ? progress.startedAt : writing ? job.updatedAt : job.createdAt,
  };
}

export function chapterGeneration(activity: GenerationActivity | undefined, chapter: number): ChapterGeneration | undefined {
  if (!activity || !activity.chapters.includes(chapter) || chapter < activity.current) return undefined;
  return chapter === activity.current ? { phase: 'writing', startedAt: activity.startedAt } : { phase: 'queued' };
}
