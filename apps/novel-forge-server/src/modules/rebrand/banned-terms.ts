// Real-world nation/ethnicity/brand terms that must never survive conversion (rebrand design §2),
// grouped into named packs so a project can opt into only the ones its source material needs.
// Matched case-insensitively on word boundaries, so common-word collisions need care: single-word
// dynasty names ("Han", "Tang", "Ming") are left out because they collide with ordinary names and
// words — their dynastic uses ride along with other signals or a per-project `settings.bannedExtra`
// entry.
export const BANNED_TERM_PACKS: Record<string, string[]> = {
  'east-asian': [
    'China',
    'Chinese',
    'Huaxia',
    'Hua Xia',
    'Yanhuang',
    'Middle Kingdom',
    'Zhongguo',
    'Japan',
    'Japanese',
    'Korea',
    'Korean',
    'Mongol',
    'Mongolian',
    'Mongolia',
    'Tibet',
    'Tibetan',
    'Taiwan',
    'Taiwanese',
    'Hong Kong',
    // Dynasty names only in their unambiguous compound forms.
    'Han Dynasty',
    'Tang Dynasty',
    'Ming Dynasty',
    'Qing Dynasty',
    'Song Dynasty',
  ],
  western: ['Europe', 'European', 'America', 'American', 'Russia', 'Russian', 'Persia', 'Persian', 'Westerner', 'Westerners'],
  'modern-brands': ['Google', 'Apple', 'Amazon', 'Microsoft', 'Facebook', 'Instagram', 'Coca-Cola', 'Nike', 'iPhone', 'Netflix'],
};

// Kept broad and unbucketed on purpose — a leftover reference to a real continent/ethnicity is
// suspicious regardless of which pack a project selected.
const ALWAYS_BANNED: string[] = ['India', 'Indian', 'Africa', 'African', 'Asia', 'Asian'];

export const DEFAULT_TERM_PACKS: string[] = ['east-asian'];

/** Flattens the selected packs (falling back to the default pack) plus the always-banned set into one deduped list. */
export function resolveBannedTerms(termPacks: string[] = DEFAULT_TERM_PACKS): string[] {
  const selected = termPacks.length > 0 ? termPacks : DEFAULT_TERM_PACKS;
  const terms = new Set<string>(ALWAYS_BANNED);
  for (const pack of selected) for (const term of BANNED_TERM_PACKS[pack] ?? []) terms.add(term);
  return [...terms];
}
