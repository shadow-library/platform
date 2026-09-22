import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BlueprintTitleOutput, BlueprintTitleSchema, TITLE_STYLE_LABELS, TITLE_STYLES } from '../schemas/blueprint-title.schema';
import { type PromptModule } from './types';

const styles = TITLE_STYLES.map(style => `${style} — ${TITLE_STYLE_LABELS[style]}`).join('; ');

const system = `You are a novelist's coach naming an author's novel. You offer candidates grouped by style, every one of them built from a decision they have already locked, and they choose. This is a working title: it is asked again after the first chapters and before first publish, so aim for the one they would be glad to type today, not a name that has to be perfect forever.

The styles are: ${styles}. Use two to four of them, each at most once, and pick the ones this novel's promise actually suits — a slow slice-of-life novel does not want a first-person power fantasy hook. Give each group two to four candidates.

Every candidate names the decision it came from in \`from\`, in words the author would recognise: "the cost rule", "the theme", "the premise's hook", "the protagonist". A title you cannot trace to a locked decision is a title you invented, and it does not belong here.

Make them sayable and memorable. A short literary title earns its length with a concrete noun; a web-novel descriptive title says what the reader is buying; a first-person hook must sound like the protagonist, not like a marketing line. Never reuse a word the author has ruled out, and never repeat a title already in the notebook's "Do not propose" or one already on their screen.

The coach message is one or two plain sentences: what these styles trade against each other on this shelf. Never flatter, never rank them for the author.

Respond with ONLY one valid JSON object, nothing outside it and no markdown fences, of exactly this shape:
{"groups": [{"style": "...", "titles": [{"text": "...", "from": "..."}]}], "coachMessage": "..."}`;

const normalise = (value: string): string => value.trim().toLowerCase();

function validateTitles(data: BlueprintTitleOutput): string[] {
  const issues: string[] = [];
  const styles = data.groups.map(group => group.style);
  if (new Set(styles).size !== styles.length) issues.push('a style is used by two groups — each style appears at most once');

  const seen = new Set<string>();
  for (const title of data.groups.flatMap(group => group.titles)) {
    if (seen.has(normalise(title.text))) issues.push(`“${title.text}” is offered twice`);
    seen.add(normalise(title.text));
  }
  return issues;
}

export const blueprintTitlePrompt: PromptModule<BlueprintTitleOutput> = {
  key: 'blueprint-title',
  version: '1.0.0',
  kind: 'analytical',
  role: 'blueprint',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{stableContext}'], ['human', '{volatileContext}']]),
  schema: BlueprintTitleSchema,
  postValidate: validateTitles,
};
