/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { QuestRepository } from '@modules/quests';
import { AppErrorCode } from '@server/classes';
import { type AppliedSuggestion, type Quest } from '@server/database';

import { AiResultRepository } from './ai-result.repository';
import { AppliedSuggestionRepository } from './applied-suggestion.repository';

/**
 * Defining types
 */

interface Suggestion {
  questId?: string | number;
}

/**
 * Declaring the constants
 */

/** JSON-safe snapshot of the fields a Quest edit could plausibly touch — the raw Drizzle row carries bigints and Dates neither `jsonb` value round-trips as-is. */
function toQuestSnapshot(quest: Quest.Row): Record<string, unknown> {
  return {
    id: String(quest.id),
    name: quest.name,
    notes: quest.notes,
    startTimeMin: quest.startTimeMin,
    durationMin: quest.durationMin,
    statAffinity: quest.statAffinity,
    strictness: quest.strictness,
    reminderEnabled: quest.reminderEnabled,
    reminderLeadMin: quest.reminderLeadMin,
    active: quest.active,
  };
}

function suggestionAt(result: { suggestions: unknown }, index: number): Suggestion | null {
  const suggestions = Array.isArray(result.suggestions) ? (result.suggestions as unknown[]) : [];
  const candidate = suggestions[index];
  return candidate && typeof candidate === 'object' ? (candidate as Suggestion) : null;
}

/**
 * `POST /ai/results/{id}/apply` only records that the offer was taken (ARCHITECTURE §15.7) — the AI path
 * never mutates the quest itself; the client still issues a separate, normal `quest.update` command with
 * the pre-filled edit the deep-link opened. Idempotent under replay: a second apply of the same
 * `(resultId, suggestionIndex)` returns the row the first call already wrote.
 */
@Injectable()
export class AiResultService {
  constructor(
    private readonly resultRepository: AiResultRepository,
    private readonly questRepository: QuestRepository,
    private readonly appliedSuggestionRepository: AppliedSuggestionRepository,
  ) {}

  async apply(resultId: bigint, suggestionIndex: number): Promise<AppliedSuggestion.Row> {
    const existing = await this.appliedSuggestionRepository.findByResultAndIndex(resultId, suggestionIndex);
    if (existing) return existing;

    const result = await this.resultRepository.findById(resultId);
    if (!result) throw AppErrorCode.AI_006.create();

    const suggestion = suggestionAt(result, suggestionIndex);
    if (!suggestion) throw AppErrorCode.AI_007.create({ suggestionIndex });

    const questId = this.parseQuestId(suggestion.questId);
    if (questId === null) throw AppErrorCode.AI_008.create();

    const quest = await this.questRepository.findById(questId);
    if (!quest) throw AppErrorCode.AI_008.create();

    const inserted = await this.appliedSuggestionRepository.insertIfAbsent(resultId, suggestionIndex, questId, toQuestSnapshot(quest));
    if (inserted) return inserted;

    const raced = await this.appliedSuggestionRepository.findByResultAndIndex(resultId, suggestionIndex);
    if (!raced) throw AppError.internal(`applied_suggestions insert for (${resultId}, ${suggestionIndex}) conflicted but no row could be read back`);
    return raced;
  }

  private parseQuestId(value: string | number | undefined): bigint | null {
    if (value === undefined) return null;
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
}
