import { createHash } from 'node:crypto';

import { type Template } from '@server/database';

import { type TemplateFixture } from './baseline.data';

export interface BaselineVersion {
  id: bigint;
  version: number;
  status: Template.VersionStatus;
  baselineHash: string | null;
}

export type BaselineContent = Pick<Template.Content, 'channel' | 'locale' | 'subject' | 'body' | 'layoutKey'>;

export type BaselineKeepReason = 'current' | 'operator-owned' | 'draft-open' | 'contract-changed';

export type BaselineStep =
  | { action: 'create'; version: number }
  | { action: 'adopt'; versionId: bigint }
  | { action: 'supersede'; version: number; publishedId: bigint }
  | { action: 'keep'; reason: BaselineKeepReason };

export interface BaselinePlanOptions {
  /** Set when the stored variable contract differs from the fixture's: content written against one contract never goes live under another. */
  contractChanged?: boolean;
}

function compareKeys(keyA: string, keyB: string): number {
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  const entries = Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined);
  return `{${entries
    .sort(([keyA], [keyB]) => compareKeys(keyA, keyB))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

export function isSameContract(stored: unknown, fixture: unknown): boolean {
  return canonicalJson(stored) === canonicalJson(fixture);
}

export function hashBaseline(content: unknown): string {
  return createHash('sha256').update(canonicalJson(content)).digest('hex');
}

export function templateFixtureContents(fixture: TemplateFixture): BaselineContent[] {
  return fixture.channels.map(content => ({
    channel: content.channel,
    locale: 'en-ZZ',
    subject: content.subject ?? null,
    body: content.body,
    layoutKey: content.layoutKey ?? null,
  }));
}

export function hashTemplateContents(contents: BaselineContent[]): string {
  const canonical = contents
    .map(content => ({ channel: content.channel, locale: content.locale, subject: content.subject ?? null, body: content.body, layoutKey: content.layoutKey ?? null }))
    .sort((contentA, contentB) => compareKeys(`${contentA.channel}:${contentA.locale}`, `${contentB.channel}:${contentB.locale}`));
  return hashBaseline(canonical);
}

/**
 * Decides what the seed does to one layout, partial or template. It owns an entity only while the PUBLISHED version is one it wrote
 * (`baselineHash` set): an operator's publish or rollback always creates a version without one, and from then on the entity is theirs.
 * An owned version whose stored content already matches the fixture is adopted (its hash stamped) rather than republished.
 */
export async function planBaselineStep<V extends BaselineVersion>(
  fixtureHash: string,
  versions: V[],
  publishedContentHash: (published: V) => string | Promise<string>,
  options: BaselinePlanOptions = {},
): Promise<BaselineStep> {
  const nextVersion = Math.max(0, ...versions.map(version => version.version)) + 1;
  const published = versions.find(version => version.status === 'PUBLISHED');
  if (!published) return { action: 'create', version: nextVersion };
  if (published.baselineHash === fixtureHash) return { action: 'keep', reason: 'current' };
  if (published.baselineHash === null) return { action: 'keep', reason: 'operator-owned' };
  if ((await publishedContentHash(published)) === fixtureHash) return { action: 'adopt', versionId: published.id };
  if (versions.some(version => version.status === 'DRAFT')) return { action: 'keep', reason: 'draft-open' };
  if (options.contractChanged) return { action: 'keep', reason: 'contract-changed' };
  return { action: 'supersede', version: nextVersion, publishedId: published.id };
}
