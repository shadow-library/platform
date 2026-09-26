import { type Ledger } from '@server/database';

export function ledgerEntry(overrides: Partial<Ledger.Entry> = {}): Ledger.Entry {
  return {
    id: 1n,
    projectId: 7n,
    kind: 'direction',
    topic: 'start',
    statement: 'A lighthouse keeper who hates the sea',
    why: null,
    rejectedAlternatives: [],
    writerLine: null,
    decidedBy: 'author',
    stepKey: null,
    payload: null,
    links: {},
    supersedesId: null,
    supersededAt: null,
    withdrawnReason: null,
    ideaId: null,
    rejectionScope: null,
    rejectionAnchor: null,
    createdAt: new Date(0),
    ...overrides,
  };
}
