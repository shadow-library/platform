import { describe, expect, it } from 'bun:test';

import { toolsForNode } from '@modules/ai/tools';
import {
  buildChatRefinePrompt,
  buildOutlinePrompt,
  chatPromptTokens,
  chatScopeInstructions,
  HUB_INSTRUCTIONS,
  HUB_PLAYBOOK,
  outlineWordTargetVars,
  PROMPT_REGISTRY,
  renderTurnRules,
} from '@modules/ai/prompts';
import { AUTHORING_STYLE, AUTHORING_STYLE_REPAIR, EDIT_BY_DELETION } from '@modules/ai/prompts/authoring-preamble';
import { generationWordTargetVars } from '@modules/ai/prompts/generation.prompt';
import {
  AppearanceDescribeSchema,
  BibleStageSchema,
  ChapterSummarizeSchema,
  type ChatRefineOutput,
  ChatRefineSchema,
  ContinuitySchema,
  EndingContractSchema,
  FixSchema,
  IllustrationComposeSchema,
  JudgeSchema,
  validateOutlineCoverage,
} from '@modules/ai/schemas';
import { parseSchema } from '@modules/ai/schemas/validate';
import { resolveWordTarget, WORD_TARGET_AIM, WORD_TARGET_MAX, WORD_TARGET_MIN } from '@modules/eval/deterministic-metrics';

const SCENE = { goal: 'g', obstacle: 'o', turn: 't', beats: ['b1', 'b2'], estimatedWords: 700 };
const SCENES = [SCENE, SCENE, SCENE];

describe('Prompt modules', () => {
  describe('AUTHORING_STYLE invariant', () => {
    // Their craft rules, POV and tense included, come from the project's editable `instructions` via the context pack.
    const CONTEXT_STYLED_KEYS = new Set(['generation', 'chapter-expand']);

    it('authoring prompts contain AUTHORING_STYLE (except the context-styled generation prompt)', () => {
      const authoring = Object.values(PROMPT_REGISTRY).filter(p => p.kind === 'authoring' && !CONTEXT_STYLED_KEYS.has(p.key));
      expect(authoring.length).toBeGreaterThan(0);
      for (const p of authoring) {
        expect(p.system).toContain('AUTHORING GUIDELINES:');
      }
    });

    it('the generation prompt does not hardcode AUTHORING_STYLE — it comes from the editable writing instructions', () => {
      expect(PROMPT_REGISTRY.generation.system).not.toContain(AUTHORING_STYLE.slice(0, 40));
    });

    it('analytical prompts do not contain AUTHORING_STYLE', () => {
      const analytical = Object.values(PROMPT_REGISTRY).filter(p => p.kind === 'analytical');
      expect(analytical.length).toBeGreaterThan(0);
      for (const p of analytical) {
        expect(p.system).not.toContain(AUTHORING_STYLE.slice(0, 40));
      }
    });

    it('fix and revision use the trimmed repair style, not the full house style', () => {
      const oldStyleBullets = ['never state emotion directly', 'compels turning the page', 'Ground every scene with concrete sensory detail'];
      for (const p of [PROMPT_REGISTRY.fix, PROMPT_REGISTRY.revision]) {
        for (const bullet of oldStyleBullets) expect(p.system).not.toContain(bullet);
        expect(p.system).toContain('Canon always wins over dramatic convenience');
      }
    });

    it('should let the writing style set point of view and tense for fix and revision, with third-person past only as the fallback', () => {
      for (const p of [PROMPT_REGISTRY.fix, PROMPT_REGISTRY.revision]) {
        expect(p.system).toContain(AUTHORING_STYLE_REPAIR);
        expect(p.system).not.toContain('- Write in third-person limited, past tense');
        expect(p.system).toContain('Keep the point of view and tense the writing style asks for; when it sets none, write in third-person limited, past tense');
      }
    });
  });

  describe('EndingContractSchema', () => {
    const base = { emotionalBeat: 'dread', openQuestion: 'who?', handoffState: 'cornered on the roof' };

    it('accepts the tension-shaped hook types', () => {
      for (const hookType of ['cliffhanger', 'revelation', 'quiet_dread', 'promise', 'turn']) {
        expect(parseSchema(EndingContractSchema, { ...base, hookType }).success).toBe(true);
      }
    });

    it('accepts the closure hook types', () => {
      for (const hookType of ['closure_with_momentum', 'earned_rest']) {
        expect(parseSchema(EndingContractSchema, { ...base, hookType }).success).toBe(true);
      }
    });

    it('rejects an unknown hook type', () => {
      expect(parseSchema(EndingContractSchema, { ...base, hookType: 'happy_end' }).success).toBe(false);
    });
  });

  describe('JudgeSchema', () => {
    it('accepts consistent verdict with no findings', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [] }).success).toBe(true);
    });

    it('accepts contradiction verdict with hard finding', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'contradiction', findings: [{ severity: 'hard', text: 'Contradicts chapter 3.' }] }).success).toBe(true);
    });

    it('rejects contradiction verdict with no hard findings', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'contradiction', findings: [{ severity: 'soft', text: 'Minor issue.' }] }).success).toBe(false);
    });
  });

  describe('FixSchema', () => {
    it('accepts valid patch', () => {
      expect(parseSchema(FixSchema, { action: 'patch', patches: [{ find: 'old text', replace: 'new text' }] }).success).toBe(true);
    });

    it('rejects patch with no patches', () => {
      expect(parseSchema(FixSchema, { action: 'patch', patches: [] }).success).toBe(false);
    });

    it('accepts rewrite with body', () => {
      expect(parseSchema(FixSchema, { action: 'rewrite', body: 'Full replacement chapter prose.' }).success).toBe(true);
    });
  });

  describe('BibleStageSchema (characters stage)', () => {
    it('parses an entity with a full body card and stage-level facts with terms', () => {
      const output = {
        body: 'Characters bible prose...',
        entities: [
          {
            entityKey: 'amara',
            name: 'Detective Amara',
            type: 'character',
            significance: 'major',
            notes: 'Short blurb.',
            body: 'Full entity card: voice, motivations, relationships, backstory beats.',
          },
        ],
        facts: [
          {
            factKey: 'amara_secret_past',
            text: 'Amara was once the forger the ledger investigation targets.',
            subjects: ['amara'],
            constraintNote: 'Narration must not state Amara forged documents before the reveal chapter.',
            terms: ['forger', 'forged the ledger'],
            revealChapter: 12,
          },
        ],
      };
      const parsed = parseSchema(BibleStageSchema, output);
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      expect((parsed.data as typeof output).entities?.[0]?.body).toBe(output.entities[0]!.body);
      expect((parsed.data as typeof output).facts?.[0]?.terms).toEqual(['forger', 'forged the ledger']);
    });

    it('accepts entities and facts as optional, so other stages with neither still parse', () => {
      const parsed = parseSchema(BibleStageSchema, { body: 'Foundation prose only.' });
      expect(parsed.success).toBe(true);
    });
  });

  describe('refinement prompt modules', () => {
    it('renders chat-refine in cache order: system, stable scope context, history, volatile tail', async () => {
      const messages = await PROMPT_REGISTRY['chat-refine'].template.formatMessages({
        scopeInstructions: HUB_PLAYBOOK.guidance,
        stableContext: 'STABLE-CANON-BLOCK',
        history: [],
        volatileContext: 'VOLATILE-DELTA',
        turnRules: 'TURN-RULES',
        userMessage: 'raise the stakes',
      });
      expect(messages).toHaveLength(3);
      expect(messages[0]?.getType()).toBe('system');
      expect(String(messages[1]?.content)).toContain('STABLE-CANON-BLOCK');
      expect(String(messages[1]?.content)).toContain(HUB_PLAYBOOK.guidance.slice(0, 40));
      expect(String(messages[2]?.content)).toContain('VOLATILE-DELTA');
      expect(String(messages[2]?.content)).toContain('TURN-RULES');
      expect(String(messages[2]?.content)).toContain('raise the stakes');
    });

    it('should tell every prompt that edits canon, plans, briefs or prose to remove by deleting', () => {
      for (const key of ['chat-refine', 'premise-enhance', 'bible-audit', 'outline', 'fix', 'revision'] as const) {
        expect(PROMPT_REGISTRY[key].system).toContain(EDIT_BY_DELETION);
      }
    });

    it('should advise against a prose op unless the author turned on Edit prose', () => {
      const output = {
        reply: 'done',
        changeSet: [
          { op: 'brief.update', chapter: 3, body: 'x' },
          { op: 'draft.update', chapter: 3, body: 'y' },
        ],
      };
      const planTurn = buildChatRefinePrompt('project', { proseEdits: false });
      expect(planTurn.advise?.(output as never)).toHaveLength(1);
      expect(planTurn.postValidate?.(output as never)).toEqual([]);
      expect(planTurn.advise?.({ reply: 'checking', lookups: [{ tool: 'get_draft', args: {} }] } as never)).toEqual([]);
      expect(buildChatRefinePrompt('project', { proseEdits: true }).advise?.(output as never)).toEqual([]);
      expect(renderTurnRules({ proseEdits: false })).toStartWith('Prose edits: OFF');
      expect(renderTurnRules({ proseEdits: true })).toStartWith('Prose edits: ON');
      expect(buildChatRefinePrompt('project').advise?.(output as never)).toHaveLength(1);
    });

    it('should reject an op the playbook does not carry, whatever the scope', () => {
      const scoped = buildChatRefinePrompt('brief');
      const offScope = { reply: 'done', changeSet: [{ op: 'nonsense.update', chapter: 3 }] };
      expect(scoped.postValidate?.(offScope as never)[0]).toMatch(/unknown op/);
      const onScope = { reply: 'done', changeSet: [{ op: 'brief.update', chapter: 3, title: 'sharper' }] };
      expect(scoped.postValidate?.(onScope as never)).toEqual([]);
      expect(scoped.postValidate?.({ reply: 'just talking' } as never)).toEqual([]);
    });

    it('gates lookups to the hub scope and keeps them exclusive of change-sets', () => {
      const lookups = [{ tool: 'search_lore', args: { query: 'x' } }];
      const scoped = buildChatRefinePrompt('volume');
      expect(scoped.postValidate?.({ reply: 'checking', lookups } as never)[0]).toMatch(/not available for this scope/);

      const hub = buildChatRefinePrompt('project');
      expect(hub.postValidate?.({ reply: 'checking', lookups } as never)).toEqual([]);
      expect(hub.postValidate?.({ reply: 'both', lookups, changeSet: [{ op: 'premise.update', premise: 'x' }] } as never)[0]).toMatch(/never both/);
      expect(hub.postValidate?.({ reply: 'acting', changeSet: [{ op: 'action.audit_bible' }] } as never)).toEqual([]);
    });

    it('renders the epistemic authoring vocabulary into the scopes that own it', () => {
      const hub = HUB_INSTRUCTIONS;
      expect(hub).toContain('"op": "fact.upsert"');
      expect(hub).toContain('"op": "fact.remove"');
      expect(hub).toContain('the reveal schedule IS the plot');
      expect(hub).toContain('"pov": <non-empty array of entity keys>');
      expect(hub).toContain('knowledgeContract');
    });

    it('binds the read-before-overwrite rule on every record-overwriting op', () => {
      const hub = HUB_INSTRUCTIONS;
      expect(hub).toContain("Your context is the novel's durable state, not its text");
      for (const op of ['bible_document.upsert', 'volume.upsert', 'brief.update', 'draft.update']) expect(hub).toContain(op);
      for (const tool of ['get_bible_document', 'get_volume', 'get_brief', 'get_draft']) expect(hub).toContain(tool);
      expect(hub).not.toContain('arc.upsert');
      expect(hub).not.toContain('get_arc');
      expect(hub).toContain('Lookups and a changeSet never share a response');
    });

    it('should give the chat turn and the context preview one playbook, lookup vocabulary included', () => {
      const instructions = chatScopeInstructions(toolsForNode('chat-hub'));
      expect(instructions).toStartWith(HUB_INSTRUCTIONS);
      expect(instructions).toContain('- get_notes (args: from, part, query)');
      expect(instructions).toContain('- get_canon_facts (args: keys)');
      expect(chatPromptTokens(instructions)).toBeGreaterThan(chatPromptTokens(HUB_INSTRUCTIONS));
    });

    it('should guide AI-assisted writing, a hand-writer’s review or audit, and plain discussion', () => {
      const hub = HUB_INSTRUCTIONS;
      expect(PROMPT_REGISTRY['chat-refine'].version).toBe('2.11.0');
      expect(hub).toContain('Writing with you:');
      expect(hub).toContain('Writing by hand:');
      expect(hub).toContain('fetch before you critique');
      for (const tool of ['get_draft', 'get_canon_facts', 'get_notes']) expect(hub).toContain(tool);
      expect(hub).toContain('Discussing:');
      expect(hub).toContain("accept 'undecided for now'");
      expect(hub).toContain('ending is PLANNER-ONLY');
      expect(hub).toContain('outrank every summary');
      expect(hub).toContain('raise it as a `question` card');
    });

    it('should accept epistemic ops on every scope, since they all share the hub playbook', () => {
      const changeSet = [
        { op: 'fact.upsert', factKey: 'mentor_is_the_traitor', body: 'the mentor sold the sect out', terms: ['sect seal'] },
        { op: 'brief.update', chapter: 41, knowledgeContract: { pov: ['hero'], learns: [{ entityKey: 'hero', factKey: 'mentor_is_the_traitor' }] } },
      ];
      expect(buildChatRefinePrompt('project').postValidate?.({ reply: 'staged the reveal', changeSet } as never)).toEqual([]);
      expect(buildChatRefinePrompt('brief').postValidate?.({ reply: 'x', changeSet } as never)).toEqual([]);
    });

    it('validates chat-refine output shape', () => {
      expect(parseSchema(ChatRefineSchema, { reply: 'thoughts on pacing' }).success).toBe(true);
      expect(parseSchema(ChatRefineSchema, { changeSet: [] }).success).toBe(false);
    });

    it('accepts a question card, well-formed or not — sanitizeChatQuestion is what drops a bad one', () => {
      const wellFormed = {
        reply: 'Who should oppose Mira?',
        question: {
          question: 'Who opposes Mira?',
          why: 'the reader needs someone to root against',
          answers: [
            { title: 'A rival guild', tradeOff: 'crowds out the court politics', recommended: true },
            { title: 'A corrupt council', why: 'raises the stakes citywide' },
          ],
          progressKey: 'opposition',
        },
      };
      expect(parseSchema(ChatRefineSchema, wellFormed).success).toBe(true);

      // Only one answer, no question text, an unknown progressKey — every one of these would fail
      // ajv validation if the fields were strict, taking a perfectly good reply down with it.
      const malformed = { reply: 'still thinking', question: { answers: [{ title: 'only one' }], progressKey: 'not-a-real-key' } };
      expect(parseSchema(ChatRefineSchema, malformed).success).toBe(true);
    });

    it('never lets a mistyped question fail the whole turn — reply and changeSet still parse', () => {
      const changeSet = [{ op: 'premise.update', premise: 'x' }];
      const shapes = [
        null,
        'just a string, not a card',
        { question: 'x', answers: 'not an array' },
        { question: 'x', answers: [{ title: 'a', recommended: 'yes' }] },
        { why: 123 },
      ];
      for (const question of shapes) {
        const result = parseSchema<ChatRefineOutput>(ChatRefineSchema, { reply: 'here is the plan', changeSet, question });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.reply).toBe('here is the plan');
          expect(result.data.changeSet).toEqual(changeSet);
        }
      }
    });
  });

  describe('outline prompt invariants', () => {
    const brief = (chapter: number, overrides: Partial<{ continuesIntoNextChapter: boolean; startsFromPreviousChapter: boolean }> = {}) => ({
      chapter,
      volumeKey: 'vol_01',
      title: 't',
      objective: 'o',
      scenes: SCENES,
      requiredContext: [],
      endingContract: { hookType: 'cliffhanger' as const, emotionalBeat: 'b', openQuestion: 'q', handoffState: 'h', mustNotResolve: [] },
      chapterPurpose: 'p',
      readerValue: ['new_information' as const],
      continuesIntoNextChapter: false,
      startsFromPreviousChapter: false,
      ...overrides,
    });

    it('accepts a contiguous outline covering the exact span with no chaining', () => {
      expect(validateOutlineCoverage([brief(5), brief(6), brief(7)], 5, 7)).toEqual([]);
    });

    it('rejects outlines with coverage gaps', () => {
      const errors = validateOutlineCoverage([brief(5), brief(7)], 5, 7);
      expect(errors).toContain('chapter 6 is missing from the outline');
    });

    it('rejects chapters outside the requested span', () => {
      const errors = validateOutlineCoverage([brief(5), brief(6), brief(8)], 5, 7);
      expect(errors.some(e => e.includes('chapter 8 is outside the requested span'))).toBe(true);
      expect(errors).toContain('chapter 7 is missing from the outline');
    });

    it('rejects duplicate chapter numbers', () => {
      const errors = validateOutlineCoverage([brief(5), brief(6), brief(6)], 5, 6);
      expect(errors).toContain('chapter 6 appears more than once in the outline');
    });

    it('rejects a continuesIntoNextChapter/startsFromPreviousChapter chain that does not match up', () => {
      const missingHandoff = validateOutlineCoverage([brief(5, { continuesIntoNextChapter: true }), brief(6)], 5, 6);
      expect(missingHandoff.some(e => e.includes('chapter 5 sets continuesIntoNextChapter'))).toBe(true);

      const unclaimedStart = validateOutlineCoverage([brief(5), brief(6, { startsFromPreviousChapter: true })], 5, 6);
      expect(unclaimedStart.some(e => e.includes('chapter 6 sets startsFromPreviousChapter'))).toBe(true);

      const chained = validateOutlineCoverage([brief(5, { continuesIntoNextChapter: true }), brief(6, { startsFromPreviousChapter: true })], 5, 6);
      expect(chained).toEqual([]);
    });

    it('buildOutlinePrompt closes over the requested span for postValidate', () => {
      const prompt = buildOutlinePrompt(10, 12, resolveWordTarget());
      expect(prompt.key).toBe('outline');
      expect(prompt.postValidate?.([brief(10), brief(11), brief(12)])).toEqual([]);
      expect(prompt.postValidate?.([brief(10), brief(12)])[0]).toContain('chapter 11 is missing');
    });

    it('should skip the density rules when no word target is given', () => {
      expect(validateOutlineCoverage([brief(5, { scenes: [SCENE] } as never)], 5, 5)).toEqual([]);
    });

    it('should reject a brief with fewer scenes than the target needs', () => {
      const errors = validateOutlineCoverage(
        [
          brief(5, {
            scenes: [
              { ...SCENE, estimatedWords: 1000 },
              { ...SCENE, estimatedWords: 1000 },
            ],
          } as never),
        ],
        5,
        5,
        resolveWordTarget(),
      );
      expect(errors).toEqual([expect.stringContaining('chapter 5 plans 2 scene(s); a 1800–2600 word chapter needs at least 3')]);
    });

    it('should reject scenes whose estimates fall outside the target band', () => {
      const thin = validateOutlineCoverage([brief(5, { scenes: SCENES.map(scene => ({ ...scene, estimatedWords: 300 })) } as never)], 5, 5, resolveWordTarget());
      const bloated = validateOutlineCoverage([brief(5, { scenes: SCENES.map(scene => ({ ...scene, estimatedWords: 1200 })) } as never)], 5, 5, resolveWordTarget());
      expect(thin).toEqual([expect.stringContaining('estimated at 900 words, under the 1800-word floor')]);
      expect(bloated).toEqual([expect.stringContaining('estimated at 3600 words, over the 2600-word ceiling')]);
    });

    it('should exempt a brief that declares a densityRisk from the density rules', () => {
      const thin = brief(5, { scenes: [SCENE], densityRisk: 'only one confrontation is planned here; merge with chapter 6' } as never);
      expect(validateOutlineCoverage([thin], 5, 5, resolveWordTarget())).toEqual([]);
    });

    it('should scale the scene floor with a project word target override', () => {
      const target = resolveWordTarget({ wordTargetMin: 3500, wordTargetMax: 4500 });
      expect(outlineWordTargetVars(target)).toEqual({ wordTargetMin: '3,500', wordTargetAim: '4,000', wordTargetMax: '4,500', minScenes: '5' });
      expect(outlineWordTargetVars(resolveWordTarget()).minScenes).toBe('3');
    });

    it('should put the length target in the outline request', async () => {
      const vars = { catalog: 'C', volumePlan: 'V', startChapter: 1, endChapter: 3, extraContext: '', ...outlineWordTargetVars(resolveWordTarget()) };
      const messages = await PROMPT_REGISTRY.outline.template.formatMessages(vars);
      expect(String(messages.at(-1)?.content)).toContain('Length target: 1,800–2,600 words of scene prose per chapter, aiming for about 2,200 — at least 3 scenes each.');
    });

    it('rejects a readerValue entry outside the fixed enum', () => {
      const errors = validateOutlineCoverage([brief(5, { readerValue: ['not_a_real_value'] } as never), brief(6)], 5, 6);
      expect(errors.some(e => e.includes("readerValue 'not_a_real_value' is not one of"))).toBe(true);
    });
  });

  describe('ending contract (v2 bumps)', () => {
    it('outline v2 requires an ending contract per brief', () => {
      const brief = { chapter: 1, volumeKey: 'v1', title: 'T', objective: 'obj', scenes: SCENES, requiredContext: [] };
      expect(parseSchema(PROMPT_REGISTRY.outline.schema, [brief]).success).toBe(false);
      const withContract = {
        ...brief,
        endingContract: { hookType: 'cliffhanger', emotionalBeat: 'dread', openQuestion: 'who?', handoffState: 'cornered on the roof' },
        chapterPurpose: 'p',
        readerValue: ['emotional_turn'],
      };
      expect(parseSchema(PROMPT_REGISTRY.outline.schema, [withContract]).success).toBe(true);
    });

    it('judge v2 accepts endingCompliance and keeps it optional', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [] }).success).toBe(true);
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [], endingCompliance: { compliant: false, issues: ['hookType missed'] } }).success).toBe(true);
    });

    it('generation v2 renders the ending contract in the volatile tail', async () => {
      const messages = await PROMPT_REGISTRY.generation.template.formatMessages({
        stableContext: 'STABLE-PACK',
        volatileContext: 'VOLATILE-PACK',
        chapterBrief: 'BRIEF',
        endingContract: 'Hook type: cliffhanger',
        guidance: '',
        ...generationWordTargetVars(resolveWordTarget()),
      });
      expect(String(messages[messages.length - 1]?.content)).toContain('## ENDING CONTRACT\nHook type: cliffhanger');
    });

    it('renders generation in cache order: system, stable pack alone, volatile pack + brief tail', async () => {
      expect(PROMPT_REGISTRY.generation.cacheStrategy?.stableVars).toEqual(['stableContext']);
      const messages = await PROMPT_REGISTRY.generation.template.formatMessages({
        stableContext: 'STABLE-PACK',
        volatileContext: 'VOLATILE-PACK',
        chapterBrief: 'BRIEF',
        endingContract: 'none',
        guidance: 'GUIDANCE',
        ...generationWordTargetVars(resolveWordTarget()),
      });
      expect(messages).toHaveLength(3);
      expect(messages[0]?.getType()).toBe('system');
      expect(String(messages[1]?.content)).toBe('STABLE-PACK');
      expect(String(messages[1]?.content)).not.toContain('VOLATILE-PACK');
      expect(String(messages[2]?.content)).toContain('VOLATILE-PACK');
      expect(String(messages[2]?.content)).toContain('BRIEF');
      expect(String(messages[2]?.content)).toContain('GUIDANCE');
    });
  });

  describe('chapter length', () => {
    const words = (count: number): string => count.toLocaleString('en-US');

    it('should state a concrete floor, aim and ceiling in the rendered generation prompt, sourced from the resolved word target', async () => {
      const messages = await PROMPT_REGISTRY.generation.template.formatMessages({
        stableContext: '',
        volatileContext: '',
        chapterBrief: '',
        endingContract: '',
        guidance: '',
        ...generationWordTargetVars(resolveWordTarget()),
      });
      const system = String(messages[0]?.content);
      expect(system).toContain(`at least ${words(WORD_TARGET_MIN)} words`);
      expect(system).toContain(`about ${words(WORD_TARGET_AIM)}`);
      expect(system).toContain(words(WORD_TARGET_MAX));
      expect(system).not.toContain('not a hard wall');
    });

    it('should render an overridden project word target in the same sentence position', async () => {
      const target = resolveWordTarget({ wordTargetMin: 2000, wordTargetMax: 3500 });
      expect(target.aim).toBe(2750);
      const messages = await PROMPT_REGISTRY.generation.template.formatMessages({
        stableContext: '',
        volatileContext: '',
        chapterBrief: '',
        endingContract: '',
        guidance: '',
        ...generationWordTargetVars(target),
      });
      const system = String(messages[0]?.content);
      expect(system).toContain(`at least ${words(2000)} words`);
      expect(system).toContain(`about ${words(2750)}`);
      expect(system).toContain(`staying under ${words(3500)}`);
      expect(system).not.toContain(words(WORD_TARGET_MIN));
      expect(system).not.toContain(words(WORD_TARGET_MAX));
    });

    it('should route chapter-expand as generation and render the draft with its word targets in the volatile tail', async () => {
      const prompt = PROMPT_REGISTRY['chapter-expand'];
      expect(prompt.role).toBe('generation');
      expect(prompt.cacheStrategy?.stableVars).toEqual(['stableContext']);
      const messages = await prompt.template.formatMessages({
        stableContext: 'STABLE-PACK',
        volatileContext: 'VOLATILE-PACK',
        chapterBrief: 'BRIEF',
        endingContract: 'Hook type: cliffhanger',
        draftBody: 'DRAFT-BODY',
        draftWords: 1397,
        minWords: 1800,
        aimWords: 2200,
        missingWords: 803,
        guidance: 'REPAIR-GUIDANCE',
      });
      expect(messages).toHaveLength(3);
      expect(String(messages[1]?.content)).toBe('STABLE-PACK');
      const tail = String(messages[2]?.content);
      for (const expected of [
        'VOLATILE-PACK',
        'BRIEF',
        '## ENDING CONTRACT\nHook type: cliffhanger',
        'Current draft (1397 words):\nDRAFT-BODY',
        'Additional guidance: REPAIR-GUIDANCE',
        'at least 1800 words',
        'about 2200',
        '803 more',
      ]) {
        expect(tail).toContain(expected);
      }
    });

    it('should leave point of view and tense to the project instructions in chapter-expand', () => {
      expect(PROMPT_REGISTRY['chapter-expand'].system).not.toContain('third-person limited');
      expect(PROMPT_REGISTRY['chapter-expand'].system).not.toContain(AUTHORING_STYLE.slice(0, 40));
    });
  });

  describe('knowledge contract (generation/judge v2.2)', () => {
    it('judge schema accepts knowledgeCompliance and keeps it optional', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [] }).success).toBe(true);
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [], knowledgeCompliance: { compliant: false, issues: ['[ledger_forgery] leaked'] } }).success).toBe(true);
    });

    it('outline schema accepts a brief with a knowledgeContract and keeps it optional', () => {
      const brief = {
        chapter: 1,
        volumeKey: 'vol_01',
        title: 't',
        objective: 'o',
        scenes: SCENES,
        requiredContext: [],
        pov: 'amara',
        endingContract: { hookType: 'cliffhanger', emotionalBeat: 'b', openQuestion: 'q', handoffState: 'h', mustNotResolve: [] },
        chapterPurpose: 'Amara confirms the forger is inside the archive.',
        readerValue: ['new_information'],
      };
      expect(parseSchema(PROMPT_REGISTRY.outline.schema, [brief]).success).toBe(true);
      const withContract = { ...brief, knowledgeContract: { pov: ['amara', 'rook'], learns: [{ entityKey: 'amara', factKey: 'the_heir' }] } };
      expect(parseSchema(PROMPT_REGISTRY.outline.schema, [withContract]).success).toBe(true);
      expect(parseSchema(PROMPT_REGISTRY.outline.schema, [{ ...brief, knowledgeContract: { pov: [] } }]).success).toBe(false);
    });
  });

  describe('reader value and purpose (outline v2.3)', () => {
    const baseBrief = {
      chapter: 1,
      volumeKey: 'vol_01',
      title: 't',
      objective: 'o',
      scenes: SCENES,
      requiredContext: [],
      endingContract: { hookType: 'cliffhanger', emotionalBeat: 'b', openQuestion: 'q', handoffState: 'h', mustNotResolve: [] },
    };

    it('outline schema requires chapterPurpose and at least one readerValue entry', () => {
      expect(parseSchema(PROMPT_REGISTRY.outline.schema, [baseBrief]).success).toBe(false);
      expect(parseSchema(PROMPT_REGISTRY.outline.schema, [{ ...baseBrief, chapterPurpose: 'p', readerValue: [] }]).success).toBe(false);
      expect(parseSchema(PROMPT_REGISTRY.outline.schema, [{ ...baseBrief, chapterPurpose: 'p', readerValue: ['emotional_turn'] }]).success).toBe(true);
    });

    it('readerValue enum membership is enforced by postValidate, not the JSON schema itself', () => {
      // class-schema has no declarative "array of EnumType" field — schema-level, any non-empty string
      // array satisfies readerValue; membership in the fixed set is checked by validateOutlineCoverage.
      expect(parseSchema(PROMPT_REGISTRY.outline.schema, [{ ...baseBrief, chapterPurpose: 'p', readerValue: ['not_a_real_value'] }]).success).toBe(true);
    });

    it('outline schema accepts optional repetitionRisks', () => {
      const brief = { ...baseBrief, chapterPurpose: 'p', readerValue: ['world_state_change'], repetitionRisks: ['another tavern negotiation'] };
      expect(parseSchema(PROMPT_REGISTRY.outline.schema, [brief]).success).toBe(true);
    });
  });

  describe('brief fulfillment (judge v2.3, harness §11 item 7)', () => {
    it('judge schema accepts briefCompliance and keeps it optional', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [] }).success).toBe(true);
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [], briefCompliance: { compliant: false, issues: ['the bribe never happens on-page'] } }).success).toBe(
        true,
      );
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [], briefCompliance: { compliant: false } }).success).toBe(false);
    });
  });

  describe('readability (judge v2.4, fix v1.3)', () => {
    it('should show readabilityCompliance in every judge few-shot answer', () => {
      const answers = (PROMPT_REGISTRY.judge.fewShots ?? []).filter(message => message.getType() === 'ai');
      expect(answers.length).toBeGreaterThan(0);
      for (const answer of answers) expect(JSON.parse(String(answer.content))).toHaveProperty('readabilityCompliance');
      expect(PROMPT_REGISTRY.judge.system).toContain('"readabilityCompliance": {"compliant": true/false, "issues": ["..."]} (always)');
    });

    it('should keep readabilityCompliance optional in the judge schema and require its issues when present', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [] }).success).toBe(true);
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [], readabilityCompliance: { compliant: false, issues: ['"x" — say it plainly'] } }).success).toBe(true);
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [], readabilityCompliance: { compliant: false } }).success).toBe(false);
    });
  });

  describe('ContinuitySchema (P1-05 characterStates/knowledgeChanges)', () => {
    const base = {
      appeared: ['amara'],
      newEntities: [],
      threads: [],
      mysteries: [],
      timeline: [],
      relationships: [],
      power: [],
      characterStates: [],
      knowledgeChanges: [],
      chapterSummary: 'Amara confronts the forger in the archive.',
    };

    it('parses a payload with characterStates and knowledgeChanges entries', () => {
      const output = {
        ...base,
        characterStates: [
          {
            entityKey: 'amara',
            location: 'the city archive',
            conditions: ['exhausted', 'wary'],
            immediateGoal: 'confront the forger',
            statusNote: 'closing in on the ledger',
            evidence: 'Amara pressed her palm to the cold archive door, exhaustion dragging at her eyes.',
          },
        ],
        knowledgeChanges: [{ entityKey: 'amara', factKey: 'amara_secret_past', how: 'read it in the archive ledger' }],
      };
      expect(parseSchema(ContinuitySchema, output).success).toBe(true);
    });

    it('rejects a characterStates entry missing the required evidence field', () => {
      const output = {
        ...base,
        characterStates: [{ entityKey: 'amara', location: 'the city archive' }],
      };
      expect(parseSchema(ContinuitySchema, output).success).toBe(false);
    });

    it('rejects a relationships entry missing the required evidence field', () => {
      const output = {
        ...base,
        relationships: [{ entityKey: 'amara', targetKey: 'rook', kind: 'rival' }],
      };
      expect(parseSchema(ContinuitySchema, output).success).toBe(false);
    });

    it('parses a payload carrying confidence markers on threads, mysteries, relationships and characterStates', () => {
      const output = {
        ...base,
        threads: [{ threadKey: 'the_ledger', status: 'open', confidence: 'low' }],
        mysteries: [{ mysteryKey: 'missing_heir', status: 'open', question: 'Who is the heir?', confidence: 'high' }],
        relationships: [{ entityKey: 'amara', targetKey: 'rook', kind: 'rival', evidence: 'they traded threats', confidence: 'low' }],
        characterStates: [{ entityKey: 'amara', location: 'the city archive', evidence: 'she pressed the archive door', confidence: 'high' }],
      };
      expect(parseSchema(ContinuitySchema, output).success).toBe(true);
    });

    it('rejects a confidence value outside the high/low vocabulary', () => {
      const output = {
        ...base,
        threads: [{ threadKey: 'the_ledger', status: 'open', confidence: 'maybe' }],
      };
      expect(parseSchema(ContinuitySchema, output).success).toBe(false);
    });

    it('accepts empty characterStates and knowledgeChanges arrays as the nothing-to-report case', () => {
      expect(parseSchema(ContinuitySchema, base).success).toBe(true);
    });

    it('carries an optional mystery truthFactKey pointing at a canon fact', () => {
      const mystery = { mysteryKey: 'the_heir_mystery', status: 'open' as const };
      expect(parseSchema(ContinuitySchema, { ...base, mysteries: [mystery] }).success).toBe(true);
      expect(parseSchema(ContinuitySchema, { ...base, mysteries: [{ ...mystery, truthFactKey: 'the_heir' }] }).success).toBe(true);
    });

    it('rejects a payload missing characterStates or knowledgeChanges, matching the existing required-array convention', () => {
      const { characterStates: _characterStates, ...withoutCharacterStates } = base;
      expect(parseSchema(ContinuitySchema, withoutCharacterStates).success).toBe(false);

      const { knowledgeChanges: _knowledgeChanges, ...withoutKnowledgeChanges } = base;
      expect(parseSchema(ContinuitySchema, withoutKnowledgeChanges).success).toBe(false);
    });
  });

  describe('illustration-compose', () => {
    it('renders the pack first and the ordered author instructions last', async () => {
      const messages = await PROMPT_REGISTRY['illustration-compose'].template.formatMessages({
        contextPack: 'SUBJECT-CANON-BLOCK',
        subjectType: 'entity',
        subjectLabel: 'hero',
        references: 'Reference 1 — likeness — portrait of Evan Vale',
        instructions: '1. in falling snow',
      });
      expect(messages).toHaveLength(3);
      expect(messages[0]?.getType()).toBe('system');
      expect(String(messages[1]?.content)).toBe('SUBJECT-CANON-BLOCK');
      expect(String(messages[2]?.content)).toContain('Subject type: entity');
      expect(String(messages[2]?.content)).toContain('1. in falling snow');
      expect(String(messages[2]?.content).indexOf('Reference 1 — likeness')).toBeLessThan(String(messages[2]?.content).indexOf('1. in falling snow'));
    });

    it('accepts a composed spec without a negative prompt and rejects a too-thin base prompt', () => {
      const base = { basePrompt: 'a lone swordsman on a frozen ridge, backlit', subjectFraming: 'half-body portrait', styleNotes: 'ink wash, muted palette' };
      expect(parseSchema(IllustrationComposeSchema, base).success).toBe(true);
      expect(parseSchema(IllustrationComposeSchema, { ...base, negativePrompt: 'text, watermark' }).success).toBe(true);
      expect(parseSchema(IllustrationComposeSchema, { ...base, basePrompt: 'a man' }).success).toBe(false);
    });
  });

  describe('appearance-describe', () => {
    const prompt = PROMPT_REGISTRY['appearance-describe'];
    const appearance = 'A broad-shouldered man in dented plate armour, close-cropped grey hair, a pale scar across the left brow.';

    it('should render the subject and the note into a single human message', async () => {
      const messages = await prompt.template.formatMessages({ subjectLabel: 'Aldric', note: 'the armored man in the center' });
      expect(messages).toHaveLength(2);
      expect(messages[0]?.getType()).toBe('system');
      expect(String(messages[1]?.content)).toContain('Subject: Aldric');
      expect(String(messages[1]?.content)).toContain('the armored man in the center');
    });

    it('should accept a described subject with an optional ambiguity note', () => {
      expect(parseSchema(AppearanceDescribeSchema, { appearance, confidence: 'high' }).success).toBe(true);
      expect(parseSchema(AppearanceDescribeSchema, { appearance, confidence: 'low', ambiguity: 'two armoured figures; chose the one in front' }).success).toBe(true);
    });

    it('should reject a too-thin or unbounded appearance and an unknown confidence level', () => {
      expect(parseSchema(AppearanceDescribeSchema, { appearance: 'a man', confidence: 'high' }).success).toBe(false);
      expect(parseSchema(AppearanceDescribeSchema, { appearance: 'x'.repeat(1201), confidence: 'high' }).success).toBe(false);
      expect(parseSchema(AppearanceDescribeSchema, { appearance, confidence: 'certain' }).success).toBe(false);
      expect(parseSchema(AppearanceDescribeSchema, { appearance }).success).toBe(false);
    });
  });

  describe('chapter-summarize prompt module', () => {
    it('renders the chapter prose into the human message', async () => {
      const messages = await PROMPT_REGISTRY['chapter-summarize'].template.formatMessages({ chapterProse: 'SOURCE-PROSE-TEXT' });
      expect(messages).toHaveLength(2);
      expect(messages[0]?.getType()).toBe('system');
      expect(String(messages[1]?.content)).toContain('SOURCE-PROSE-TEXT');
    });

    it('requires a summary and a state object', () => {
      expect(parseSchema(ChapterSummarizeSchema, { summary: 'Ash fled the tower.', state: { lastBeat: 'Ash jumps' } }).success).toBe(true);
      expect(parseSchema(ChapterSummarizeSchema, { summary: '', state: {} }).success).toBe(false);
      expect(parseSchema(ChapterSummarizeSchema, { state: {} }).success).toBe(false);
    });

    it('should accept established facts in the continuation state and ask for them', () => {
      const state = { lastBeat: 'Ash jumps', establishedFacts: ['The bell tower has 212 steps', 'Ash carries the copper key'] };
      expect(parseSchema(ChapterSummarizeSchema, { summary: 'Ash fled the tower.', state }).success).toBe(true);
      expect(parseSchema(ChapterSummarizeSchema, { summary: 'Ash fled the tower.', state: { establishedFacts: 'not a list' } }).success).toBe(false);
      expect(PROMPT_REGISTRY['chapter-summarize'].system).toContain('establishedFacts');
    });
  });
});
