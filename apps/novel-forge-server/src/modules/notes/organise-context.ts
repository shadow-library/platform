import { type Ledger } from '@server/database';

import { renderSection } from '../ai/context/sections';
import { AUTHOR_BRIEF_TOPIC, ledgerSection } from '../ledger/ledger-sections';

export interface OrganiseContext {
  stableContext: string;
  /** The author's own words, apart from the ledger so the hard line screens them as the author's rather than as derived context. */
  authorNotes: string;
  volatileContext: string;
}

const ORGANISE_REQUEST = "Organise the author's notes above into a starting Story Bible.";

/** The notes ride whole, beside the ledger whose decisions and do-not-propose list bind the pass. */
export function organiseContext(ledger: Ledger.Entry[]): OrganiseContext {
  const notes = ledger.find(entry => entry.topic === AUTHOR_BRIEF_TOPIC)?.statement ?? '';
  return { stableContext: ledgerSection(ledger).rendered, authorNotes: renderSection('author_brief', notes), volatileContext: ORGANISE_REQUEST };
}
