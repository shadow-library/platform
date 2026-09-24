import { type BlueprintStepState } from '@/lib/apis';

export type CostToChange = 'cheap' | 'medium' | 'expensive';

/** Every step screen takes the same three things; the layout owns the frame, the Notebook and the event stream. */
export interface StepScreenProps {
  projectId: string;
  step: BlueprintStepState;
  onLocked: () => void;
}

export interface BlueprintStepMeta {
  key: string;
  /** Sidebar sub-row. */
  label: string;
  /** The question the screen asks, as its heading. */
  title: string;
  lede: string;
  /** What a later change to this step's decision would touch. Shown on the decision card. */
  costToChange?: CostToChange;
  /** The label of the button that turns the chosen options into decisions. */
  lockLabel?: string;
  /** What to say when the novel's decisions rule the step out; the default speaks of the reader promise, which rules most steps out. */
  notNeeded?: { title: string; description: string };
}

/**
 * Copy for every step the server can register. It lives here rather than on the server because it is the
 * screen's wording, not the engine's contract — and because a step whose screen is not built yet still
 * needs a name in the sidebar.
 */
export const BLUEPRINT_STEP_META: Record<string, BlueprintStepMeta> = {
  start: {
    key: 'start',
    label: 'Starting point',
    title: 'What’s in your head right now?',
    lede: 'A scene, a feeling, “like X but Y”, a character, a single image. Leave it empty if there’s nothing yet.',
    costToChange: 'cheap',
    lockLabel: 'Save the starting point',
  },
  organise: {
    key: 'organise',
    label: 'Organise my notes',
    title: 'Your notes, organised',
    lede: 'One long read of everything you wrote: Story Bible pages in your own terms, a timeline and the questions your notes leave open. Anything the model would add is kept apart, for you to accept or turn down one by one.',
    costToChange: 'cheap',
    lockLabel: 'Add to my Story Bible',
    notNeeded: {
      title: 'Nothing long enough to organise yet',
      description: 'This step is offered when your starting point runs to about 600 words or more. Add your notes on the Starting point step to use it.',
    },
  },
  taste: {
    key: 'taste',
    label: 'Taste',
    title: 'Which would you rather read next?',
    lede: 'Either-or pairs for when you can’t put it into words, and a steer box for when you can. Pairs are shaped by your starting point.',
    costToChange: 'cheap',
    lockLabel: 'Show me story ideas',
  },
  concepts: {
    key: 'concepts',
    label: 'Concepts',
    title: 'Four directions this could go',
    lede: 'Your own idea is one of the cards. Keep one, kill the rest with a reason, or steer the whole round and see four more.',
    costToChange: 'medium',
    lockLabel: 'Build a premise from what I kept',
  },
  premise: {
    key: 'premise',
    label: 'Premise',
    title: 'One sentence, steered part by part',
    lede: 'Open a highlighted part to see alternatives for that part alone, or write your own. Locking the premise completes the Idea phase.',
    costToChange: 'expensive',
    lockLabel: 'Lock premise',
  },
  heart: {
    key: 'heart',
    label: 'Theme and ending',
    title: 'What this book is about underneath',
    lede: 'The question under the plot, and what the reader waits the whole novel to learn. Both are yours: rewriting one in your own words beats picking it.',
    costToChange: 'expensive',
    lockLabel: 'Lock theme and ending',
  },
  promise: {
    key: 'promise',
    label: 'Reader promise',
    title: 'What kind of story is this?',
    lede: 'The last whole-novel decision, and the one that tailors every later phase. A slice-of-life answer here means you are never asked for a villain.',
    costToChange: 'expensive',
    lockLabel: 'Lock reader promise',
  },
  title: {
    key: 'title',
    label: 'Title',
    title: 'Naming it, from what you have decided',
    lede: 'Titles in several styles, each tied to the decision it came from. Star, reject with a reason, or steer with rules.',
    costToChange: 'cheap',
    lockLabel: 'Use this title for now',
  },
  protagonist: {
    key: 'protagonist',
    label: 'Protagonist',
    title: 'Same person, three lies',
    lede: 'One generation writes the whole engine of this novel. Here it is the protagonist: the same character three times over, differing only in the lie they believe and what it makes them do in chapter one.',
    costToChange: 'expensive',
    lockLabel: 'Lock protagonist',
  },
  opposition: {
    key: 'opposition',
    label: 'Opposition',
    title: 'What stands in the way? Not every story has a villain',
    lede: 'Five kinds, each already answered for this novel and pre-selected from your reader promise. “Nothing: slice of life” replaces opposition with small goals, a rhythm and gentle stakes.',
    costToChange: 'expensive',
    lockLabel: 'Lock opposition',
  },
  world: {
    key: 'world',
    label: 'How the world works',
    title: 'Rules first, detail later',
    lede: 'What power costs, stated so a chapter can pay it on the page, and the hard rules under it. Each rule becomes a canon fact. Places and factions wait for Volume one.',
    costToChange: 'expensive',
    lockLabel: 'Lock world rules',
  },
  power: {
    key: 'power',
    label: 'The ladder',
    title: 'The ladder of ranks',
    lede: 'Asked for because progression is part of what you promised the reader: every rung with what it buys and what it costs.',
    costToChange: 'medium',
    lockLabel: 'Lock the ladder',
  },
  spine: {
    key: 'spine',
    label: 'The whole novel',
    title: 'The whole novel, movement by movement',
    lede: 'One movement per volume, with the ending question pinned above them and the big truths placed under them. Sketches, not plans: only volume one is detailed after this.',
    costToChange: 'expensive',
    lockLabel: 'Lock the spine',
  },
  cast: {
    key: 'cast',
    label: 'Cast',
    title: 'The people volume one needs',
    lede: 'Full cards only for the characters volume one actually uses; everyone later stays a one-liner. Hand a minor detail to the system and you can overrule it whenever you like.',
    costToChange: 'medium',
    lockLabel: 'Lock the cast',
  },
  places: {
    key: 'places',
    label: 'Places & factions',
    title: 'Where volume one happens',
    lede: 'Detail where the story actually goes, a sketch for the rest. Anything that changes no sentence in the next twenty chapters goes to the backlog — kept, not refused.',
    costToChange: 'medium',
    lockLabel: 'Lock places and factions',
  },
  arcs: {
    key: 'arcs',
    label: 'Arcs',
    title: 'Volume one, arc by arc',
    lede: 'Each arc needs a purpose and a turn, and the relationship rungs are placed onto the arcs that land them. Only arc one gets chapter briefs, in the next phase.',
    costToChange: 'medium',
    lockLabel: 'Lock volume one’s arcs',
  },
  briefs: {
    key: 'briefs',
    label: 'Arc 1 briefs',
    title: 'Arc one, chapter by chapter',
    lede: 'The closest altitude. Read chapter one’s brief properly and skim the rest; each one cites the Story Bible pages the chapter is written from. Later arcs are briefed in the Workspace when you reach them.',
    costToChange: 'cheap',
    lockLabel: 'Lock arc one’s briefs',
  },
  voice: {
    key: 'voice',
    label: 'Voice',
    title: 'How the book sounds',
    lede: 'Three openings of your real chapter one in different voices. Pick one, push it, and hand-edit a paragraph. The samples are thrown away; the notes and the paragraph are kept.',
    costToChange: 'medium',
    lockLabel: 'Lock the voice',
  },
  check: {
    key: 'check',
    label: 'Final check',
    title: 'One last pass before the gate',
    lede: 'Arithmetic and contradictions are one click. Story problems are A or B, your own fix, or a dismissal with a reason — and every one of them becomes a decision.',
    costToChange: 'cheap',
    lockLabel: 'Resolve and finish the Blueprint',
  },
};

const WORD_BREAK = /[._-]+/;

function humanise(key: string): string {
  const words = key.split(WORD_BREAK).filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Never throws on an unknown key: a step the server registers before its screen exists still has to render. */
export function blueprintStepMeta(key: string): BlueprintStepMeta {
  const known = BLUEPRINT_STEP_META[key];
  if (known) return known;
  const label = humanise(key);
  return { key, label, title: label, lede: 'This step is still being built.' };
}

export const COST_TO_CHANGE_LABELS: Record<CostToChange, string> = {
  cheap: 'Cheap to change',
  medium: 'Medium to change',
  expensive: 'Expensive to change',
};
