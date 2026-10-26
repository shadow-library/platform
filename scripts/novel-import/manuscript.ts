import fs from 'node:fs';
import path from 'node:path';

import { ShadowError } from '../utils/index.ts';

export type ContentMode = 'standard' | 'unrestricted';

export type CoverMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ManuscriptChapter {
  number: number;
  file: string;
  title?: string;
  prose: string;
}

export interface ManuscriptCover {
  file: string;
  mime: CoverMime;
}

export interface Manuscript {
  dir: string;
  title: string;
  name: string;
  notes?: string;
  contentMode?: ContentMode;
  cover?: ManuscriptCover;
  chapters: ManuscriptChapter[];
}

interface NovelFile {
  title?: unknown;
  name?: unknown;
  notes?: unknown;
  contentMode?: unknown;
}

export const NOVEL_FILE = 'novel.json';
export const CHAPTERS_DIR = 'chapters';

const CHAPTER_FILE = /^(\d+)[^/]*\.(md|txt)$/i;
const HEADING = /^#\s+(.+?)\s*#*\s*$/;
const COVER_FILES: readonly [string, CoverMime][] = [
  ['cover.png', 'image/png'],
  ['cover.jpg', 'image/jpeg'],
  ['cover.jpeg', 'image/jpeg'],
  ['cover.webp', 'image/webp'],
];
const CONTENT_MODES: readonly ContentMode[] = ['standard', 'unrestricted'];
const MAX_TITLE = 255;
const MAX_NOTES = 100_000;

export function normaliseProse(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ShadowError(`${NOVEL_FILE}: "${field}" must be a string`);
  return value.trim() || undefined;
}

function readNovelFile(dir: string): NovelFile {
  const file = path.join(dir, NOVEL_FILE);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new ShadowError(`${file} must hold a JSON object`);
    return parsed as NovelFile;
  } catch (error) {
    if (error instanceof ShadowError) throw error;
    throw new ShadowError(`${file} is not valid JSON`, { cause: error });
  }
}

export function parseChapterFile(file: string, text: string): ManuscriptChapter {
  const number = Number(CHAPTER_FILE.exec(path.basename(file))?.[1]);
  const lines = normaliseProse(text).split('\n');
  const heading = HEADING.exec(lines[0] ?? '')?.[1];
  const prose = normaliseProse(heading ? lines.slice(1).join('\n') : lines.join('\n'));
  if (!prose) throw new ShadowError(`${file} holds no prose`);
  return { number, file, ...(heading ? { title: heading.slice(0, MAX_TITLE) } : {}), prose };
}

function readChapters(dir: string): ManuscriptChapter[] {
  const chaptersDir = path.join(dir, CHAPTERS_DIR);
  if (!fs.existsSync(chaptersDir)) throw new ShadowError(`${dir} has no ${CHAPTERS_DIR}/ folder — put one file per chapter there, named 001-title.md, 002-title.md, …`);
  const chapters = fs
    .readdirSync(chaptersDir)
    .filter(entry => CHAPTER_FILE.test(entry))
    .map(entry => parseChapterFile(path.join(chaptersDir, entry), fs.readFileSync(path.join(chaptersDir, entry), 'utf-8')))
    .sort((a, b) => a.number - b.number);
  if (chapters.length === 0) throw new ShadowError(`${chaptersDir} holds no chapter files (001-title.md or .txt)`);
  chapters.forEach((chapter, index) => {
    if (chapter.number !== index + 1)
      throw new ShadowError(`chapters must be numbered 1, 2, 3, … with no gaps or repeats — ${chapter.file} is numbered ${chapter.number}, expected ${index + 1}`);
  });
  return chapters;
}

function findCover(dir: string): ManuscriptCover | undefined {
  const found = COVER_FILES.find(([file]) => fs.existsSync(path.join(dir, file)));
  return found ? { file: path.join(dir, found[0]), mime: found[1] } : undefined;
}

export function readManuscript(dir: string): Manuscript {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new ShadowError(`${dir} is not a folder`);
  const novel = readNovelFile(dir);
  const title = (optionalString(novel.title, 'title') ?? path.basename(path.resolve(dir))).slice(0, MAX_TITLE);
  const notes = optionalString(novel.notes, 'notes');
  if (notes && notes.length > MAX_NOTES) throw new ShadowError(`${NOVEL_FILE}: "notes" is ${notes.length} characters; Novel Forge keeps at most ${MAX_NOTES}`);
  const contentMode = optionalString(novel.contentMode, 'contentMode');
  if (contentMode && !(CONTENT_MODES as readonly string[]).includes(contentMode)) throw new ShadowError(`${NOVEL_FILE}: "contentMode" must be one of ${CONTENT_MODES.join(', ')}`);
  const cover = findCover(dir);
  return {
    dir,
    title,
    name: optionalString(novel.name, 'name') ?? title,
    ...(notes ? { notes } : {}),
    ...(contentMode ? { contentMode: contentMode as ContentMode } : {}),
    ...(cover ? { cover } : {}),
    chapters: readChapters(dir),
  };
}
