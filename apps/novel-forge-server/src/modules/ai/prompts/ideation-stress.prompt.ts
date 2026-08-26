import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { READINESS_DIMENSION_ORDER, type ReadinessDimension } from '../../ideation/question-router';
import { type IdeationStressOutput, IdeationStressSchema } from '../schemas/ideation.schema';
import { type PromptModule } from './types';

const DIMENSION_BRIEFS: Record<string, string> = {
  hook: 'the reason a browsing reader opens chapter one, stated as a specific promise rather than a mood',
  protagonist: 'a person with a want the reader can feel, and a cast shape that gives them someone to be a person at',
  engine: 'what keeps generating scenes once the premise is spent — the stakes that renew instead of resolving',
  ladder: 'the visible climb a reader anticipates and argues about between chapters',
  promise: 'the named betrayals — the specific things this story is promising never to do to its reader',
  voice: 'a register a chapter could actually be written in, not an adjective',
  room: 'space for hundreds of chapters: a genre and a world with more in it than the premise needs',
};

const system = `You are the studio's turn as critic. An author has spent their session shaping a story seed and is deciding whether to start the novel. Your report is the last honest thing they hear before they do.

Judge the sheet on all ${READINESS_DIMENSION_ORDER.length} readiness dimensions, in this exact order:
${READINESS_DIMENSION_ORDER.map(dimension => `- ${dimension}: ${DIMENSION_BRIEFS[dimension]}`).join('\n')}

Three verdicts, and the bar for each is the planner's, not the author's feelings: "strong" means a chapter planner could build on this material as written; "thin" means something is there but it is not yet load-bearing; "empty" means there is nothing to build on. Judge what the sheet SAYS, not what it gestures at — "a dark fantasy vibe" is an empty voice, and a premise that implies stakes is not a stated one. Every note is one sentence and quotes the sheet rather than describing it abstractly.

Every thin and every empty verdict carries a "fix": one concrete, takeable step, specific to THIS story, that would lift the dimension — a question to answer, a decision to make, a sentence to write. Not "develop the stakes further". A strong verdict carries no fix.

You receive a structural precheck computed from the sheet — which fields and locked constraints each dimension actually found. It bounds you in one direction only: you may judge material weaker than the precheck's count suggests (a filled field can still be empty prose), and you may lift a dimension the precheck called thin when the material carries it anyway. But a dimension whose sources are absent cannot be strong — you cannot supply from imagination what the author has not written.

This report advises and never blocks. The author is allowed to start the novel on a thin sheet, and telling them what is thin is how they choose knowingly. No preamble, no encouragement, no summary — the dimensions carry the whole message.

Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:
{"readiness": [{"dimension": "${READINESS_DIMENSION_ORDER[0]}", "verdict": "strong|thin|empty", "note": "...", "fix": "..."}]}`;

const template = ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{stableContext}'], ['human', 'Structural precheck:\n{precheck}']]);

function validateShape(data: IdeationStressOutput): string[] {
  const entries = data.readiness ?? [];
  if (entries.length !== READINESS_DIMENSION_ORDER.length) return [`return exactly ${READINESS_DIMENSION_ORDER.length} readiness entries, one per dimension`];

  const errors: string[] = [];
  READINESS_DIMENSION_ORDER.forEach((dimension, index) => {
    if (entries[index]?.dimension !== dimension) errors.push(`readiness[${index}] must be the '${dimension}' dimension — report them in the given order`);
  });
  for (const entry of entries) {
    if (entry.verdict !== 'strong' && !entry.fix) errors.push(`the '${entry.dimension}' dimension is ${entry.verdict} and needs a concrete fix`);
  }
  return errors;
}

export const ideationStressPrompt: PromptModule<IdeationStressOutput> = {
  key: 'ideation-stress',
  version: '1.0.0',
  kind: 'analytical',
  role: 'judge',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template,
  schema: IdeationStressSchema,
  postValidate: validateShape,
};

/** Precheck-bound variant: the repair ladder forces the critic back below what the sheet structurally supports. */
export function buildIdeationStressPrompt(precheck: ReadinessDimension[]): PromptModule<IdeationStressOutput> {
  const structurallyEmpty = new Set<string>(precheck.filter(dimension => dimension.verdict === 'empty').map(dimension => dimension.dimension));
  return {
    ...ideationStressPrompt,
    postValidate: data => {
      const errors = validateShape(data);
      if (errors.length > 0) return errors;
      return (data.readiness ?? [])
        .filter(entry => entry.verdict === 'strong' && structurallyEmpty.has(entry.dimension))
        .map(entry => `the '${entry.dimension}' dimension has no material on the sheet and cannot be strong`);
    },
  };
}
