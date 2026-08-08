import { Field, Schema } from '@shadow-library/class-schema';

import { RebrandGlossaryCategory } from '@server/common';

import { RebrandAuditIssueType, RebrandAuditVerdict, RebrandFixKind } from './enums';

@Schema()
export class RebrandMapping {
  @Field({ minLength: 1, maxLength: 300, description: 'the exact source-text name being replaced, e.g. "Ye Fan"' })
  sourceName: string;

  @Field(() => [String], { optional: true, description: 'romanization variants and likely misspellings of the source name, e.g. ["Yefan", "Ye Fann"]' })
  variants?: string[];

  @Field({ minLength: 1, maxLength: 300, description: 'the alternate-world replacement name' })
  replacement: string;

  @Field(() => RebrandGlossaryCategory)
  category: 'character' | 'place' | 'country' | 'culture' | 'faction' | 'technique' | 'item' | 'term';

  @Field({ optional: true, description: 'who/what this is, in a phrase — helps later chapters use the mapping in the right context' })
  notes?: string;
}

@Schema()
export class RebrandGlossarySeedSchema {
  @Field({ minLength: 200, description: 'the alternate-world bible: geography, per-culture naming conventions, what replaced each real nation/culture, tone' })
  worldNotes: string;

  @Field(() => [RebrandMapping], { minItems: 1, description: 'initial rename mappings for every proper noun found in the provided material' })
  mappings: RebrandMapping[];
}

@Schema()
export class RebrandCarryState {
  @Field({ optional: true, description: 'directive-driven threads currently in motion (who, what stage, unresolved tension)' })
  activeThreads?: string;

  @Field({ optional: true, description: 'the last inserted beat, so the next chapter continues instead of repeating it' })
  lastInsertedBeat?: string;

  @Field({ optional: true, description: 'setups planted that a later chapter should pay off' })
  pendingSetups?: string;
}

@Schema()
export class RebrandFix {
  @Field(() => RebrandFixKind)
  kind: 'name' | 'attribution' | 'grammar';

  @Field({ minLength: 1, description: 'what was wrong and what it became' })
  detail: string;
}

@Schema()
export class RebrandAddedScene {
  @Field({ minLength: 1, description: 'where the scene was inserted, e.g. "after the sect trial, before the departure"' })
  placement: string;

  @Field({ minLength: 1, description: 'what the scene does for the directive, in a sentence' })
  purpose: string;
}

@Schema()
export class RebrandConvertSchema {
  @Field({ minLength: 1, maxLength: 500, description: 'the converted chapter title' })
  title: string;

  @Field({ minLength: 100, description: 'the full converted chapter prose' })
  body: string;

  @Field({ optional: true, description: '1-3 sentence summary of what changed beyond mechanical renames' })
  summaryOfChanges?: string;

  @Field(() => [RebrandMapping], { optional: true, description: 'mappings you had to invent for proper nouns not in the glossary — every unmapped rename goes here' })
  discoveredNames?: RebrandMapping[];

  @Field(() => RebrandCarryState, { optional: true, description: 'continuity state for directive-driven threads; omit when no directive material is in play' })
  carryState?: RebrandCarryState;

  @Field(() => [RebrandFix], { optional: true, description: 'notable copy-edit corrections made to the source' })
  fixes?: RebrandFix[];

  @Field(() => [RebrandAddedScene], { optional: true, description: 'scenes added for the directive; empty/omitted when nothing was inserted' })
  addedScenes?: RebrandAddedScene[];
}

@Schema()
export class RebrandAuditIssue {
  @Field(() => RebrandAuditIssueType)
  type: 'nationalism' | 'discrimination' | 'naming' | 'real_world_reference';

  @Field({ minLength: 1, description: 'what the violation is and where it appears' })
  detail: string;

  @Field({ optional: true, description: 'a short quote of the offending text' })
  excerpt?: string;
}

@Schema()
export class RebrandAuditSchema {
  @Field(() => RebrandAuditVerdict)
  verdict: 'clean' | 'issues';

  @Field(() => [RebrandAuditIssue], { description: 'every violation found; empty when the verdict is clean' })
  issues: RebrandAuditIssue[];
}

export type RebrandGlossarySeedOutput = RebrandGlossarySeedSchema;
export type RebrandConvertOutput = RebrandConvertSchema;
export type RebrandAuditOutput = RebrandAuditSchema;
