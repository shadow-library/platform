import { type Ideation } from '@server/database';

import { hasPlaybook, isOpenEndedLength } from './constraint-playbooks';

export type StudioStage = 'spark' | 'taste' | 'orient' | 'diverge' | 'deepen' | 'stress';

/** The story_seeds columns the router reads, with the row's nullable columns already normalised. */
export interface RouterSeedState {
  fields: Ideation.SeedFields;
  constraints: Ideation.SeedConstraint[];
  tasteAnchors: Ideation.TasteAnchors;
  concepts: Ideation.ConceptCard[];
  readiness: Ideation.ReadinessEntry[];
  askedQuestions: string[];
}

export interface StudioQuestion {
  id: string;
  stage: StudioStage;
  /** What the model must elicit, in editor terms. Never shown to the author. */
  intent: string;
  /** The "why I'm asking" line, shown to the author verbatim. */
  coaching: string;
  /** Sheet fields an answer can populate. An empty list means the answer lands as a locked constraint. */
  fills: Ideation.FieldKey[];
  /** True when spark extraction or a locked constraint has already settled this. */
  skipWhen: (seed: RouterSeedState) => boolean;
  /** Question ids this answer makes mandatory — the conditional branches the bank cannot hard-code. */
  followUps?: (seed: RouterSeedState) => string[];
  youDecide: 'commit-and-explain';
}

/** Exhaustive by construction: a new `SeedFields` key fails to type-check until it is listed here. */
const SEED_FIELD_MEMBERS: Record<Ideation.FieldKey, true> = {
  genre: true,
  themes: true,
  premise: true,
  hook: true,
  castShape: true,
  progressionSystem: true,
  protagonistDrive: true,
  stakes: true,
  serializationNotes: true,
  voice: true,
  workingTitle: true,
};

export const SEED_FIELD_KEYS = Object.keys(SEED_FIELD_MEMBERS) as Ideation.FieldKey[];

/** Constraint keys that name the room itself. The length lock is a scope constraint too, and fixes nothing about where the story happens. */
const ROOM_CONSTRAINT_KEYS = ['room', 'setting', 'world', 'place', 'location', 'locale'];

const filled = (value: string | string[] | undefined): boolean => (Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== '');

export const hasField = (seed: RouterSeedState, key: Ideation.FieldKey): boolean => filled(seed.fields[key]);

const hasConstraintKind = (seed: RouterSeedState, kind: Ideation.ConstraintKind): boolean => seed.constraints.some(constraint => constraint.kind === kind);

export const hasRoomConstraint = (seed: RouterSeedState): boolean =>
  seed.constraints.some(constraint =>
    constraint.key
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .some(token => ROOM_CONSTRAINT_KEYS.includes(token)),
  );

const playbook = (seed: RouterSeedState, key: string): boolean => hasPlaybook(seed.constraints, key);

/**
 * The bank's altitude ceiling is the idea. It stops after promise-naming: nothing here asks for an
 * opening paragraph, a chapter breakdown, or a volume shape — those are authored downstream, during
 * lore-bible refinement (ideation-studio design §3.1).
 */
export const QUESTION_BANK: StudioQuestion[] = [
  {
    id: 'spark.idea',
    stage: 'spark',
    intent: 'Get the idea out of the author in whatever shape it already exists, and extract the decisions hiding inside it as locked constraints.',
    coaching:
      'Start anywhere. A sentence, a scene you keep replaying, a comparison to something else — all of it works, and none of it has to be good yet. I am not grading this. I am going to read it back to you as a list of decisions you have already made, and you tell me which ones are load-bearing.',
    fills: [],
    skipWhen: seed => hasField(seed, 'premise') || seed.constraints.length > 0,
    youDecide: 'commit-and-explain',
  },
  {
    id: 'taste.comps',
    stage: 'taste',
    intent: 'Name up to three stories the author would reread, and what the reread is for — the anchors every option offered later is calibrated against.',
    coaching:
      'Name up to three stories you would happily read a second time. This is the single most useful thing you can tell me: everything I offer you from here is built out of what those three have in common, so two minutes now saves you rejecting twenty bad suggestions later. They do not have to be in your genre, and they do not have to be respectable.',
    fills: [],
    skipWhen: seed => seed.tasteAnchors.comps.length > 0 || (hasField(seed, 'premise') && seed.constraints.length > 0),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'orient.shelf',
    stage: 'orient',
    intent: 'Establish the shelf the finished book sits on — genre and subgenre in the words a browsing reader would use.',
    coaching:
      'Which shelf does this sit on? I am not asking so I can put it in a box. A genre is a set of promises the reader arrives already holding, and I would much rather we keep them on purpose than break them by accident.',
    fills: ['genre'],
    skipWhen: () => false,
    youDecide: 'commit-and-explain',
  },
  {
    id: 'orient.room',
    stage: 'orient',
    intent: 'Pin the room the reader lives in — where and when the story happens, at the resolution of a place you could point at.',
    coaching:
      'Where does this happen, and when? One place, not a world map — the room the reader will spend most of their time in. Settings are cheap to invent and expensive to change, because every decision after this one will quietly assume it.',
    fills: [],
    skipWhen: hasRoomConstraint,
    youDecide: 'commit-and-explain',
  },
  {
    id: 'orient.length',
    stage: 'orient',
    intent: 'Fix the container: finite or open-ended, roughly how many chapters, and the cadence the author can actually sustain.',
    coaching:
      'How long is this, and how often do you want to publish? A finite book and an open-ended serial are different machines — one gets to end on the ending you already imagined, the other has to keep earning the next chapter for years. Tell me which one you are signing up for and I will hold you to it.',
    fills: ['serializationNotes'],
    skipWhen: seed => playbook(seed, 'open-ended-length'),
    followUps: seed => (isOpenEndedLength(seed.fields.serializationNotes) ? ['deepen.renewal'] : []),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'orient.tone',
    stage: 'orient',
    intent: 'Collect the tags and tonal register a reader would search for — what the book is actually about, in three or four words.',
    coaching:
      'If a reader went looking for this, what tags would they type? Give me three or four, and tone counts as a tag. Comfort and dread are both perfectly good products, but they are built differently, and I would rather know now which one you are making.',
    fills: ['themes'],
    skipWhen: () => false,
    youDecide: 'commit-and-explain',
  },
  {
    id: 'orient.cast',
    stage: 'orient',
    intent: 'Settle the cast shape — how many leads carry the book, and how they are configured.',
    coaching:
      'How many people is this really about? One lead, two bound together, a crew of five. This decision has the longest shadow of anything we will decide today, because every lead you add needs a reason to be on the page late in the run, not just at the start.',
    fills: ['castShape'],
    skipWhen: () => false,
    youDecide: 'commit-and-explain',
  },
  {
    id: 'diverge.cards',
    stage: 'diverge',
    intent: 'Offer four genuinely different concepts built from the locked constraints and the taste anchors, and record which the author keeps, kills, or crosses.',
    coaching:
      'Here are four versions of your idea. They are not drafts of the same thing — each one runs on a different engine, so choosing between them is choosing what the book is for. Kill the ones you do not want and tell me why: a sharp reason for rejecting something is worth more to me than a lukewarm yes.',
    fills: ['premise', 'hook'],
    skipWhen: seed => hasField(seed, 'premise'),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.hook',
    stage: 'deepen',
    intent:
      'Pin the first-chapter promise — the specific thing the opening puts on the table that makes a reader keep going to see it resolved. Idea altitude only: what is promised, never how it is staged.',
    coaching:
      'What does the first chapter promise? Not how it opens — what it puts on the table. A hook is the debt the story takes on early and the reader stays to see paid: a question they need answered, a threat with a date on it, a bargain they can already tell will cost more than it looks. Say it in one line, and say the thing you are promising rather than the scene you would write.',
    fills: ['hook'],
    // The beginner path fills premise and hook together at diverge; this is the expert path's only
    // route to a hook, so it is offered the moment a seed arrives with a premise and no hook.
    skipWhen: seed => !hasField(seed, 'premise'),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.engine',
    stage: 'deepen',
    intent: 'Name the progression engine — what rises across the book, and whether the reader can see it rise.',
    coaching:
      'What goes up, and can the reader see the number? Something has to increase — power, territory, competence, the count of people who owe you — and the reader has to feel it increase without being told that it did. If you cannot say what rises, the book has episodes but no spine.',
    fills: ['progressionSystem'],
    skipWhen: () => false,
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.renewal',
    stage: 'deepen',
    intent: 'Decide the second engine that takes over when the first ladder tops out, before the story is long enough for it to matter.',
    coaching:
      'When the ladder tops out, what replaces it? This is where open-ended stories die: the lead reaches the top of the thing that was going up, and there is nothing left to escalate. Decide the second engine now, while it is one paragraph, instead of mid-run when it is a rewrite.',
    fills: ['progressionSystem'],
    skipWhen: seed => !playbook(seed, 'open-ended-length') && !isOpenEndedLength(seed.fields.serializationNotes),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.want',
    stage: 'deepen',
    intent: "Pin the protagonist's concrete want — an object, a place, a person, a specific outcome that can be shown rather than summarised.",
    coaching:
      'What does your lead want — and a want is something you could photograph. "Respect" is a theme, not a want. "His brother\'s name struck off the guild ledger" is a want, because I can see it, the reader can see it, and so can he, on the day he finally gets it.',
    fills: ['protagonistDrive'],
    skipWhen: () => false,
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.refusal',
    stage: 'deepen',
    intent: 'Name the line the protagonist will not cross, and lock it, so victory can later be made to cost something.',
    coaching:
      "What won't they do, even to win? A character with no refusal is a plot device with dialogue. Give me the one line they hold, and I will make sure the story eventually asks them to cross it — that scene is usually the reason readers stay.",
    fills: [],
    skipWhen: () => false,
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.cost',
    stage: 'deepen',
    intent: "Convert the protagonist's flaw into the concrete thing it takes from them — the stakes, in losable things.",
    coaching:
      'Their flaw — what does it actually cost them, in things they can lose? Not "he is arrogant", but what arrogance takes off the table on the page. A flaw with no bill attached is a character note; a flaw with a bill is a plot.',
    fills: ['stakes'],
    skipWhen: () => false,
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.foil',
    stage: 'deepen',
    intent: 'Identify who is allowed to tell the protagonist they are wrong, and why the protagonist listens to them and nobody else.',
    coaching:
      'Who can tell them they are wrong and be heard? Every lead needs one person whose disagreement lands, or the book becomes an argument the protagonist wins by default. Name them now — they are usually the second most important character in the book, and they are almost always invented too late.',
    fills: [],
    skipWhen: () => false,
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.promise',
    stage: 'deepen',
    intent: 'Name the reader-promise betrayals — the specific things that would make a reader of this genre quit — and lock them as rules the plan must carry.',
    coaching:
      'What would make a reader of this genre put the book down and not come back? Pick the betrayals you are promising never to commit. These few rules are the only ones I carry forward as hard constraints, so choose the ones you actually mean: a promise broken deep into the run costs far more than one you never made.',
    fills: [],
    skipWhen: seed => hasConstraintKind(seed, 'promise'),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.voice',
    stage: 'deepen',
    intent: 'Settle the voice contract — person, tense, and register — as one line every later chapter prompt can hold.',
    coaching:
      'Whose head are we in, in what tense, and what does the prose sound like when nothing is happening? First or third, past or present, dry or warm. This single line travels with every chapter you ever generate, so it is worth thirty seconds of care.',
    fills: ['voice'],
    skipWhen: () => false,
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.secondLadder',
    stage: 'deepen',
    intent: 'Decide whether the second lead climbs an independent ladder or an offset one, so they cannot decay into a sidekick.',
    coaching:
      'You have two leads. Does the second one have their own thing that goes up, or an offset one that moves when the first stalls? Either answer works. What does not work is neither, because within the first arcs the lead without a ladder has quietly become a sidekick with extra dialogue.',
    fills: [],
    skipWhen: seed => !playbook(seed, 'dual-leads'),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.foreknowledgeDecay',
    stage: 'deepen',
    intent: 'Name the edge that replaces foreknowledge once the remembered timeline has stopped predicting this one.',
    coaching:
      'Your lead knows what happens. That is a clock, not a premise — every chapter they act on what they remember, the future they remember drifts further from the one they are living in. What becomes their edge once the memory has stopped being worth anything?',
    fills: [],
    skipWhen: seed => !playbook(seed, 'regression'),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.divergence',
    stage: 'deepen',
    intent: 'Fix the divergence structure — the early change and the consequence that makes this run stop resembling the remembered one.',
    coaching:
      'What makes this run different from the last one? Name the change they make early and the thing it detonates, because a second run that replays the first is a recap, and readers can feel a recap coming from a long way off.',
    fills: [],
    skipWhen: seed => !playbook(seed, 'regression'),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.stayingCost',
    stage: 'deepen',
    intent: 'Name what carries the tension a single-pairing romance removes — what staying together costs each of them.',
    coaching:
      'You have ruled out the genre\'s default tension source, the open question of who they end up with. Something has to take the load, and it is almost always cost: what does staying together actually take from each of them? Answer that and the romance keeps generating pressure long after the question of "who" is closed.',
    fills: [],
    skipWhen: seed => !playbook(seed, 'no-harem'),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.systemRules',
    stage: 'deepen',
    intent: "Fix the system's hard rules and its published limits, so the visible numbers stay constrainable rather than decorative.",
    coaching:
      'What can the system not do? Visible numbers only make tension if they are bounded — a system that gains a mechanic whenever the plot needs one is scenery, and the reader discounts every win after the first time it happens. Give me two or three rules you will never quietly break.',
    fills: [],
    skipWhen: seed => !playbook(seed, 'litrpg-system'),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.povBudget',
    stage: 'deepen',
    intent: 'Set the POV budget and name whose arc is the spine of the book.',
    coaching:
      "How many viewpoints, and whose arc is the spine? An ensemble is a budget: every POV you spend has to earn its chapters against the others, and one arc still has to be the book's centre of gravity — otherwise the reader has nobody to worry about while everyone else is off-page.",
    fills: [],
    skipWhen: seed => !playbook(seed, 'ensemble'),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.deferredTension',
    stage: 'deepen',
    intent: 'Name what tightens while the central pairing is deferred, so the wait escalates instead of idling.',
    coaching:
      'You are deferring the thing the reader is waiting for. That is a good trade only if something else is tightening meanwhile — proximity they cannot escape, obligation that keeps them in the same room, the mounting cost of concealment. What tightens while nothing happens? Without it, a slow burn reads as a stalled one.',
    fills: [],
    skipWhen: seed => !playbook(seed, 'slow-burn'),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'deepen.ironyBudget',
    stage: 'deepen',
    intent: 'Decide what the single viewpoint permanently withholds from the reader, and what that blindness buys.',
    coaching:
      "One viewpoint means there are things the reader can never simply be told. That is a purchase, not a loss — the reader's ignorance is where suspense lives. Name one thing you will keep off the page for a long time, and the moment your lead finally collides with it.",
    fills: [],
    skipWhen: seed => !playbook(seed, 'single-pov'),
    youDecide: 'commit-and-explain',
  },
  {
    id: 'stress.readiness',
    stage: 'stress',
    intent: 'Report the readiness verdict per dimension with concrete optional fixes, while making plain that none of it blocks starting the novel.',
    coaching:
      'Here is where the idea is strong and where it is thin. None of this blocks you — you can start the novel right now and fix the thin parts while you write. But thin things do not stay quiet; they turn into a stall you hit mid-draft, and five minutes here is much cheaper than that.',
    fills: [],
    skipWhen: () => false,
    youDecide: 'commit-and-explain',
  },
];

const QUESTIONS_BY_ID = new Map(QUESTION_BANK.map(question => [question.id, question]));

export const getQuestion = (id: string): StudioQuestion | undefined => QUESTIONS_BY_ID.get(id);
