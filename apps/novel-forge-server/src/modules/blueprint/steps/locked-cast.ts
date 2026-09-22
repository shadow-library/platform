import { type Ledger } from '@server/database';

import { OPPOSITION_TOPIC } from './opposition.step';
import { PROTAGONIST_TOPIC } from './protagonist.step';

export interface LockedCharacter {
  entityKey: string;
  name: string;
  role: string;
}

function decisionOn(ledger: Ledger.Entry[], topic: string): Ledger.Entry | undefined {
  return [...ledger].reverse().find(entry => entry.topic === topic && entry.kind === 'decision');
}

function payloadOf(entry: Ledger.Entry | undefined): Record<string, unknown> {
  return typeof entry?.payload === 'object' && entry.payload !== null ? (entry.payload as Record<string, unknown>) : {};
}

function leadNames(entry: Ledger.Entry | undefined): string[] {
  const leads = payloadOf(entry)['leads'];
  if (!Array.isArray(leads)) return [];
  return leads.map(lead => (typeof lead === 'object' && lead !== null ? String((lead as { name?: unknown }).name ?? '') : '')).filter(Boolean);
}

/**
 * The characters the Core phase already built. Volume one casts around them: it never offers them again, never writes over their
 * entity, and never counts them among what a re-lock of its own may remove.
 */
export function lockedCast(ledger: Ledger.Entry[]): LockedCharacter[] {
  const protagonist = decisionOn(ledger, PROTAGONIST_TOPIC);
  const keys = protagonist?.links.entityKeys ?? [];
  const leads = leadNames(protagonist)
    .map((name, index) => ({ entityKey: keys[index] ?? '', name, role: 'Protagonist' }))
    .filter(lead => lead.entityKey);

  const opposition = decisionOn(ledger, OPPOSITION_TOPIC);
  const oppositionPayload = payloadOf(opposition);
  const entityKey = oppositionPayload['entityKey'];
  const name = oppositionPayload['name'];
  const antagonist = typeof entityKey === 'string' && typeof name === 'string' && name.trim() ? [{ entityKey, name: name.trim(), role: 'Opposition' }] : [];

  return [...leads, ...antagonist];
}

export function lockedCastKeys(ledger: Ledger.Entry[]): Set<string> {
  return new Set(lockedCast(ledger).map(character => character.entityKey));
}

export function renderLockedCast(cast: LockedCharacter[]): string {
  if (cast.length === 0) return 'No character has been locked yet.';
  return cast.map(character => `- ${character.name} (${character.role.toLowerCase()}, entity key \`${character.entityKey}\`)`).join('\n');
}

const CRUCIBLE_FIELDS = ['lie', 'wound', 'want', 'need', 'change'] as const;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

/** The crucible the Core phase locked, named field by field, because the spine's job is to move exactly these and nothing else. */
export function renderLockedCrucible(ledger: Ledger.Entry[]): string {
  const leads = payloadOf(decisionOn(ledger, PROTAGONIST_TOPIC))['leads'];
  if (!Array.isArray(leads) || leads.length === 0) return 'The protagonist is not locked yet.';
  return leads
    .map(item => {
      const lead = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
      const fields = CRUCIBLE_FIELDS.filter(field => text(lead[field])).map(field => `  - ${field}: ${text(lead[field])}`);
      return [`- ${text(lead['name']) || 'the protagonist'}`, ...fields].join('\n');
    })
    .join('\n');
}

/** What opposes them, in the shape its kind gave it, so the spine escalates the thing that is actually there. */
export function renderLockedOpposition(ledger: Ledger.Entry[]): string {
  const decision = decisionOn(ledger, OPPOSITION_TOPIC);
  if (!decision) return 'Nothing is locked as the opposition; this novel was never asked for one.';
  const payload = payloadOf(decision);
  const faces = (Array.isArray(payload['faces']) ? payload['faces'] : [])
    .map(item => (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>)
    .map(face => [text(face['arc']), text(face['face'])].filter(Boolean).join(': '))
    .filter(Boolean);
  const detail = [
    text(payload['wants']) ? `  - wants: ${text(payload['wants'])}` : null,
    text(payload['neverWill']) ? `  - the line it will never cross: ${text(payload['neverWill'])}` : null,
    text(payload['rhythm']) ? `  - arrives on: ${text(payload['rhythm'])}` : null,
    text(payload['costOfWinning']) ? `  - what winning the wrong way costs: ${text(payload['costOfWinning'])}` : null,
    text(payload['stakes']) ? `  - gentle stakes: ${text(payload['stakes'])}` : null,
    list(payload['goals']).length > 0 ? `  - the small-goals ladder: ${list(payload['goals']).join('; ')}` : null,
    faces.length > 0 ? `  - the faces it wears: ${faces.join('; ')}` : null,
  ].filter((line): line is string => line !== null);
  return [`- ${text(payload['kind']) || 'opposition'}: ${decision.statement.trim()}`, ...detail].join('\n');
}
