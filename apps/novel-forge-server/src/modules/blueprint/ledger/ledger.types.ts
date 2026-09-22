import { type Ledger } from '@server/database';

export const AUTHOR_ENTRY_KINDS = ['direction', 'rejected', 'backlog'] as const satisfies readonly Ledger.Kind[];
export const AUTHOR_SUPERSEDE_KINDS = ['decision', ...AUTHOR_ENTRY_KINDS] as const satisfies readonly Ledger.Kind[];

export const TOPIC_KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,99}$/;

export type AuthorEntryKind = (typeof AUTHOR_ENTRY_KINDS)[number];
export type AuthorSupersedeKind = (typeof AUTHOR_SUPERSEDE_KINDS)[number];

export interface NewLedgerEntry {
  kind: Ledger.Kind;
  phase: Ledger.Phase | null;
  topic: string;
  statement: string;
  why?: string | null;
  rejectedAlternatives?: string[];
  writerLine?: string | null;
  decidedBy: Ledger.DecidedBy;
  payload?: unknown;
  links?: Ledger.Links;
}

/** A successor always keeps the topic and phase of the entry it supersedes, so a topic's history is one unbroken chain. */
export type SupersedingEntry = Omit<NewLedgerEntry, 'topic' | 'phase'>;

export interface AuthorLedgerEntry {
  kind: AuthorEntryKind;
  phase?: Ledger.Phase | null;
  topic: string;
  statement: string;
  why?: string;
  payload?: Record<string, unknown>;
}

/** Omitted optional fields carry over from the superseded entry when the kind is kept; an empty string clears a text field. */
export interface AuthorSupersession {
  kind?: AuthorSupersedeKind;
  statement: string;
  why?: string;
  writerLine?: string;
  rejectedAlternatives?: string[];
  payload?: Record<string, unknown>;
}

export interface LedgerFilter {
  kinds?: Ledger.Kind[];
  phases?: Ledger.Phase[];
  /** Exact topic keys; a key ending in `.*` matches every topic under that prefix (`check.*`). */
  topics?: string[];
}
