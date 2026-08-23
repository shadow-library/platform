import { type Command, type CommandType } from '@/lib/data';

export interface WireCommand {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Every command type the server has a handler for. A type absent from this set is applied locally and
 * kept out of the outbox entirely: `POST /sync/commands` fails the *whole batch* on an unknown type, so
 * one command the server has not shipped yet would strand every command behind it.
 */
const SERVER_BACKED_TYPES = new Set<CommandType>([
  'quest.complete',
  'quest.partial',
  'quest.skip',
  'quest.postpone',
  'quest.reschedule',
  'quest.create',
  'quest.update',
  'quest.setActive',
]);

export function isServerBacked(command: Command): boolean {
  return SERVER_BACKED_TYPES.has(command.type);
}

/** A local occurrence id is `${questId}:${date}`; the server addresses the same occurrence by its two parts. */
function splitOccurrence(occurrenceId: string): { questId: string; date: string } {
  const separator = occurrenceId.lastIndexOf(':');
  return { questId: occurrenceId.slice(0, separator), date: occurrenceId.slice(separator + 1) };
}

/**
 * The only place a local `Command` becomes a wire envelope body. T-18's quest handlers land in parallel
 * with this file, so a payload mismatch is reconciled here and nowhere else — no call site outside this
 * module knows the wire shape of anything.
 */
export function toWireCommand(command: Command): WireCommand {
  switch (command.type) {
    case 'quest.complete':
      return { type: command.type, payload: splitOccurrence(command.occurrenceId) };
    case 'quest.partial':
      return { type: command.type, payload: { ...splitOccurrence(command.occurrenceId), progress: command.progress, reasonTag: command.reasonTag, note: command.note } };
    case 'quest.skip':
      return { type: command.type, payload: { ...splitOccurrence(command.occurrenceId), reasonTag: command.reasonTag, note: command.note } };
    case 'quest.postpone':
      return { type: command.type, payload: { ...splitOccurrence(command.occurrenceId), reasonTag: command.reasonTag } };
    case 'quest.reschedule':
      return { type: command.type, payload: { ...splitOccurrence(command.occurrenceId), toDate: command.toDate, acceptBeyondCap: command.acceptBeyondCap ?? false } };
    case 'quest.create':
      return { type: command.type, payload: { draft: command.draft } };
    case 'quest.update':
      return { type: command.type, payload: { questId: command.questId, patch: command.patch } };
    case 'quest.setActive':
      return { type: command.type, payload: { questId: command.questId, active: command.active } };
    default:
      return { type: command.type, payload: { ...command, type: undefined } };
  }
}

/**
 * The `entity_ref` → server id mapping a create command's outcome carries (ARCHITECTURE §12.4), so the
 * local row minted optimistically can adopt the id the server assigned.
 */
export function readEntityRef(result: Record<string, unknown>): { entityRef: string; id: string } | null {
  const entityRef = result['entityRef'];
  const id = result['id'];
  if (typeof entityRef !== 'string' || (typeof id !== 'string' && typeof id !== 'number')) return null;
  return { entityRef, id: String(id) };
}
