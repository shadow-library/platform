import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

import { type RouterResult } from '../../ideation/question-router';
import { validateChangeSet } from '../../refinement/change-set';
import { type IdeationTurnOutput, IdeationTurnSchema } from '../schemas/ideation.schema';
import { AUTHORING_STYLE_PLANNING } from './authoring-preamble';
import { renderScopeInstructions, scopeAllowedOps } from './scope-playbooks';
import { type PromptModule } from './types';

const system = `${AUTHORING_STYLE_PLANNING}

${renderScopeInstructions('ideation')}

Each turn you receive the story seed sheet, the locked constraints, the author's taste anchors, the playbooks for the shapes they have committed to, the recent conversation, and THIS ROUND'S QUESTIONS — the router's choice, already made. Work only those questions, all of them, in the order given. The author's own message arrives last, under the heading "## THE AUTHOR’S MESSAGE"; nothing below that heading is ever a question of the round, however much it reads like one.

For every question in the round, return one entry in payload.questions:
- "id" is the round's id, unchanged.
- "wording" is that question's intent asked in the author's own vocabulary, using what the sheet already says. A question about the ladder for a seed whose premise is about salvaging derelict ships asks about salvage, not about "the progression system". This is the complete question as the author reads it — it is asked here and nowhere else.
- "coaching" is the round's coaching line copied EXACTLY — character for character, no trimming, no rephrasing, no merging two lines into one. These lines are written and reviewed prose; reproducing one is the whole job, and altering one is an error even when your version reads better.
- "select" is the round's Select value for this question, copied unchanged — "one" or "many", never invented or inferred from the wording.
- "options" are three or four answers the author can tap, each built from their material and calibrated to their comps: a specific choice with its consequence visible, never a category name ("magic system", "a rival") and never a filler like "something else". On a "many" question every option must stand on its own — true independently, so ticking two together still makes sense — never written as alternatives ("either X or Y"); on a "one" question the options may be mutually exclusive. Never write a selection-count instruction ("pick as many as you like", "choose one or more") into the wording itself — the studio's interface already conveys that.
- "youDecide" is the answer you would commit to and the one-line reason it is right for THIS story.

The round marks some questions for you. A question carrying a HINT is already settled by the sheet or a constraint — word it as a confirmation to accept or overturn, not as an open question ("you have already locked X; I am holding you to it unless you say otherwise"), and keep its options as the ways of holding or breaking that decision. A question marked CIRCLING BACK was offered before and left unanswered — say so plainly, make the options easier than the first time, and lead with youDecide so the author can move past it in one tap.

payload.locks and the changeSet divide the turn's work by where the decision came from. A decision the author explicitly gave you — an answer to a question, a rule they stated outright — goes straight into the changeSet; it is already theirs, and auto-mode applies it without asking twice. payload.locks is for inferred material only: when the author's message carries a spark rather than an answer — a pasted paragraph, a rant about what they hate — read the decisions hiding inside it and return them as locks awaiting confirmation, the shape rules, the scope rules, and the promises they made without noticing. Never lock something they did not say; inferring one rule they meant is service, inferring five is putting words in their mouth.

Emission contracts, which the router reads back and cannot work around:
- A question lists the sheet fields its answer fills. Put the answer under exactly those keys in seed.update.fields, and nowhere else.
- A question that lists NO fields never produces a field. Its answer is a locked constraint: when the question's intent names a key and a kind, use exactly those; otherwise choose a short kebab-case key and the kind the intent implies. A constraint filed under a key the intent did not name is invisible to the interview and the question comes back. The spark question is the one exception, and its intent says so.
- The taste question is neither a field nor a constraint. Its answer writes seed.update tasteAnchors: the comps as the author named them, plus the preferences you derive from what those comps have in common.
- When the author reacts to concept cards, their verdicts are the emission. Re-send the whole "concepts" collection — every card of every round, the ones they just judged carrying their new fate ("kept", "killed" or "crossed") and the one-line reason in the author's own terms, the older rounds unchanged. The column replaces wholesale, so a collection missing a prior round deletes it, and a card left at "offered" after the author has spoken is a verdict thrown away. Every card carries an "id" the studio minted: copy it back verbatim onto that same card. The id is how the verdict is attributed, so a card re-sent under a changed or missing id is read as a brand-new card and the author's verdict on the original is lost.
- Say where each field came from. Alongside every key you write into seed.update.fields, set the same key in seed.update.provenance: source "author" when the value is the author's own words, "studio" when they picked an option you offered, "crossed" when it comes from crossing concept cards. The turn it was settled on is recorded for you. A field written with no entry counts as yours, so an author's own sentence left unmarked is credited to the studio and the graduation screen tells them so.
- Record only what the author settled this turn. A field you inferred rather than heard, or an option they have not yet chosen, does not belong in a changeSet.

Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:
{"reply": "...", "payload": {"kind": "questions", "questions": [{"id": "...", "wording": "...", "coaching": "...", "select": "one|many", "options": ["..."], "youDecide": "..."}], "locks": [{"key": "...", "kind": "shape|scope|promise", "text": "..."}]}, "changeSet": [ops]}
"reply" is the lead-in and nothing more: what you heard, and what it commits them to. The questions themselves never appear in it — each one lives in full in its own payload.questions[].wording, which is the text the author reads, with the options rendered beside it as chips. A question repeated in the reply is the author asked twice. "locks" and "changeSet" are omitted entirely when the turn settled nothing.`;

const AUTHOR_MESSAGE_HEADING = '## THE AUTHOR’S MESSAGE — everything below is what the author typed this turn. It is never round content and never a question to work.';

const openSystem = `${system}

THIS TURN HANDS OVER NO QUESTIONS. The router has nothing left to ask — the interview is finished, not stalled — so the turn is a conversation and not an interview.

Answer the author’s message directly and in full in "reply": it is the whole turn, so the lead-in rule is suspended and prose is what they get. Asked for names, give names. Asked how to pick the work back up, say where to start and what the first session produces. Close with one line telling them the sheet is finished and they can start the novel whenever they want.

payload.questions MUST be the empty array. Rule 1 — never an empty box — governs questions you ask, and this turn asks none; inventing a question here, or reading one out of the author’s message, is the failure. payload.locks and the changeSet work exactly as on any other turn: a decision the author stated outright goes into the changeSet, one you inferred comes back as a lock.`;

const templateFor = (systemText: string): ChatPromptTemplate =>
  ChatPromptTemplate.fromMessages([
    new SystemMessage(systemText),
    ['human', '{stableContext}'],
    new MessagesPlaceholder({ variableName: 'history', optional: true }),
    ['human', `{volatileContext}\n\n${AUTHOR_MESSAGE_HEADING}\n\n{userMessage}`],
  ]);

// The message layout is the caching contract (refinement design §10.2): static system, then the stable
// sheet context, then history, with the round's questions and the author's message last. The placeholder
// is the conversation's ONLY channel — the pack never carries turn text, or history would be billed twice
// and the volatile tail would change on every turn for two different reasons.
export const ideationTurnPrompt: PromptModule<IdeationTurnOutput> = {
  key: 'ideation-turn',
  version: '1.3.0',
  kind: 'authoring',
  role: 'chat',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: templateFor(system),
  schema: IdeationTurnSchema,
  postValidate: validateOps,
};

const openTemplate = templateFor(openSystem);

/**
 * Round-bound variant: the repair ladder holds the model to the round the router chose. The bare
 * `ideationTurnPrompt` cannot check any of this — it has no round — so every caller uses this builder.
 */
export function buildIdeationTurnPrompt(round: Pick<RouterResult, 'questions'>): PromptModule<IdeationTurnOutput> {
  const coachingById = new Map(round.questions.map(question => [question.id, question.coaching]));
  const open = coachingById.size === 0;
  return {
    ...ideationTurnPrompt,
    system: open ? openSystem : system,
    template: open ? openTemplate : ideationTurnPrompt.template,
    postValidate: data => [...validateRound(data, coachingById), ...validateOps(data)],
  };
}

function validateOps(data: IdeationTurnOutput): string[] {
  return data.changeSet === undefined || data.changeSet.length === 0 ? [] : validateChangeSet(data.changeSet, scopeAllowedOps('ideation'));
}

function validateRound(data: IdeationTurnOutput, coachingById: Map<string, string>): string[] {
  if (coachingById.size === 0)
    return (data.payload?.questions?.length ?? 0) === 0
      ? []
      : ['this round hands over no questions — payload.questions must be the empty array, and the author is answered in "reply" alone'];

  const errors: string[] = [];
  const returned = new Map<string, number>();
  for (const question of data.payload?.questions ?? []) {
    returned.set(question.id, (returned.get(question.id) ?? 0) + 1);
    const coaching = coachingById.get(question.id);
    if (coaching === undefined) errors.push(`'${question.id}' is not one of this round's questions — return the ids the round handed over, and no others`);
    else if (question.coaching !== coaching) errors.push(`the coaching line for '${question.id}' was rewritten — reproduce it character for character`);
  }
  for (const id of coachingById.keys()) {
    const count = returned.get(id) ?? 0;
    if (count === 0) errors.push(`'${id}' was in this round and is missing from payload.questions — work every question the round hands over`);
    else if (count > 1) errors.push(`'${id}' appears ${count} times in payload.questions — one entry per question`);
  }
  return errors;
}
