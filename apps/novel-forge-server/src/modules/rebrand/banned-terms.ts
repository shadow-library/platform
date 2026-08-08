// Real-world nation/ethnicity terms that must never survive conversion (rebrand design §2). Matched
// case-insensitively on word boundaries, so common-word collisions need care: single-word dynasty
// names ("Han", "Tang", "Ming") are left out because they collide with ordinary names and words —
// their dynastic uses ride along with other signals or a per-project `settings.bannedExtra` entry.
export const BANNED_REAL_WORLD_TERMS: string[] = [
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
  'India',
  'Indian',
  'Russia',
  'Russian',
  'America',
  'American',
  'Europe',
  'European',
  'Africa',
  'African',
  'Asia',
  'Asian',
  'Westerner',
  'Westerners',
  // Dynasty names only in their unambiguous compound forms.
  'Han Dynasty',
  'Tang Dynasty',
  'Ming Dynasty',
  'Qing Dynasty',
  'Song Dynasty',
];
