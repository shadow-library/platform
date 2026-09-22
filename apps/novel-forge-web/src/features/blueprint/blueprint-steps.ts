export type CostToChange = 'cheap' | 'medium' | 'expensive';

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
