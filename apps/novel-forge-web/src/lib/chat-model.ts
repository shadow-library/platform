import { type ChatSessionResponse, type ContentMode, type CostTier } from './apis/api-types.gen';
import { contentModeLabel, formatUsd, tierLabel } from './usage';

export interface ModelTagInput {
  model?: string;
  contentMode?: ContentMode | null;
  costTier?: CostTier | null;
  costUsd?: number | null;
}

export function modelTagParts({ model, contentMode, costTier, costUsd }: ModelTagInput): string[] {
  const parts: string[] = [];
  if (model) parts.push(model);
  if (contentMode === 'unrestricted') parts.push(contentModeLabel(contentMode));
  if (costTier) parts.push(tierLabel(costTier));
  if (typeof costUsd === 'number') parts.push(formatUsd(costUsd));
  return parts;
}

export interface TurnChoice {
  contentMode: ContentMode;
  costTier: CostTier;
}

export interface TurnChoiceDefaults {
  choice: TurnChoice;
  source: 'project' | 'chat';
}

export function turnChoiceDefaults(session: Pick<ChatSessionResponse, 'contentMode' | 'costTier'> | undefined, project: TurnChoice): TurnChoiceDefaults {
  const choice = { contentMode: session?.contentMode ?? project.contentMode, costTier: session?.costTier ?? project.costTier };
  return { choice, source: session?.contentMode || session?.costTier ? 'chat' : 'project' };
}

export function sameChoice(a: TurnChoice, b: TurnChoice): boolean {
  return a.contentMode === b.contentMode && a.costTier === b.costTier;
}

/** What the turn body carries: only a choice that differs from the default, so an untouched composer follows the chat and the project. */
export function turnOverride(choice: TurnChoice | undefined, defaults: TurnChoice): Partial<TurnChoice> {
  if (!choice || sameChoice(choice, defaults)) return {};
  return { contentMode: choice.contentMode, costTier: choice.costTier };
}

export function choiceLabel(choice: TurnChoice): string {
  return `${contentModeLabel(choice.contentMode)} · ${tierLabel(choice.costTier)}`;
}

/** A pick still being saved already belongs to the chat. */
export function choiceScope(choice: TurnChoice | undefined, defaults: TurnChoiceDefaults): string {
  if (choice && !sameChoice(choice, defaults.choice)) return 'this chat';
  return defaults.source === 'chat' ? 'this chat' : 'project default';
}

/** The chat's own setting for a pick: a field that matches the project is cleared, so the chat keeps following the project there. */
export function chatChoiceUpdate(choice: TurnChoice, project: TurnChoice): { contentMode: TurnChoice['contentMode'] | null; costTier: TurnChoice['costTier'] | null } {
  return {
    contentMode: choice.contentMode === project.contentMode ? null : choice.contentMode,
    costTier: choice.costTier === project.costTier ? null : choice.costTier,
  };
}

export function defaultNote(defaults: TurnChoiceDefaults, custom: boolean): string {
  return defaults.source === 'chat' || custom ? 'This chat keeps this setting until you change it.' : 'This is the project default.';
}
