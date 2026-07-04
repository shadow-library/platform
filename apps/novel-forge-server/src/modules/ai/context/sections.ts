/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type ContextTier = 'canonical' | 'approved_intent' | 'working';
export type ContextPurpose = 'generation' | 'revision' | 'validation' | 'outline';

export interface ContextSection {
  key: string;
  tier: ContextTier;
  tokens: number;
  truncated: boolean;
  sourceRefs: string[];
  rendered: string;
}

export interface AssembledPack {
  projectId: bigint;
  purpose: ContextPurpose;
  chapter: number | null;
  budgetTokens: number;
  usedTokens: number;
  sections: ContextSection[];
  unresolvedRefs: string[];
  rendered: string;
}

/**
 * Declaring the constants
 */

// Section labels are part of the prompt contract — never change their text.
export const SECTION_LABELS: Record<string, string> = {
  prev_ending: '## PREVIOUS CHAPTER ENDING',
  continuation_state: '## CONTINUATION STATE',
  brief: '## CHAPTER BRIEF',
  volume_objective: '## VOLUME OBJECTIVE',
  memory: '## RECENT SUMMARIES',
  writing_style: '## WRITING STYLE',
  catalog: '## CANON CATALOG',
  lore_retrieved: '## LORE REFERENCES',
  prose_retrieved: '## PROSE REFERENCES',
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
