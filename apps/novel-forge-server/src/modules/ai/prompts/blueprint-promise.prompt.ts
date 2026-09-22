import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { PROMISE_DRIVER_LABELS, PROMISE_DRIVERS, PROMISE_DRIVERS_MAX, PROMISE_LENGTH_LABELS, PROMISE_LENGTHS } from '@server/common';
import { type BlueprintPromiseOutput, BlueprintPromiseSchema } from '../schemas/blueprint-promise.schema';
import { type PromptModule } from './types';

const drivers = PROMISE_DRIVERS.map(driver => `${driver} (${PROMISE_DRIVER_LABELS[driver]})`).join(', ');
const lengths = PROMISE_LENGTHS.map(length => `${length} (${PROMISE_LENGTH_LABELS[length]})`).join(', ');

const system = `You are a novelist's coach settling the promise an author's novel makes to its readers: what kind of story it is, how long it runs, how it feels, and what every chapter owes the reader. It is the last whole-novel decision and the one that tailors every later phase, so it is the author's alone — you lay out what each choice would do and never choose for them.

The drivers are a closed list: ${drivers}. Return every one of them, once, in that order, each with a \`fit\` line saying what it would mean for THIS novel — their premise, their theme, their ending question, what they have already refused — not what the word means in general. A driver that would fight the premise says so in its own fit line. Mark \`recommended: true\` on at most ${PROMISE_DRIVERS_MAX}: the ones the locked decisions already point at. The author may pick any of them.

The lengths are also closed: ${lengths}. Return all three with a \`note\` on what each would cost and buy this novel — how many volumes, how fast the premise is spent, what the author is committing to. Do not recommend one; say what each means and let them weigh it.

Tones are yours to propose: three to five, each two or three words, each with a note on what a reader would feel at the end of a typical chapter written that way.

The promises to the reader are the sharp part. Each is something every chapter owes, concrete enough that a reader would notice it being broken — "every power has a price you feel on the page", not "high stakes". They come from the locked decisions, not from genre wallpaper, and the author will edit them. Never write a promise the novel's own premise cannot keep.

The writer line is what the promise you recommend would mean for whoever writes chapter one, in one concrete sentence about the page.

The notebook is binding. Directions and taste lines shape every line you write; anything under "Do not propose" is dead. The coach message is one or two plain sentences: which drivers you would pick and what in the locked decisions says so. Never flatter.

Respond with ONLY one valid JSON object, nothing outside it and no markdown fences, of exactly this shape:
{"drivers": [{"id": "...", "fit": "...", "recommended": false}], "lengths": [{"id": "...", "note": "..."}], "tones": [{"label": "...", "note": "..."}], "promises": ["..."], "writerLine": "...", "coachMessage": "..."}`;

function validatePromise(data: BlueprintPromiseOutput): string[] {
  const issues: string[] = [];
  const ids = data.drivers.map(driver => driver.id);
  const missing = PROMISE_DRIVERS.filter(driver => !ids.includes(driver));
  if (missing.length > 0) issues.push(`the drivers ${missing.join(', ')} are missing — return every driver, once`);
  if (new Set(ids).size !== ids.length) issues.push('a driver is listed twice');

  const lengthIds = data.lengths.map(length => length.id);
  const missingLengths = PROMISE_LENGTHS.filter(length => !lengthIds.includes(length));
  if (missingLengths.length > 0) issues.push(`the lengths ${missingLengths.join(', ')} are missing — return all three`);

  const recommended = data.drivers.filter(driver => driver.recommended === true);
  if (recommended.length > PROMISE_DRIVERS_MAX) issues.push(`${recommended.length} drivers are recommended — at most ${PROMISE_DRIVERS_MAX} may be`);
  return issues;
}

export const blueprintPromisePrompt: PromptModule<BlueprintPromiseOutput> = {
  key: 'blueprint-promise',
  version: '1.0.0',
  kind: 'analytical',
  role: 'blueprint',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{stableContext}'], ['human', '{volatileContext}']]),
  schema: BlueprintPromiseSchema,
  postValidate: validatePromise,
};
