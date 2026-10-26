import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ShadowError } from '../utils/index.ts';
import { ForgeApiError, type ForgeClient, type ForgeDraft, type ForgeDraftSummary } from './forge-client.ts';
import { type Manuscript, type ManuscriptChapter, normaliseProse } from './manuscript.ts';

export type ChapterOutcome = 'imported' | 'updated' | 'unchanged' | 'conflict';

export interface ImportOptions {
  approve?: boolean;
  overwrite?: boolean;
  readFile?: (file: string) => Uint8Array;
}

export interface ImportReport {
  projectId: string;
  projectCreated: boolean;
  cover: 'uploaded' | 'unchanged' | 'absent' | 'refused';
  chapters: Record<ChapterOutcome, number[]>;
  approved: number[];
  extraOnForge: number[];
  warnings: string[];
}

interface ForgeState {
  projectId: string;
  coverSha256?: string;
}

interface StateFile {
  projects: Record<string, ForgeState>;
}

export const STATE_FILE = '.novel-forge.json';

const APPROVED = 'approved';

function readState(dir: string): StateFile {
  const file = path.join(dir, STATE_FILE);
  if (!fs.existsSync(file)) return { projects: {} };
  const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<StateFile>;
  return { projects: parsed.projects ?? {} };
}

function writeState(dir: string, state: StateFile): void {
  const file = path.join(dir, STATE_FILE);
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

function sameChapter(draft: ForgeDraft, chapter: ManuscriptChapter): boolean {
  return normaliseProse(draft.body) === chapter.prose && (draft.title ?? undefined) === chapter.title;
}

/**
 * Brings one Novel Forge project in line with a manuscript folder, as an organisation bot.
 *
 * The project id is written beside the manuscript the moment the project exists, so a re-run resumes it instead of creating a second one. A chapter
 * the forge already holds is compared with the file: equal is left alone, different is reported and left alone unless `overwrite` — and an
 * overwrite always names the draft it read, so an edit made in Novel Forge since then is refused (DRF_013) rather than silently replaced.
 */
export class NovelImporter {
  private readonly readFile: (file: string) => Uint8Array;

  constructor(
    private readonly client: ForgeClient,
    private readonly options: ImportOptions = {},
  ) {
    this.readFile = options.readFile ?? (file => fs.readFileSync(file));
  }

  async run(manuscript: Manuscript): Promise<ImportReport> {
    const state = readState(manuscript.dir);
    const report: ImportReport = {
      projectId: '',
      projectCreated: false,
      cover: 'absent',
      chapters: { imported: [], updated: [], unchanged: [], conflict: [] },
      approved: [],
      extraOnForge: [],
      warnings: [],
    };

    const forge = await this.project(manuscript, state, report);
    report.cover = await this.cover(manuscript, forge, report);
    writeState(manuscript.dir, state);

    const drafts = new Map((await this.client.listDrafts(forge.projectId)).map(draft => [draft.chapter, draft]));
    for (const chapter of manuscript.chapters) await this.chapter(forge.projectId, chapter, drafts.get(chapter.number), report);
    report.extraOnForge = [...drafts.keys()].filter(number => number > manuscript.chapters.length).sort((a, b) => a - b);
    return report;
  }

  private async project(manuscript: Manuscript, state: StateFile, report: ImportReport): Promise<ForgeState> {
    const known = state.projects[this.client.target];
    if (known) {
      try {
        await this.client.getProject(known.projectId);
      } catch (error) {
        if (error instanceof ForgeApiError && error.status === 404)
          throw new ShadowError(`project ${known.projectId} recorded in ${STATE_FILE} is gone or this bot cannot see it — remove its entry to import into a new project`);
        throw error;
      }
      report.projectId = known.projectId;
      return known;
    }

    const project = await this.client.createProject({ name: manuscript.name, title: manuscript.title, ...(manuscript.contentMode ? { contentMode: manuscript.contentMode } : {}) });
    const created: ForgeState = { projectId: String(project.id) };
    state.projects[this.client.target] = created;
    writeState(manuscript.dir, state);
    if (manuscript.notes) await this.client.putNotes(created.projectId, manuscript.notes);
    report.projectId = created.projectId;
    report.projectCreated = true;
    return created;
  }

  private async cover(manuscript: Manuscript, forge: ForgeState, report: ImportReport): Promise<ImportReport['cover']> {
    if (!manuscript.cover) return 'absent';
    const bytes = this.readFile(manuscript.cover.file);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (forge.coverSha256 === sha256) return 'unchanged';
    try {
      await this.client.setCover(forge.projectId, manuscript.cover.mime, Buffer.from(bytes).toString('base64'));
    } catch (error) {
      if (!(error instanceof ForgeApiError) || error.status !== 403) throw error;
      report.warnings.push('the cover was not uploaded: the bot needs the NovelForgeIllustrator role for that');
      return 'refused';
    }
    forge.coverSha256 = sha256;
    return 'uploaded';
  }

  private async chapter(projectId: string, chapter: ManuscriptChapter, summary: ForgeDraftSummary | undefined, report: ImportReport): Promise<void> {
    const input = { ...(chapter.title ? { title: chapter.title } : {}), prose: chapter.prose };
    if (!summary) {
      const draft = await this.client.importChapter(projectId, chapter.number, input);
      report.chapters.imported.push(chapter.number);
      return this.approve(projectId, draft, report);
    }

    const current = await this.client.getDraft(projectId, chapter.number);
    if (sameChapter(current, chapter)) {
      report.chapters.unchanged.push(chapter.number);
      return this.approve(projectId, current, report);
    }
    const empty = normaliseProse(current.body) === '';
    if (current.status === 'final' || (!empty && !this.options.overwrite)) {
      report.chapters.conflict.push(chapter.number);
      return;
    }

    const draft = await this.client.importChapter(projectId, chapter.number, { ...input, base: current });
    report.chapters[empty ? 'imported' : 'updated'].push(chapter.number);
    return this.approve(projectId, draft, report);
  }

  private async approve(projectId: string, draft: ForgeDraft, report: ImportReport): Promise<void> {
    if (!this.options.approve || draft.reviewStatus === APPROVED || draft.status === 'final') return;
    await this.client.approve(projectId, draft.chapter, draft.revision);
    report.approved.push(draft.chapter);
  }
}
