import { type Command, type CommandType, type QuestDraft, type Recurrence, type Weekday } from '@/lib/data';

import { uuidv7 } from './uuid';

export interface WireCommand {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Every command type the server has a handler for (`QuestCommandsService.onModuleInit`) that the web's
 * `Command` union also knows how to build. A type absent from this set is applied locally and kept out of
 * the outbox entirely: `POST /sync/commands` fails the *whole batch* on an unknown type, so one command the
 * server has not shipped yet would strand every command behind it. `quest.setActive` and `plan.setLock`
 * have no server handler; finance/quick-log/hero/reflect/account commands are still fixture-backed on the
 * web side (T-25 registered `expense.*`/`subscription.*` server-side, ready to flip on once the finance
 * provider is sync-backed).
 */
const SERVER_BACKED_TYPES = new Set<CommandType>(['quest.complete', 'quest.partial', 'quest.skip', 'quest.postpone', 'quest.reschedule', 'quest.create', 'quest.update']);

export function isServerBacked(command: Command): boolean {
  return SERVER_BACKED_TYPES.has(command.type);
}

const WEEKDAY_WIRE: Record<Weekday, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

/** The rules module's `RecurrenceRule` (numeric 1–7 weekdays, a monthly `pattern` discriminant) rather than the web's flatter `Recurrence` draft. */
function toRecurrenceRule(recurrence: Recurrence): Record<string, unknown> {
  const base = { frequency: recurrence.frequency, interval: recurrence.interval, startDate: recurrence.startDate, end: recurrence.end, exceptions: recurrence.exceptions };
  if (recurrence.frequency === 'weekly') return { ...base, daysOfWeek: recurrence.daysOfWeek.map(day => WEEKDAY_WIRE[day]) };
  if (recurrence.frequency === 'monthly') return { ...base, pattern: { kind: 'day_of_month', dayOfMonth: recurrence.dayOfMonth ?? Number(recurrence.startDate.slice(-2)) } };
  return base;
}

function toDraftWire(draft: QuestDraft): Record<string, unknown> {
  return { ...draft, recurrence: toRecurrenceRule(draft.recurrence) };
}

function toPatchWire(patch: Partial<QuestDraft>): Record<string, unknown> {
  if (patch.recurrence === undefined) return patch;
  return { ...patch, recurrence: toRecurrenceRule(patch.recurrence) };
}

/**
 * The only place a local `Command` becomes a wire envelope body. T-18's quest handlers land in parallel
 * with this file, so a payload mismatch is reconciled here and nowhere else — no call site outside this
 * module knows the wire shape of anything.
 */
export function toWireCommand(command: Command): WireCommand {
  switch (command.type) {
    case 'quest.complete':
      return { type: command.type, payload: { occurrenceId: command.occurrenceId } };
    case 'quest.partial':
      return { type: command.type, payload: { occurrenceId: command.occurrenceId, progress: command.progress, reasonTag: command.reasonTag, note: command.note } };
    case 'quest.skip':
      return { type: command.type, payload: { occurrenceId: command.occurrenceId, reasonTag: command.reasonTag, note: command.note } };
    case 'quest.postpone':
      return { type: command.type, payload: { occurrenceId: command.occurrenceId, reasonTag: command.reasonTag } };
    case 'quest.reschedule':
      return { type: command.type, payload: { occurrenceId: command.occurrenceId, toMin: command.toMin, acceptBeyondCap: command.acceptBeyondCap ?? false } };
    case 'quest.create':
      return { type: command.type, payload: { ...toDraftWire(command.draft), entityRef: uuidv7() } };
    case 'quest.update':
      return { type: command.type, payload: { questId: command.questId, patch: toPatchWire(command.patch) } };
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
