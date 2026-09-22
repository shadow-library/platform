import { type BlueprintStepStateResponse } from '@/lib/apis';

export type CostToChange = 'cheap' | 'medium' | 'expensive';

/** Every step screen takes the same three things; the layout owns the frame, the Notebook and the event stream. */
export interface StepScreenProps {
  projectId: string;
  step: BlueprintStepStateResponse;
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
