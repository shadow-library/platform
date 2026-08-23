export type ContextTier = 'canonical' | 'approved_intent' | 'working';
export type ContextPurpose =
  | 'generation'
  | 'revision'
  | 'validation'
  | 'outline'
  | 'chat'
  | 'chat_hub'
  | 'arc_plan'
  | 'premise'
  | 'audit'
  | 'rebrand_seed'
  | 'rebrand'
  | 'reforge_outline'
  | 'reforge'
  | 'reforge_analysis'
  | 'reforge_transform'
  | 'illustration';

// Stable = scope canon that only changes when a proposal is applied or a manual edit lands; volatile
// = per-turn/per-chapter content. The stable prefix must stay byte-identical across calls with
// unchanged canon — it is the provider prompt-cache key (refinement design §10.1).
export type ContextSegment = 'stable' | 'volatile';

export interface ContextSection {
  key: string;
  tier: ContextTier;
  segment: ContextSegment;
  tokens: number;
  truncated: boolean;
  sourceRefs: string[];
  rendered: string;
}

export interface OmittedSection {
  key: string;
  reason: 'budget' | 'unresolved';
}

export interface AssembledPack {
  projectId: bigint;
  purpose: ContextPurpose;
  chapter: number | null;
  budgetTokens: number;
  usedTokens: number;
  sections: ContextSection[];
  unresolvedRefs: string[];
  omitted: OmittedSection[];
  renderedStable: string;
  renderedVolatile: string;
  rendered: string;
}

// Section labels are part of the prompt contract — never change their text.
export const SECTION_LABELS: Record<string, string> = {
  prev_ending: '## PREVIOUS CHAPTER ENDING',
  continuation_state: '## CONTINUATION STATE',
  brief: '## CHAPTER BRIEF',
  volume_objective: '## VOLUME OBJECTIVE',
  arc_objective: '## ARC OBJECTIVE',
  memory: '## RECENT SUMMARIES',
  writing_style: '## WRITING STYLE',
  catalog: '## CANON CATALOG',
  lore_retrieved: '## LORE REFERENCES',
  prose_retrieved: '## PROSE REFERENCES',
  premise: '## PREMISE',
  doc_inventory: '## BIBLE DOCUMENT INVENTORY',
  document: '## DOCUMENT',
  volume_plan: '## VOLUME PLAN',
  volume: '## VOLUME',
  arc: '## ARC',
  arcs: '## ARCS',
  sibling_hooks: '## SIBLING ARC HOOKS',
  briefs_list: '## CHAPTER BRIEFS',
  skeleton: '## CHARACTER ARCS & POWER CURVE',
  prev_hook: '## PREVIOUS VOLUME HANDOFF',
  next_volume: '## NEXT VOLUME OBJECTIVE',
  changed_since: '## CHANGED SINCE THIS CONVERSATION STARTED',
  world_notes: '## WORLD NOTES',
  directives: '## DIRECTIVES',
  instructions: '## AUTHOR INSTRUCTIONS',
  target_length: '## TARGET LENGTH',
  glossary_slice: '## GLOSSARY',
  carry_state: '## CARRY STATE',
  signal_digest: '## DETERMINISTIC SIGNALS',
  cut_ledger: '## CUT LEDGER — THIS MATERIAL IS GONE',
  discovered_cuts: '## CUTS DISCOVERED WHILE WRITING',
  plan_span: '## PLAN SPAN',
  bridge: '## BRIDGE ACROSS THE CUT',
  entity_roster: '## ENTITY ROSTER',
  world_facts: '## WORLD FACTS',
  known_facts: '## KNOWN FACTS (POV CAST)',
  chapter_reveals: '## REVEALED THIS CHAPTER',
  hidden_constraints: '## BEHAVIORAL CONSTRAINTS',
  art_style: '## ART STYLE BIBLE',
  subject_card: '## SUBJECT',
  cast_appearance: '## CAST APPEARANCE',
};

export function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? '## ' + key.toUpperCase().replace(/_/g, ' ');
}

export function renderSection(key: string, content: string): string {
  return `${sectionLabel(key)}\n\n${content}`;
}

export function joinSections(sections: ContextSection[]): string {
  return sections.map(s => s.rendered).join('\n\n---\n\n');
}

/** Re-derives the stable/volatile split from a persisted pack's sections, for callers that reload a pack by id. */
export function splitSegments(sections: ContextSection[]): { renderedStable: string; renderedVolatile: string } {
  return {
    renderedStable: joinSections(sections.filter(s => s.segment === 'stable')),
    renderedVolatile: joinSections(sections.filter(s => s.segment !== 'stable')),
  };
}
