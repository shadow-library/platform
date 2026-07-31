/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import {
  type CatalogQuery,
  type CatalogResponse,
  type ChapterContent,
  type ChapterListResponse,
  type ChapterMeta,
  type CommentState,
  type NovelCharacter,
  type NovelComment,
  type NovelCommentReply,
  type NovelDetail,
  type NovelIllustration,
  type NovelReview,
  type NovelStatus,
  type NovelSummary,
  type RatingDistribution,
  type SessionUser,
} from './types';

/**
 * Defining types
 */
interface SeedNovel {
  slug: string;
  title: string;
  alt: string[];
  author: string;
  translator?: string;
  genres: string[];
  tags: string[];
  status: NovelStatus;
  chapterCount: number;
  updatedHoursAgo: number;
  rating: number;
  ratingCount: number;
  language: string;
  mature: boolean;
  views: number;
  cover: [string, string];
  synopsis: string;
}

/**
 * Declaring the constants
 *
 * Typed fixture data behind the API layer — webnovel-server does not exist yet, so dev mode answers every
 * canonical `/api` call from this dataset (adapted from the design handoff's prototype catalog). The switch
 * lives in `transport.ts`; production and `VITE_API_MODE=server` bypass fixtures entirely.
 */
export const FIXTURE_GENRES = [
  'Fantasy',
  'Cultivation',
  'LitRPG',
  'Romance',
  'Sci-Fi',
  'Action',
  'Martial Arts',
  'System',
  'Horror',
  'Mystery',
  'Slice of Life',
  'Drama',
  'Adventure',
  'Xianxia',
  'Wuxia',
  'Mecha',
  'Comedy',
  'Tragedy',
  'Villainess',
  'Dungeon',
  'Regression',
];

export const FIXTURE_TAGS = [
  'Overpowered MC',
  'Weak to Strong',
  'Kingdom Building',
  'Female Lead',
  'Time Travel',
  'Magic Academy',
  'Revenge',
  'Slow Burn',
  'Politics',
  'Dragons',
  'Level System',
  'Second Chance',
];

const SEEDS: SeedNovel[] = [
  {
    slug: 'omniscient-sovereigns',
    title: 'Omniscient Sovereigns',
    alt: ['Sovereigns'],
    author: 'Shadow Novelist',
    genres: ['Fantasy', 'System', 'Romance', 'LitRPG'],
    tags: ['Level System', 'Female Lead', 'Overpowered MC', 'Slow Burn'],
    status: 'ongoing',
    chapterCount: 12438,
    updatedHoursAgo: 2,
    rating: 4.8,
    ratingCount: 31204,
    language: 'English',
    mature: true,
    views: 2840000,
    cover: ['#6366f1', '#312e81'],
    synopsis:
      'When the Seal shatters, reality reboots into a System — levels, classes, and quests bleed into the waking world, and only those who read the fine print survive the Integration. Two rival sovereigns, bound by a disposition neither of them chose, must decide whether to rule the reborn world together or unmake it.',
  },
  {
    slug: 'ninefold-heavens-codex',
    title: 'Ninefold Heavens Codex',
    alt: ['九天诀'],
    author: 'Cloud-Piercing Crane',
    translator: 'Skyborne TL',
    genres: ['Xianxia', 'Cultivation', 'Adventure', 'Martial Arts'],
    tags: ['Weak to Strong', 'Revenge'],
    status: 'ongoing',
    chapterCount: 5211,
    updatedHoursAgo: 6,
    rating: 4.6,
    ratingCount: 18933,
    language: 'Chinese',
    mature: false,
    views: 1650000,
    cover: ['#0ea5e9', '#0c4a6e'],
    synopsis:
      'A failed alchemist inherits a codex that rewrites the laws of qi itself. To master it he must gamble everything against nine sovereign clans who would rather see the heavens fall than share them.',
  },
  {
    slug: 'clockwork-saint',
    title: 'Clockwork Saint',
    alt: ['시계태엽 성녀'],
    author: 'Iris Vale',
    genres: ['Sci-Fi', 'Fantasy', 'Mystery', 'Drama'],
    tags: ['Female Lead', 'Politics', 'Slow Burn'],
    status: 'ongoing',
    chapterCount: 342,
    updatedHoursAgo: 24,
    rating: 4.7,
    ratingCount: 9021,
    language: 'English',
    mature: false,
    views: 720000,
    cover: ['#f43f5e', '#4c0519'],
    synopsis: 'In a city where memory is currency and cathedrals run on brass and steam, a saint who cannot remember her own miracles must solve the murder that erased her.',
  },
  {
    slug: 'saintess-who-chose-ruin',
    title: 'The Saintess Who Chose Ruin',
    alt: ['파멸을 택한 성녀'],
    author: 'Dain Cho',
    translator: 'Rosethorn',
    genres: ['Romance', 'Fantasy', 'Villainess', 'Drama'],
    tags: ['Female Lead', 'Revenge', 'Second Chance'],
    status: 'ongoing',
    chapterCount: 214,
    updatedHoursAgo: 72,
    rating: 4.5,
    ratingCount: 12740,
    language: 'Korean',
    mature: false,
    views: 980000,
    cover: ['#a855f7', '#3b0764'],
    synopsis:
      'Reborn as the villainess destined to burn at the empire’s stake, Liselotte decides that if the story demands a monster, she will be a magnificent one — and take the throne while she is at it.',
  },
  {
    slug: 'regressors-tenth-life',
    title: 'Regressor’s Tenth Life',
    alt: ['회귀자의 열 번째 생'],
    author: 'Ji-hoon Park',
    translator: 'Apex TL',
    genres: ['Action', 'System', 'Regression', 'Fantasy'],
    tags: ['Overpowered MC', 'Level System', 'Time Travel'],
    status: 'ongoing',
    chapterCount: 889,
    updatedHoursAgo: 14,
    rating: 4.7,
    ratingCount: 22110,
    language: 'Korean',
    mature: true,
    views: 1980000,
    cover: ['#10b981', '#064e3b'],
    synopsis:
      'On his ninth death, the Tower finally tells Kang Yuwon the truth: he was never meant to clear it. On his tenth life, he stops trying to survive the apocalypse — and starts trying to end the ones who wrote it.',
  },
  {
    slug: 'duskmourn',
    title: 'Duskmourn',
    alt: [],
    author: 'A. R. Locke',
    genres: ['Horror', 'Fantasy', 'Mystery'],
    tags: ['Slow Burn'],
    status: 'ongoing',
    chapterCount: 158,
    updatedHoursAgo: 120,
    rating: 4.4,
    ratingCount: 4021,
    language: 'English',
    mature: true,
    views: 410000,
    cover: ['#14b8a6', '#134e4a'],
    synopsis: 'The house on Duskmourn Lane collects the people who move in. Halloway plans to be the first to move out — alive.',
  },
  {
    slug: 'iron-road-to-godhood',
    title: 'Iron Road to Godhood',
    alt: ['成神铁路'],
    author: 'Forge-Walker',
    translator: 'Titan TL',
    genres: ['LitRPG', 'System', 'Action', 'Adventure'],
    tags: ['Level System', 'Kingdom Building', 'Dungeon Diving'],
    status: 'ongoing',
    chapterCount: 1620,
    updatedHoursAgo: 9,
    rating: 4.5,
    ratingCount: 15200,
    language: 'Chinese',
    mature: false,
    views: 1120000,
    cover: ['#f59e0b', '#451a03'],
    synopsis: 'A blacksmith is given a System that levels only when he builds. So he builds — a forge, a town, an army, a road that runs straight to the seat of the gods.',
  },
  {
    slug: 'starfall-requiem',
    title: 'Starfall Requiem',
    alt: [],
    author: 'Nova Ainsley',
    genres: ['Sci-Fi', 'Mecha', 'Action', 'Tragedy'],
    tags: [],
    status: 'completed',
    chapterCount: 96,
    updatedHoursAgo: 1440,
    rating: 4.9,
    ratingCount: 7800,
    language: 'English',
    mature: false,
    views: 560000,
    cover: ['#8b5cf6', '#2e1065'],
    synopsis: 'The war ended the day the stars began to fall. What comes after is a requiem played in the cockpits of the last machines that remember how to fight.',
  },
  {
    slug: 'academys-weakest-instructor',
    title: 'Academy’s Weakest Instructor',
    alt: ['학원의 최약체 교관'],
    author: 'Yuna Seo',
    translator: 'Bloom',
    genres: ['Fantasy', 'Comedy', 'Slice of Life', 'Action'],
    tags: ['Magic Academy', 'Overpowered MC'],
    status: 'ongoing',
    chapterCount: 404,
    updatedHoursAgo: 26,
    rating: 4.3,
    ratingCount: 6600,
    language: 'Korean',
    mature: false,
    views: 640000,
    cover: ['#06b6d4', '#164e63'],
    synopsis: 'Ranked dead last among the academy’s instructors, Professor Ross has one small secret: the ranking board only measures the magic he lets them see.',
  },
  {
    slug: 'beastlord-of-the-verdant-wastes',
    title: 'Beastlord of the Verdant Wastes',
    alt: ['翠荒兽主'],
    author: 'Green-Antler',
    translator: 'Wildpath',
    genres: ['Fantasy', 'Adventure', 'Action'],
    tags: ['Kingdom Building', 'Weak to Strong'],
    status: 'hiatus',
    chapterCount: 733,
    updatedHoursAgo: 504,
    rating: 4.1,
    ratingCount: 5400,
    language: 'Chinese',
    mature: false,
    views: 480000,
    cover: ['#22c55e', '#052e16'],
    synopsis: 'Exiled to the Verdant Wastes with nothing but a broken beast-bond, Tamar discovers the monsters out here would rather follow a king than be hunted by one.',
  },
  {
    slug: 'the-devils-ledger',
    title: 'The Devil’s Ledger',
    alt: [],
    author: 'M. Okafor',
    genres: ['Fantasy', 'Mystery', 'Drama', 'System'],
    tags: ['Politics', 'Slow Burn'],
    status: 'ongoing',
    chapterCount: 267,
    updatedHoursAgo: 48,
    rating: 4.6,
    ratingCount: 8100,
    language: 'English',
    mature: true,
    views: 520000,
    cover: ['#e11d48', '#4c0519'],
    synopsis: 'Every favor has a price and every soul has a line item. Adaeze intends to balance the ledger of the city that sold her — in red.',
  },
  {
    slug: 'ten-thousand-swords-return',
    title: 'Ten Thousand Swords Return',
    alt: ['万剑归宗'],
    author: 'Sword-Sea Wanderer',
    translator: 'Edge TL',
    genres: ['Wuxia', 'Martial Arts', 'Action', 'Cultivation'],
    tags: ['Weak to Strong', 'Revenge', 'Overpowered MC'],
    status: 'ongoing',
    chapterCount: 3980,
    updatedHoursAgo: 11,
    rating: 4.4,
    ratingCount: 16700,
    language: 'Chinese',
    mature: false,
    views: 1440000,
    cover: ['#3b82f6', '#172554'],
    synopsis:
      'Betrayed and cast into the Abyss of Broken Blades, Ye Han spends a hundred years learning the grudge of every sword that ever died there — then walks home to return them all.',
  },
  {
    slug: 'how-to-retire-as-a-villainess',
    title: 'How to Retire as a Villainess',
    alt: ['악녀는 은퇴하고 싶다'],
    author: 'Haeun Kim',
    translator: 'Petal',
    genres: ['Romance', 'Villainess', 'Comedy', 'Slice of Life'],
    tags: ['Female Lead', 'Second Chance'],
    status: 'ongoing',
    chapterCount: 178,
    updatedHoursAgo: 96,
    rating: 4.6,
    ratingCount: 14300,
    language: 'Korean',
    mature: false,
    views: 1080000,
    cover: ['#d946ef', '#4a044e'],
    synopsis:
      'Rosalind has died as the villainess in three separate novels. This time she has a plan: retire early, buy a vineyard, and let the heroine handle her own love triangle for once.',
  },
  {
    slug: 'dungeon-core-diaries',
    title: 'Dungeon Core Diaries',
    alt: [],
    author: 'Sam Whitfield',
    genres: ['LitRPG', 'Dungeon', 'Comedy', 'Adventure'],
    tags: ['Level System', 'Kingdom Building'],
    status: 'ongoing',
    chapterCount: 1044,
    updatedHoursAgo: 16,
    rating: 4.3,
    ratingCount: 9900,
    language: 'English',
    mature: false,
    views: 830000,
    cover: ['#f97316', '#431407'],
    synopsis: 'Pip is a nervous little dungeon core who would really prefer NOT to be raided, thank you. Unfortunately the adventurers keep leaving five-star reviews.',
  },
];

const CHAPTER_TITLES = [
  'Eternal Pilgrim',
  'The Fine Print',
  'A Debt to Be Carried',
  'What the Rain Knew',
  'The Ninth Terrace',
  'Ashes of the Covenant',
  'The Warden’s Ledger',
  'Small Mercies',
  'The Long Way Down',
  'A Crown of Quiet Things',
  'The Sealed Door',
  'Integration Day',
];

const PARAGRAPH_POOL = [
  'She had counted on the rain. He had learned, in the years since, that power was not a river to be drunk from but a debt to be carried — and that the ones who forgot this were the ones the ledger collected first.',
  'They came at dusk, as such people always did, believing darkness was on their side. They had not read the terms. Darkness had a prior arrangement.',
  'The System’s window hung in the air between them, patient as a creditor, its cursor blinking through the silence neither of them wanted to break.',
  'There is a particular quiet that settles over a battlefield the moment before it becomes one. The old soldiers called it the intake of breath. The new ones didn’t call it anything; they were too busy dying in it.',
  'He turned the page. The page, in a manner of speaking, turned him back — the words rearranging themselves the way water rearranges a shoreline, indifferent and absolute.',
  'The city below burned its lamps in long rows toward the sea, and from the terrace it looked less like a city than a sentence being written by someone with beautiful handwriting and terrible intent.',
  'A level is only a number, her master had said. So is a heartbeat, she had answered, and he had never corrected her again.',
  'The messenger knelt in the frost with the letter held above his head, and the whole court watched the Empress decide, in perfect stillness, which of three wars to start by opening it.',
  'What the codex demanded was not effort. Effort it had in abundance, offered by ten thousand disciples with straighter backs and purer cores. What it demanded was the willingness to be rewritten.',
  'Later, the historians would disagree about almost everything — the hour, the weather, who drew first. On one detail every account aligns: the door was already open.',
  'The dungeon adjusted its torches to a flattering warmth and hoped, with all the sincerity a rock can muster, that today no one heroic would visit.',
  'Somewhere above, past the vaults and the wardstone and the polite fictions of the treaty, the stars were beginning to fall. He put the kettle on. Some endings are improved by tea.',
];

function seedIndex(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index++) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash;
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/**
 * Enrichment pools — the overview/reviews/comments blocks are synthesized deterministically per slug so
 * every novel carries some, and the same slug always yields the same cast, art, ratings, and threads.
 */
const CHARACTER_NAMES = [
  'Kaelen Vurst',
  'Seraphine Ardal',
  'Ryu Kang',
  'Lysandra Vale',
  'Corvin Ashfall',
  'Isolde Wren',
  'Thorne Blackwood',
  'Mira Sunhollow',
  'Aldric Thorne',
  'Nyx Everdark',
  'Elara Dawnsong',
  'Draven Mireheart',
];

const CHARACTER_ROLES = ['Protagonist', 'Deuteragonist', 'Rival', 'Mentor', 'Antagonist', 'Love Interest', 'Loyal Ally', 'Comic Relief'];

const GRADIENTS: [string, string][] = [
  ['#6366f1', '#312e81'],
  ['#f43f5e', '#4c0519'],
  ['#0ea5e9', '#0c4a6e'],
  ['#10b981', '#064e3b'],
  ['#f59e0b', '#451a03'],
  ['#a855f7', '#3b0764'],
  ['#14b8a6', '#134e4a'],
  ['#e11d48', '#4c0519'],
];

const ILLUSTRATION_CAPTIONS = ['Cover illustration', 'Key visual', 'Character sheet', 'The confrontation', 'Volume 1 art', 'Concept art', 'Splash page', 'World map'];

const REVIEW_USERS = ['aria_reads', 'frostbite', 'LordFluff', 'pageturner', 'melancholic_moth', 'vX_reader', 'SolarFlare', 'quietstorm'];

const RELATIVE_WHENS = ['yesterday', '2 days ago', '1 week ago', '3 weeks ago', 'last month', '2 months ago'];

const REVIEW_BODIES = [
  'Easily one of the most gripping opening arcs I have read this year. The worldbuilding never info-dumps — it trusts you to keep up.',
  'The pacing sags in the middle act, but the payoff is worth it. Side characters carry more weight than the blurb suggests.',
  'A slow burn done right. If you bounced off chapter three, push to ten — that is where it clicks.',
  'The prose is gorgeous but the plot occasionally forgets its own rules. Still, I could not put it down.',
  'This is comfort reading with teeth. Cozy until it very much is not.',
  'Late-game turn ahead: the mentor’s betrayal reframes the entire first volume and I am not okay.',
];

const COMMENT_BODIES = [
  'That last chapter broke me. Anyone else need a moment after that reveal?',
  'The translation quality jumped up around the second arc — much smoother now.',
  'Underrated take: the antagonist is right and nobody in the comments wants to admit it.',
  'Started this on a whim and now I am 400 chapters deep at 3am. Send help.',
  'Wish the release schedule were faster, but honestly the quality is worth the wait.',
];

const REPLY_BODIES = [
  'Hard agree, that chapter lived in my head for a week.',
  'Same, the cliffhanger was brutal.',
  'Counterpoint: it was foreshadowed all the way back in volume one.',
];

function buildCharacters(slug: string): NovelCharacter[] {
  const count = 4 + (seedIndex(`${slug}:charcount`) % 3);
  return Array.from({ length: count }, (_, index) => {
    const hash = seedIndex(`${slug}:char:${index}`);
    return {
      name: CHARACTER_NAMES[(hash + index) % CHARACTER_NAMES.length] as string,
      role: CHARACTER_ROLES[index < CHARACTER_ROLES.length ? index : hash % CHARACTER_ROLES.length] as string,
      color: GRADIENTS[(hash >>> 5) % GRADIENTS.length] as [string, string],
    };
  });
}

function buildIllustrations(slug: string): NovelIllustration[] {
  const count = 4 + (seedIndex(`${slug}:illcount`) % 5);
  return Array.from({ length: count }, (_, index) => {
    const hash = seedIndex(`${slug}:ill:${index}`);
    return {
      id: `${slug}-ill-${index}`,
      caption: index % 2 === 0 ? (ILLUSTRATION_CAPTIONS[hash % ILLUSTRATION_CAPTIONS.length] as string) : undefined,
      color: GRADIENTS[(hash >>> 4) % GRADIENTS.length] as [string, string],
    };
  });
}

function buildRelated(slug: string, summaries: NovelSummary[]): NovelSummary[] {
  const others = summaries.filter(summary => summary.slug !== slug);
  if (others.length === 0) return [];
  const start = seedIndex(`${slug}:rel`) % others.length;
  return [...others.slice(start), ...others.slice(0, start)].slice(0, 6);
}

/** A soft gaussian around the mean rating — plausible skew that always peaks at the star nearest `rating`. */
function buildDistribution(rating: number, total: number): RatingDistribution {
  const raw = [5, 4, 3, 2, 1].map(star => Math.exp(-((star - rating) ** 2) / 0.6));
  const sum = raw.reduce((accumulator, value) => accumulator + value, 0);
  const counts = raw.map(value => Math.round((value / sum) * total));
  return [counts[0] as number, counts[1] as number, counts[2] as number, counts[3] as number, counts[4] as number];
}

function buildReviews(slug: string): NovelReview[] {
  const count = 3 + (seedIndex(`${slug}:revcount`) % 3);
  return Array.from({ length: count }, (_, index) => {
    const hash = seedIndex(`${slug}:rev:${index}`);
    return {
      id: `${slug}-rev-${index}`,
      user: REVIEW_USERS[(hash + index) % REVIEW_USERS.length] as string,
      when: RELATIVE_WHENS[(hash >>> 3) % RELATIVE_WHENS.length] as string,
      rating: 3 + ((hash >>> 2) % 3),
      body: REVIEW_BODIES[(hash >>> 5) % REVIEW_BODIES.length] as string,
      spoiler: index === 2,
      helpful: (hash >>> 7) % 240,
    };
  });
}

function buildComments(slug: string): NovelComment[] {
  const states: CommentState[] = ['normal', 'normal', 'deleted', 'moderated'];
  return states.map((state, index) => {
    const hash = seedIndex(`${slug}:com:${index}`);
    const replies: NovelCommentReply[] | undefined =
      index === 0
        ? Array.from({ length: 2 }, (_, replyIndex) => {
            const replyHash = seedIndex(`${slug}:com:${index}:rep:${replyIndex}`);
            return {
              id: `${slug}-com-${index}-rep-${replyIndex}`,
              user: REVIEW_USERS[(replyHash + replyIndex) % REVIEW_USERS.length] as string,
              when: RELATIVE_WHENS[(replyHash >>> 2) % RELATIVE_WHENS.length] as string,
              body: REPLY_BODIES[(replyHash >>> 4) % REPLY_BODIES.length] as string,
              likes: (replyHash >>> 6) % 40,
            };
          })
        : undefined;
    return {
      id: `${slug}-com-${index}`,
      user: REVIEW_USERS[(hash + index) % REVIEW_USERS.length] as string,
      when: RELATIVE_WHENS[(hash >>> 2) % RELATIVE_WHENS.length] as string,
      body: COMMENT_BODIES[(hash >>> 4) % COMMENT_BODIES.length] as string,
      likes: (hash >>> 6) % 120,
      spoiler: index === 1,
      state,
      replies,
    };
  });
}

function toSummary(detail: NovelDetail): NovelSummary {
  const { slug, title, author, genres, status, rating, ratingCount, chapterCount, synopsis, updatedAt, views, cover } = detail;
  return { slug, title, author, genres, status, rating, ratingCount, chapterCount, synopsis, updatedAt, views, cover };
}

function toDetail(seed: SeedNovel): NovelDetail {
  return {
    slug: seed.slug,
    title: seed.title,
    author: seed.author,
    genres: seed.genres,
    status: seed.status,
    rating: seed.rating,
    ratingCount: seed.ratingCount,
    chapterCount: seed.chapterCount,
    synopsis: seed.synopsis,
    updatedAt: hoursAgoIso(seed.updatedHoursAgo),
    views: seed.views,
    cover: { from: seed.cover[0], to: seed.cover[1] },
    alternativeTitles: seed.alt,
    tags: seed.tags,
    language: seed.language,
    translator: seed.translator,
    mature: seed.mature,
  };
}

const BASE_NOVELS: NovelDetail[] = SEEDS.map(toDetail);
const NOVEL_SUMMARIES: NovelSummary[] = BASE_NOVELS.map(toSummary);

export const FIXTURE_NOVELS: NovelDetail[] = BASE_NOVELS.map(novel => ({
  ...novel,
  characters: buildCharacters(novel.slug),
  illustrations: buildIllustrations(novel.slug),
  related: buildRelated(novel.slug, NOVEL_SUMMARIES),
  reviews: buildReviews(novel.slug),
  ratingDistribution: buildDistribution(novel.rating, novel.ratingCount),
  comments: buildComments(novel.slug),
}));

function chapterTitle(slug: string, ordinal: number): string {
  return CHAPTER_TITLES[(seedIndex(slug) + ordinal) % CHAPTER_TITLES.length] as string;
}

export function fixtureCatalog(query: CatalogQuery): CatalogResponse {
  const term = query.q?.trim().toLowerCase();
  let items = FIXTURE_NOVELS.filter(novel => {
    if (query.genre && !novel.genres.includes(query.genre)) return false;
    if (query.status && novel.status !== query.status) return false;
    if (!term) return true;
    const haystack = [novel.title, novel.author, ...novel.genres, ...novel.tags].join(' ').toLowerCase();
    return haystack.includes(term);
  });

  const sort = query.sort ?? 'trending';
  items = [...items].sort((a, b) => {
    if (sort === 'popular') return b.views - a.views;
    if (sort === 'rating') return b.rating - a.rating;
    if (sort === 'updated') return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (sort === 'chapters') return b.chapterCount - a.chapterCount;
    if (sort === 'title') return a.title.localeCompare(b.title);
    return b.views * b.rating - a.views * a.rating;
  });

  const pageSize = query.limit ?? 24;
  const page = query.page ?? 1;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize, genres: FIXTURE_GENRES };
}

export function fixtureNovel(slug: string): NovelDetail | undefined {
  return FIXTURE_NOVELS.find(novel => novel.slug === slug);
}

export function fixtureChapterList(slug: string, page: number, limit: number): ChapterListResponse | undefined {
  const novel = fixtureNovel(slug);
  if (!novel) return undefined;
  const start = (page - 1) * limit;
  const end = Math.min(start + limit, novel.chapterCount);
  const items: ChapterMeta[] = [];
  for (let ordinal = start + 1; ordinal <= end; ordinal++) {
    items.push({ ordinal, title: chapterTitle(slug, ordinal), releasedAt: hoursAgoIso((novel.chapterCount - ordinal) * 8 + 2) });
  }
  return { items, total: novel.chapterCount };
}

export function fixtureChapter(slug: string, ordinal: number): ChapterContent | undefined {
  const novel = fixtureNovel(slug);
  if (!novel || ordinal < 1 || ordinal > novel.chapterCount) return undefined;
  const base = seedIndex(`${slug}:${ordinal}`);
  const paragraphs: string[] = [];
  for (let index = 0; index < 14; index++) paragraphs.push(PARAGRAPH_POOL[(base + index) % PARAGRAPH_POOL.length] as string);
  return {
    novelSlug: slug,
    novelTitle: novel.title,
    ordinal,
    title: chapterTitle(slug, ordinal),
    paragraphs,
    contentHash: `fx-${base.toString(16)}`,
    previousOrdinal: ordinal > 1 ? ordinal - 1 : undefined,
    nextOrdinal: ordinal < novel.chapterCount ? ordinal + 1 : undefined,
    totalChapters: novel.chapterCount,
  };
}

/** Fixture session is authenticated so the library/progress screens render without the identity flow. */
export const FIXTURE_SESSION: SessionUser = { userId: 'usr_demo', name: 'Demo Reader', email: 'reader@shadow.app' };
