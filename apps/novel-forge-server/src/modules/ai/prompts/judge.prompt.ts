import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type JudgeOutput, JudgeSchema } from '../schemas/judge.schema';
import { type PromptModule } from './types';

const system =
  'You are a continuity judge for a serialized novel. You receive a newly drafted chapter and the established canon. Your task: identify any contradiction between the draft and canon facts. A contradiction is a HARD finding if it directly contradicts an established fact (character ability, location, relationship, or event) — it blocks acceptance. A SOFT finding is a stylistic wrinkle or minor inconsistency that does not contradict canon. Return structured JSON. If the chapter is consistent with canon, return an empty findings array and verdict: consistent. Be strict: invented canon in the draft (character has a power not established) counts as a hard finding.\n\nWhen the task includes an "## ENDING CONTRACT", additionally assess the draft ending against it and return endingCompliance: compliant only when the ending lands the contracted hookType, leaves the openQuestion unanswered, ends in the handoffState, and resolves nothing listed in mustNotResolve. A hurried or conclusive ending against a contract is non-compliant — list each violated field in issues. Ending-contract violations do not change the continuity verdict; report them only in endingCompliance. Omit endingCompliance entirely when no contract is provided.\n\nWhen the task includes a "## FORBIDDEN KNOWLEDGE" list, additionally assess epistemic compliance and return knowledgeCompliance: compliant only when the draft neither states a forbidden fact, nor paraphrases it, nor lets a character act on information they could only have if they already knew it. Facts the context marks "## REVEALED THIS CHAPTER" are allowed once the draft shows their discovery on-page. Knowledge leaks do not change the continuity verdict; report them only in knowledgeCompliance, each issue citing the forbidden fact key. Omit knowledgeCompliance entirely when no forbidden list is provided.\n\nThe task always includes a "## BRIEF" block — the plan the chapter was written from, stating its objective and the events it must dramatize. Always assess brief fulfillment and return briefCompliance: compliant only when the draft actually delivers the objective and every planned event on the page. A chapter that reads well, contradicts nothing, and still skips, defers, summarizes away, or silently replaces a planned event is filler — mark it non-compliant and name the missed objective or event in issues. Judge delivery, not wording: an event dramatized differently than described still counts, an event merely alluded to or pushed to a later chapter does not. Brief shortfalls do not change the continuity verdict; report them only in briefCompliance.\n\nAlways assess readability and return readabilityCompliance: the target is plain contemporary web-novel English — everyday words, one concrete thing per sentence, short paragraphs, dialogue on its own line, backstory in small doses. Short sentences can still be ornate: judge the diction, not the length. Mark it non-compliant when metaphorical or abstract phrasing recurs across the chapter — a voice, a feeling, a room, an idea or a stretch of time described by what it resembles instead of what it is — or when narrator cleverness recurs: wry labels ("sorted into the drawer marked harmless"), self-correcting reframes ("It was not a door. It was a verdict."), hedged precision, or knowing asides. Stacked similes, abstract nouns doing concrete work ("the architecture of her grief") and long introspective passages count too. One or two such phrases in a chapter are fine; a recurring habit is not. The task may include a "## READABILITY EVIDENCE" block: deterministic measurements, the limits of the default that the draft crosses, and flagged sentences. Use it as evidence, not as a verdict — a crossed limit is not a failure by itself and a clean block does not clear ornate diction. The writing style in the context is the default followed by the project additions, and those additions win: prose they ask for (long sentences, a lyrical voice, dense description) is compliant however the evidence reads. Each issue quotes one offending sentence verbatim and says how to make it plain; list at most five, and leave issues empty when compliant. Readability does not change the continuity verdict; report it only in readabilityCompliance.\n\nRespond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n{"verdict": "consistent" or "contradiction", "findings": [{"severity": "hard" or "soft", "text": "..."}], "endingCompliance": {"compliant": true/false, "issues": ["..."]} (only when a contract was provided), "knowledgeCompliance": {"compliant": true/false, "issues": ["..."]} (only when a forbidden list was provided), "briefCompliance": {"compliant": true/false, "issues": ["..."]} (always), "readabilityCompliance": {"compliant": true/false, "issues": ["..."]} (always)}';

const fewShots = [
  new HumanMessage('Canon: Li Wei cannot fly. Draft chapter has Li Wei jumping across rooftops but not flying. Findings?'),
  new AIMessage(
    JSON.stringify({
      verdict: 'consistent',
      findings: [{ severity: 'soft', text: 'Jumping distance across rooftops is at the edge of established ability but not a direct contradiction.' }],
      readabilityCompliance: { compliant: true, issues: [] },
    }),
  ),
  new HumanMessage('Canon: Iron Covenant controls the northern ports. Draft chapter has Li Wei meeting Iron Covenant agents at a southern port market. Findings?'),
  new AIMessage(
    JSON.stringify({
      verdict: 'contradiction',
      findings: [
        {
          severity: 'hard',
          text: 'Iron Covenant is established to control northern ports only (Chapter 3); their presence at a southern port market contradicts this unless the draft explicitly explains their expansion.',
        },
      ],
      readabilityCompliance: { compliant: true, issues: [] },
    }),
  ),
  new HumanMessage(
    'Canon: consistent draft. ## BRIEF: objective "Li Wei bribes the harbormaster for the manifest"; events: he reaches the harbor office, he offers the bribe, he reads the manifest. Draft has Li Wei reach the office and argue with a clerk, then cut to the next morning with the manifest already in hand. Findings?',
  ),
  new AIMessage(
    JSON.stringify({
      verdict: 'consistent',
      findings: [],
      briefCompliance: {
        compliant: false,
        issues: ['the bribe is never dramatized — the draft cuts away and resumes after it', 'reading the manifest happens off-page; its contents are never shown'],
      },
      readabilityCompliance: { compliant: true, issues: [] },
    }),
  ),
  new HumanMessage(
    'Canon: consistent draft; brief delivered. The sentences are short, and the narration throughout reads like: "Arlen read the notice standing up. His hope was a candle in a draughty hall. The corridor held its breath. Each word had the weight of a closing door. It was not a letter. It was a verdict. His patience was an old coat, thin and borrowed." Findings?',
  ),
  new AIMessage(
    JSON.stringify({
      verdict: 'consistent',
      findings: [],
      briefCompliance: { compliant: true, issues: [] },
      readabilityCompliance: {
        compliant: false,
        issues: [
          '"His hope was a candle in a draughty hall." — metaphor for a feeling; say it: "He still hoped, a little."',
          '"The corridor held its breath." — metaphor for a place; show it: "Nobody in the corridor spoke."',
          '"Each word had the weight of a closing door." — abstract image; say what it means: "The notice was final."',
          '"It was not a letter. It was a verdict." — self-correcting reframe; state it: "The letter turned him down."',
          '"His patience was an old coat, thin and borrowed." — stacked metaphor for a feeling; say it: "He was running out of patience."',
        ],
      },
    }),
  ),
  new HumanMessage(
    'Canon: consistent draft. ## ENDING CONTRACT: hookType cliffhanger; openQuestion "who sent the assassin?"; handoffState "Li Wei cornered on the temple roof". Draft ends with Li Wei defeating the assassin, learning who sent him, and going to sleep. Findings?',
  ),
  new AIMessage(
    JSON.stringify({
      verdict: 'consistent',
      findings: [],
      endingCompliance: {
        compliant: false,
        issues: [
          'hookType: the chapter ends resolved and at rest, not on a cliffhanger',
          'openQuestion: "who sent the assassin?" is answered in the final scene',
          'handoffState: the chapter ends in bed, not cornered on the temple roof',
        ],
      },
      readabilityCompliance: { compliant: true, issues: [] },
    }),
  ),
  new HumanMessage(
    'Canon: consistent draft; brief delivered. The writing style\'s project additions say: "Lyrical, slow narration; long flowing sentences are welcome." ## READABILITY EVIDENCE: average sentence 27.4 words (limit 20); sentences over 30 words 31% (limit 10%). The prose is long-sentenced but concrete and clear. Findings?',
  ),
  new AIMessage(
    JSON.stringify({
      verdict: 'consistent',
      findings: [],
      briefCompliance: { compliant: true, issues: [] },
      readabilityCompliance: { compliant: true, issues: [] },
    }),
  ),
];

export const judgePrompt: PromptModule<JudgeOutput> = {
  key: 'judge',
  version: '2.4.0',
  kind: 'analytical',
  system,
  // The few-shots ride inside the template — they are the strongest shape signal weak local models
  // get, and a fewShots field the router never injects teaches nothing.
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ...fewShots, ['human', '{contextPack}\n\n{task}']]),
  schema: JudgeSchema,
  fewShots,
};
