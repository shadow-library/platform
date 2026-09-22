import { type BlueprintRoundResponse, type LedgerEntryResponse } from '@/lib/apis';

export const START_CHIP_KINDS = ['element', 'want', 'not'] as const;
export type StartChipKind = (typeof START_CHIP_KINDS)[number];

export const STARTING_TYPES = ['book', 'character', 'world', 'scene', 'nothing'] as const;
export type StartingType = (typeof STARTING_TYPES)[number];

export const START_CHIP_MAX = 12;
export const START_CHIP_LABEL_MAX = 80;
export const START_TEXT_MAX = 4000;
export const START_TOPIC = 'start';
export const START_RULED_OUT_TOPIC = 'start.ruled_out';

export const STARTING_TYPE_LABELS: Record<StartingType, string> = {
  book: 'A book I love',
  character: 'A character',
  world: 'A world',
  scene: 'A single scene',
  nothing: 'Nothing yet',
};

export const START_CHIP_KIND_LABELS: Record<StartChipKind, string> = {
  element: 'Element',
  want: 'What I want',
  not: 'Not this',
};

export interface StartChip {
  /** The id the round offered it under; absent for a chip the author added. */
  optionId?: string;
  label: string;
  kind: StartChipKind;
}

function isChipKind(value: unknown): value is StartChipKind {
  return typeof value === 'string' && START_CHIP_KINDS.includes(value as StartChipKind);
}

/**
 * The round's options in the shape the `start` step defines. Anything else — a round that is not ready, a
 * payload from a step version this build does not know — reads as no chips rather than throwing on a screen
 * the author is already looking at.
 */
export function parseStartChips(round: BlueprintRoundResponse | null): StartChip[] {
  const understood = (round?.options as { understood?: unknown } | null)?.understood;
  if (!Array.isArray(understood)) return [];
  return understood.flatMap(candidate => {
    const chip = candidate as { id?: unknown; label?: unknown; kind?: unknown };
    if (typeof chip.id !== 'string' || typeof chip.label !== 'string' || !isChipKind(chip.kind)) return [];
    return [{ optionId: chip.id, label: chip.label, kind: chip.kind }];
  });
}

/**
 * The chips already in the Notebook. One lock writes the step's whole answer, so a revisit that shows only the round's reading would
 * retire everything the author typed themselves — their chips are in no round's options and can come back from nowhere else.
 */
export function restoreStartChips(entries: LedgerEntryResponse[]): StartChip[] {
  return entries.flatMap(entry => {
    if (entry.topic !== START_TOPIC && entry.topic !== START_RULED_OUT_TOPIC) return [];
    const payload = entry.payload as { kind?: unknown; optionId?: unknown } | null;
    const kind = isChipKind(payload?.kind) ? payload.kind : entry.topic === START_RULED_OUT_TOPIC ? 'not' : 'element';
    return [{ ...(typeof payload?.optionId === 'string' ? { optionId: payload.optionId } : {}), label: entry.statement, kind }];
  });
}

/**
 * The reading on screen, with what the author saved last put back. `keepEdits` is for the round those chips were saved against: a
 * fresh reading numbers its chips from one again, so carrying an edited label across to it would rename a different chip.
 */
export function mergeStartChips(fromRound: StartChip[], restored: StartChip[], keepEdits: boolean): StartChip[] {
  const saved = new Map(restored.flatMap(chip => (chip.optionId ? [[chip.optionId, chip] as const] : [])));
  const shown = keepEdits ? fromRound.map(chip => (chip.optionId && saved.has(chip.optionId) ? { ...chip, ...saved.get(chip.optionId) } : chip)) : fromRound;
  const present = new Set(shown.map(chip => chip.label.trim().toLowerCase()));
  const authored = restored.filter(chip => !chip.optionId && !present.has(chip.label.trim().toLowerCase()));
  return [...shown, ...authored].slice(0, START_CHIP_MAX);
}

export interface StartRoundInput {
  text?: string;
  startingType?: StartingType;
}

export function buildStartInput(text: string, startingType: StartingType | null): StartRoundInput {
  const trimmed = text.trim();
  return { ...(trimmed ? { text: trimmed } : {}), ...(startingType ? { startingType } : {}) };
}

/** What the author wrote for the round now on screen, so a reload and a re-run both keep the starting point. */
export function parseStartInput(round: BlueprintRoundResponse | null): StartRoundInput {
  const input = round?.input as { text?: unknown; startingType?: unknown } | null | undefined;
  const text = typeof input?.text === 'string' ? input.text : undefined;
  const startingType = STARTING_TYPES.includes(input?.startingType as StartingType) ? (input?.startingType as StartingType) : undefined;
  return { ...(text ? { text } : {}), ...(startingType ? { startingType } : {}) };
}

/** A re-run with an emptied box still carries the starting point that produced the options being steered. */
export function resolveStartInput(text: string, startingType: StartingType | null, round: BlueprintRoundResponse | null): StartRoundInput {
  const typed = buildStartInput(text, startingType);
  return Object.keys(typed).length > 0 ? typed : parseStartInput(round);
}

/** The chips on screen change when a new round opens and again when it produces its options; both are the same round id. */
export function startChipsKey(round: BlueprintRoundResponse | null): string {
  return round == null ? 'none' : `${round.id}:${round.options == null ? 'pending' : 'ready'}`;
}

export interface StartSelection {
  chips: { optionId?: string; label: string; kind: StartChipKind }[];
}

/** Blank labels are dropped rather than refused: the author edited a chip to nothing, which means they removed it. */
export function buildStartSelection(chips: StartChip[]): StartSelection {
  return {
    chips: chips
      .map(chip => ({ ...(chip.optionId ? { optionId: chip.optionId } : {}), label: chip.label.trim(), kind: chip.kind }))
      .filter(chip => chip.label.length > 0)
      .slice(0, START_CHIP_MAX),
  };
}
