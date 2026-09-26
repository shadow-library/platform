import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { EvalError } from './errors.ts';
import { type BriefInput, type EntityInput, type MilestoneInput } from './forge.types.ts';
import { type MatchSpec } from './text.ts';

export type TurnExpectation = 'apply' | 'card' | 'none' | 'no_apply' | 'either';

export interface ProvenanceTurn {
  id: string;
  category: string;
  content: string;
  justDiscussing?: boolean;
  expect: TurnExpectation;
  forbiddenAppliedOps?: string[];
  forbiddenAppliedText?: string[];
  stateMustNotChange?: boolean;
}

interface StoryMilestone extends MilestoneInput {
  chapter: number;
}

export interface StorySecret {
  factKey: string;
  text: string;
  subjects: string[];
  terms: string[];
  writerNote: string;
  allowedClues: string[];
  unlockMilestone: string;
  revealPatterns: string[];
}

export interface StoryChapter {
  n: number;
  title: string;
  pov: string;
  plan: string;
  claimedMilestones?: string[];
}

export interface Story {
  title: string;
  synopsis: string;
  notes: string;
  entities: EntityInput[];
  milestones: StoryMilestone[];
  secrets: StorySecret[];
  chapters: StoryChapter[];
}

export interface ContinuityCheck {
  id: string;
  critical: boolean;
  kind: string;
  statement: string;
  fromChapter: number;
  toChapter: number;
  patterns: string[];
}

export interface ContinuityChecks {
  checks: ContinuityCheck[];
  ratingDimensions: string[];
}

export interface GoldFact {
  id: string;
  statement: string;
  critical: boolean;
  match: MatchSpec;
  undecided?: boolean;
}

export interface GoldTiming {
  id: string;
  statement: string;
  critical: boolean;
  event: MatchSpec;
  after?: MatchSpec;
  earliestVolume?: number;
  notInOpening?: boolean;
}

interface GoldForbidden {
  id: string;
  statement: string;
  match: MatchSpec;
  unlessAlso?: string[];
}

export interface NotesGold {
  id: string;
  title: string;
  notesFile?: string;
  facts: GoldFact[];
  decisions: GoldFact[];
  timing: GoldTiming[];
  forbidden: GoldForbidden[];
}

export interface BaselineChapter {
  n: number;
  title: string;
  content: string;
}

export const FIXTURES_DIR = path.resolve(import.meta.dir, '../fixtures');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(file: string): unknown {
  if (!existsSync(file)) throw new EvalError(`Fixture not found: ${file}`);
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new EvalError(`Fixture ${file} is not valid JSON`, { cause: error });
  }
}

function requireArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new EvalError(`${where} must be an array`);
  return value;
}

function requireString(record: Record<string, unknown>, field: string, where: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') throw new EvalError(`${where}.${field} must be a non-empty string`);
  return value;
}

function requireMatch(value: unknown, where: string): MatchSpec {
  if (!isRecord(value)) throw new EvalError(`${where} must be an object with 'all' and/or 'any'`);
  const all = value['all'] === undefined ? [] : requireArray(value['all'], `${where}.all`).map(String);
  const any = value['any'] === undefined ? [] : requireArray(value['any'], `${where}.any`).map(String);
  if (all.length === 0 && any.length === 0) throw new EvalError(`${where} needs at least one term`);
  return { all, any };
}

function readFixtureText(relative: string): string {
  const file = path.join(FIXTURES_DIR, relative);
  if (!existsSync(file)) throw new EvalError(`Fixture not found: ${file}`);
  return readFileSync(file, 'utf-8');
}

export function loadProvenanceTurns(): ProvenanceTurn[] {
  const where = 'provenance-turns.json';
  const root = readJson(path.join(FIXTURES_DIR, where));
  if (!isRecord(root)) throw new EvalError(`${where} must be an object`);
  const expectations: readonly TurnExpectation[] = ['apply', 'card', 'none', 'no_apply', 'either'];
  return requireArray(root['turns'], `${where}.turns`).map((value, index) => {
    const at = `${where}.turns[${index}]`;
    if (!isRecord(value)) throw new EvalError(`${at} must be an object`);
    const expect = requireString(value, 'expect', at) as TurnExpectation;
    if (!expectations.includes(expect)) throw new EvalError(`${at}.expect must be one of ${expectations.join(', ')}`);
    return {
      id: requireString(value, 'id', at),
      category: requireString(value, 'category', at),
      content: requireString(value, 'content', at),
      justDiscussing: value['justDiscussing'] === true,
      expect,
      forbiddenAppliedOps: value['forbiddenAppliedOps'] === undefined ? [] : requireArray(value['forbiddenAppliedOps'], `${at}.forbiddenAppliedOps`).map(String),
      forbiddenAppliedText: value['forbiddenAppliedText'] === undefined ? [] : requireArray(value['forbiddenAppliedText'], `${at}.forbiddenAppliedText`).map(String),
      stateMustNotChange: value['stateMustNotChange'] === true,
    };
  });
}

export function loadStory(): Story {
  const where = 'story/tidewright.json';
  const root = readJson(path.join(FIXTURES_DIR, where));
  if (!isRecord(root)) throw new EvalError(`${where} must be an object`);
  const chapters = requireArray(root['chapters'], `${where}.chapters`) as StoryChapter[];
  chapters.forEach((chapter, index) => {
    if (chapter.n !== index + 1) throw new EvalError(`${where}.chapters must be numbered 1..N in order (index ${index} is ${chapter.n})`);
  });
  return {
    title: requireString(root, 'title', where),
    synopsis: requireString(root, 'synopsis', where),
    notes: requireString(root, 'notes', where),
    entities: requireArray(root['entities'], `${where}.entities`) as EntityInput[],
    milestones: requireArray(root['milestones'], `${where}.milestones`) as StoryMilestone[],
    secrets: requireArray(root['secrets'], `${where}.secrets`) as StorySecret[],
    chapters,
  };
}

export function loadContinuityChecks(): ContinuityChecks {
  const where = 'story/continuity-checks.json';
  const root = readJson(path.join(FIXTURES_DIR, where));
  if (!isRecord(root)) throw new EvalError(`${where} must be an object`);
  return {
    checks: requireArray(root['checks'], `${where}.checks`) as ContinuityCheck[],
    ratingDimensions: requireArray(root['ratingDimensions'], `${where}.ratingDimensions`).map(String),
  };
}

export function loadBaseline(): BaselineChapter[] {
  const text = readFixtureText('story/baseline.md');
  const chapters: BaselineChapter[] = [];
  const heading = /^## (\d+)\. (.+)$/gm;
  const found = [...text.matchAll(heading)];
  found.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = found[index + 1]?.index ?? text.length;
    chapters.push({ n: Number(match[1]), title: String(match[2]).trim(), content: text.slice(start, end).trim() });
  });
  chapters.forEach((chapter, index) => {
    if (chapter.n !== index + 1) throw new EvalError(`story/baseline.md chapters must be numbered 1..N in order`);
  });
  return chapters;
}

/** Reads a gold file from anywhere: the invented inputs' gold lives in the repo, the owner's in the output dir the owner chose. */
export function loadGold(file: string): NotesGold {
  const root = readJson(file);
  const where = path.basename(file);
  if (!isRecord(root)) throw new EvalError(`${where} must be an object`);
  const facts = (key: string): GoldFact[] =>
    requireArray(root[key] ?? [], `${where}.${key}`).map((value, index) => {
      const at = `${where}.${key}[${index}]`;
      if (!isRecord(value)) throw new EvalError(`${at} must be an object`);
      return {
        id: requireString(value, 'id', at),
        statement: requireString(value, 'statement', at),
        critical: value['critical'] === true,
        match: requireMatch(value['match'], `${at}.match`),
        undecided: value['undecided'] === true,
      };
    });
  const timing = requireArray(root['timing'] ?? [], `${where}.timing`).map((value, index): GoldTiming => {
    const at = `${where}.timing[${index}]`;
    if (!isRecord(value)) throw new EvalError(`${at} must be an object`);
    return {
      id: requireString(value, 'id', at),
      statement: requireString(value, 'statement', at),
      critical: value['critical'] === true,
      event: requireMatch(value['event'], `${at}.event`),
      after: value['after'] === undefined ? undefined : requireMatch(value['after'], `${at}.after`),
      earliestVolume: typeof value['earliestVolume'] === 'number' ? value['earliestVolume'] : undefined,
      notInOpening: value['notInOpening'] === true,
    };
  });
  const forbidden = requireArray(root['forbidden'] ?? [], `${where}.forbidden`).map((value, index): GoldForbidden => {
    const at = `${where}.forbidden[${index}]`;
    if (!isRecord(value)) throw new EvalError(`${at} must be an object`);
    return {
      id: requireString(value, 'id', at),
      statement: requireString(value, 'statement', at),
      match: requireMatch(value['match'], `${at}.match`),
      unlessAlso: value['unlessAlso'] === undefined ? [] : requireArray(value['unlessAlso'], `${at}.unlessAlso`).map(String),
    };
  });
  return {
    id: requireString(root, 'id', where),
    title: requireString(root, 'title', where),
    notesFile: typeof root['notesFile'] === 'string' ? root['notesFile'] : undefined,
    facts: facts('facts'),
    decisions: facts('decisions'),
    timing,
    forbidden,
  };
}

export function briefFor(chapter: StoryChapter, contentMode?: BriefInput['contentMode']): BriefInput {
  return {
    title: chapter.title,
    body: chapter.plan,
    pov: chapter.pov,
    ...(chapter.claimedMilestones ? { claimedMilestones: chapter.claimedMilestones } : {}),
    ...(contentMode ? { contentMode } : {}),
  };
}
