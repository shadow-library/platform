import { type Ledger } from '@server/database';

import { type PageRef } from './bible-page';
import { lockedLinks } from './content-keys';
import { recordsWrittenBefore, samePage, writtenBefore, type WrittenPage, type WrittenRecord } from './organise-content';
import { OPEN_QUESTIONS_PAGE, ORGANISE_STEP_KEY, TIMELINE_PAGE } from './organised-pages';

/**
 * What organising holds at one ref once a write lands: the sections of a shared page with their digests, a record with its digest, or one
 * of its own pages; null once it holds nothing there. A decision is the set of claims actually written, never the plan's.
 */
export type OrganiseClaim =
  { kind: 'page'; ref: string; page: WrittenPage | null } | { kind: 'record'; ref: string; record: WrittenRecord | null } | { kind: 'own'; ref: string; page: PageRef | null };

export interface ClaimedDecision {
  pages: WrittenPage[];
  records: WrittenRecord[];
  links: Ledger.Links;
}

const OWN_PAGES: readonly PageRef[] = [TIMELINE_PAGE, OPEN_QUESTIONS_PAGE];

export const pageRef = (page: PageRef): string => `doc:${page.section}/${page.slug}`;
export const recordRef = (entityKey: string): string => `entity:${entityKey}`;

/** The claims the active organise decision holds, so a write the author declined leaves the earlier claim at its ref standing. */
export function previousClaims(ledger: Ledger.Entry[]): Map<string, OrganiseClaim> {
  const links = lockedLinks(ledger, ORGANISE_STEP_KEY);
  const own = OWN_PAGES.filter(page => (links.bibleDocuments ?? []).some(linked => samePage(linked, page)));
  const claims: OrganiseClaim[] = [
    ...writtenBefore(ledger).map((page): OrganiseClaim => ({ kind: 'page', ref: pageRef(page), page })),
    ...recordsWrittenBefore(ledger).map((record): OrganiseClaim => ({ kind: 'record', ref: recordRef(record.entityKey), record })),
    ...own.map((page): OrganiseClaim => ({ kind: 'own', ref: pageRef(page), page })),
  ];
  return new Map(claims.map(claim => [claim.ref, claim]));
}

/** Claims settled without a write come first, then each applied op's in change-set order, so the last write to a ref is what it holds. */
export function claimsAfter(previous: ReadonlyMap<string, OrganiseClaim>, settled: readonly OrganiseClaim[], applied: readonly OrganiseClaim[]): Map<string, OrganiseClaim> {
  const claims = new Map(previous);
  for (const claim of [...settled, ...applied]) claims.set(claim.ref, claim);
  return claims;
}

export function claimedDecision(claims: ReadonlyMap<string, OrganiseClaim>): ClaimedDecision {
  const held = [...claims.values()];
  const pages = held.flatMap(claim => (claim.kind === 'page' && claim.page ? [claim.page] : []));
  const records = held.flatMap(claim => (claim.kind === 'record' && claim.record ? [claim.record] : []));
  const own = held.flatMap(claim => (claim.kind === 'own' && claim.page ? [claim.page] : []));
  return {
    pages,
    records,
    links: {
      bibleDocuments: [...pages.map(page => ({ section: page.section, slug: page.slug })), ...own.map(page => ({ section: page.section, slug: page.slug }))],
      entityKeys: records.map(record => record.entityKey),
    },
  };
}
