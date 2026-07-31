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

export interface RequiredBibleDoc {
  section: string;
  slug: string;
  purpose: string;
}

/**
 * Declaring the constants
 */

// The manifest of what a serialized web novel's bible needs (design §7). All slugs live under the
// existing bible_section enum — the audit model judges each entry against the project's actual
// premise, so genre-inapplicable entries (e.g. a progression ladder in a low-fantasy court drama)
// are expected to come back as `keep`-absent rather than `add`.
export const REQUIRED_BIBLE_DOCS: RequiredBibleDoc[] = [
  { section: 'project', slug: 'premise', purpose: 'the full premise: hook, stakes, protagonist drive' },
  { section: 'project', slug: 'reader-promise', purpose: 'what the reader reliably gets (per chapter, per arc) — the contract that keeps them subscribed' },
  { section: 'project', slug: 'pacing-tone', purpose: 'chapter rhythm, tone register, and how dark/light the story is allowed to swing' },
  { section: 'world', slug: 'setting-overview', purpose: 'where and when the story lives; the rules of normal life' },
  { section: 'world', slug: 'factions', purpose: 'the powers that be, what each wants, and why they collide' },
  { section: 'power', slug: 'progression-ladder', purpose: 'the visible ladder (ranks/levels/stages) readers anticipate and argue about' },
  { section: 'power', slug: 'rules-and-limits', purpose: 'what power costs, what it cannot do, and what breaking the rules means' },
  { section: 'plot', slug: 'escalation-map', purpose: 'how stakes grow volume over volume, from the opening conflict to the endgame' },
  { section: 'plot', slug: 'ending-vision', purpose: 'where the story ultimately lands — the promise the whole serial is steering toward' },
];

export function renderManifest(): string {
  return REQUIRED_BIBLE_DOCS.map(doc => `${doc.section}/${doc.slug} — ${doc.purpose}`).join('\n');
}
