import { describe, expect, it } from 'bun:test';

import {
  buildChatRefinePrompt,
  buildOutlinePrompt,
  PROMPT_REGISTRY,
  renderReforgeFidelityGuidance,
  renderReforgeFidelityRule,
  renderScopeInstructions,
  SCOPE_PLAYBOOKS,
} from '@modules/ai/prompts';
import { AUTHORING_STYLE } from '@modules/ai/prompts/authoring-preamble';
import {
  BibleStageSchema,
  ChatRefineSchema,
  ContinuitySchema,
  EndingContractSchema,
  ExtractionSchema,
  FixSchema,
  JudgeSchema,
  PlanSchema,
  RebrandAuditSchema,
  RebrandConvertSchema,
  ReforgeJudgeSchema,
  ReforgeOutlineSchema,
  ReforgeWriteSchema,
  validateArcCoverage,
  validateOutlineCoverage,
  validatePlanContiguity,
} from '@modules/ai/schemas';
import { parseSchema } from '@modules/ai/schemas/validate';
import { reforgeFidelity } from '@server/database/schemas';

describe('Prompt modules', () => {
  describe('AUTHORING_STYLE invariant', () => {
    // `generation` is the exception: its chapter-writing craft rules are author-configurable, so they
    // arrive at runtime via the project's `instructions` (the context pack's `writing_style` section)
    // rather than being hardcoded into the prompt's system message.
    const CONTEXT_STYLED_KEYS = new Set(['generation']);

    it('authoring prompts contain AUTHORING_STYLE (except the context-styled generation prompt)', () => {
      const authoring = Object.values(PROMPT_REGISTRY).filter(p => p.kind === 'authoring' && !CONTEXT_STYLED_KEYS.has(p.key));
      expect(authoring.length).toBeGreaterThan(0);
      for (const p of authoring) {
        expect(p.system).toContain(AUTHORING_STYLE.slice(0, 40));
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

  describe('PlanSchema', () => {
    it('rejects non-contiguous chapter spans', () => {
      const vols = [
        { volumeKey: 'vol_1', ordinal: 1, title: 'V1', objective: 'x', conflict: 'y', payoff: 'z', startChapter: 1, endChapter: 5 },
        { volumeKey: 'vol_2', ordinal: 2, title: 'V2', objective: 'x', conflict: 'y', payoff: 'z', startChapter: 7, endChapter: 12 },
      ];
      const parsed = parseSchema(PlanSchema, vols);
      expect(parsed.success && validatePlanContiguity(parsed.data as never).length === 0).toBe(false);
    });

    it('accepts contiguous volumes', () => {
      const vols = [
        { volumeKey: 'vol_1', ordinal: 1, title: 'V1', objective: 'x', conflict: 'y', payoff: 'z', startChapter: 1, endChapter: 5 },
        { volumeKey: 'vol_2', ordinal: 2, title: 'V2', objective: 'x', conflict: 'y', payoff: 'z', startChapter: 6, endChapter: 12 },
      ];
      const parsed = parseSchema(PlanSchema, vols);
      expect(parsed.success && validatePlanContiguity(parsed.data as never).length === 0).toBe(true);
    });

    it('rejects an empty plan so the repair ladder retries instead of persisting zero volumes', () => {
      expect(validatePlanContiguity([])).toEqual(['plan must contain at least one volume']);
    });
  });

  describe('refinement prompt modules', () => {
    it('registers the five new prompt keys', () => {
      for (const key of ['bible-audit', 'chat-compact', 'arc-plan'] as const) {
        expect(PROMPT_REGISTRY[key]).toBeDefined();
        expect(PROMPT_REGISTRY[key].version).toBe('1.0.0');
      }
      // premise-enhance v1.1 reframes the enhanced premise as an enticing summary, not a plot walkthrough.
      expect(PROMPT_REGISTRY['premise-enhance'].version).toBe('1.1.0');
      // chat-refine v2 added the declared-lookup protocol (chat-hub design §6); v2.1 instructs partial
      // updates (emit only changed fields, since the apply engine merges) to cut output tokens.
      expect(PROMPT_REGISTRY['chat-refine'].version).toBe('2.1.0');
    });

    it('renders chat-refine in cache order: system, stable scope context, history, volatile tail', async () => {
      const messages = await PROMPT_REGISTRY['chat-refine'].template.formatMessages({
        scopeInstructions: SCOPE_PLAYBOOKS.volume.guidance,
        stableContext: 'STABLE-CANON-BLOCK',
        history: [],
        volatileContext: 'VOLATILE-DELTA',
        userMessage: 'raise the stakes',
      });
      expect(messages).toHaveLength(3);
      expect(messages[0]?.getType()).toBe('system');
      expect(String(messages[1]?.content)).toContain('STABLE-CANON-BLOCK');
      expect(String(messages[1]?.content)).toContain(SCOPE_PLAYBOOKS.volume.guidance.slice(0, 40));
      expect(String(messages[2]?.content)).toContain('VOLATILE-DELTA');
      expect(String(messages[2]?.content)).toContain('raise the stakes');
    });

    it('chat-refine scope factory rejects ops outside the scope allowlist', () => {
      const scoped = buildChatRefinePrompt('brief');
      const offScope = { reply: 'done', changeSet: [{ op: 'volume.upsert', volumeKey: 'v1' }] };
      expect(scoped.postValidate?.(offScope as never)[0]).toMatch(/not allowed for this scope/);
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
      const hub = renderScopeInstructions('project');
      expect(hub).toContain('"op": "fact.upsert"');
      expect(hub).toContain('"op": "fact.remove"');
      expect(hub).toContain('the reveal schedule IS the plot');
      expect(hub).toContain('"pov": <non-empty array of entity keys>');

      const brief = renderScopeInstructions('brief');
      expect(brief).toContain('knowledgeContract');
      expect(brief).toContain('a chapter that reveals nothing previously hidden carries no contract');
      expect(brief).not.toContain('"op": "fact.upsert"');

      expect(renderScopeInstructions('novel')).toContain('never in a bible document or an entity sheet');
      expect(renderScopeInstructions('volume_plan')).not.toContain('knowledgeContract');
    });

    it('accepts epistemic ops in the hub scope and rejects them elsewhere', () => {
      const hub = buildChatRefinePrompt('project');
      const changeSet = [
        { op: 'fact.upsert', factKey: 'mentor_is_the_traitor', body: 'the mentor sold the sect out', terms: ['sect seal'] },
        { op: 'brief.update', chapter: 41, knowledgeContract: { pov: ['hero'], learns: [{ entityKey: 'hero', factKey: 'mentor_is_the_traitor' }] } },
      ];
      expect(hub.postValidate?.({ reply: 'staged the reveal', changeSet } as never)).toEqual([]);
      expect(buildChatRefinePrompt('brief').postValidate?.({ reply: 'x', changeSet } as never)[0]).toMatch(/not allowed for this scope/);
    });

    it('validates chat-refine output shape', () => {
      expect(parseSchema(ChatRefineSchema, { reply: 'thoughts on pacing' }).success).toBe(true);
      expect(parseSchema(ChatRefineSchema, { changeSet: [] }).success).toBe(false);
    });

    it('arc coverage validator enforces contiguity and exact range', () => {
      const arc = (arcKey: string, chapterStart: number, chapterEnd: number) => ({
        arcKey,
        title: 't',
        objective: 'o',
        escalation: 'e',
        payoff: 'p',
        hook: 'h',
        chapterStart,
        chapterEnd,
        cast: [],
        body: 'b',
        ideas: [],
      });
      expect(validateArcCoverage([arc('a1', 1, 5), arc('a2', 6, 12)], 1, 12)).toEqual([]);
      expect(validateArcCoverage([arc('a1', 1, 5), arc('a2', 7, 12)], 1, 12)[0]).toMatch(/must start at chapter 6/);
      expect(validateArcCoverage([arc('a1', 2, 12)], 1, 12)[0]).toMatch(/must start at chapter 1/);
      expect(validateArcCoverage([arc('a1', 1, 11)], 1, 12)[0]).toMatch(/must end at chapter 12/);
    });
  });

  describe('outline prompt invariants', () => {
    const brief = (chapter: number, overrides: Partial<{ continuesIntoNextChapter: boolean; startsFromPreviousChapter: boolean }> = {}) => ({
      chapter,
      volumeKey: 'vol_01',
      title: 't',
      objective: 'o',
      events: ['e'],
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
      const prompt = buildOutlinePrompt(10, 12);
      expect(prompt.key).toBe('outline');
      expect(prompt.postValidate?.([brief(10), brief(11), brief(12)])).toEqual([]);
      expect(prompt.postValidate?.([brief(10), brief(12)])[0]).toContain('chapter 11 is missing');
    });

    it('rejects a readerValue entry outside the fixed enum', () => {
      const errors = validateOutlineCoverage([brief(5, { readerValue: ['not_a_real_value'] } as never), brief(6)], 5, 6);
      expect(errors.some(e => e.includes("readerValue 'not_a_real_value' is not one of"))).toBe(true);
    });
  });

  describe('rebrand prompt modules', () => {
    it('registers the three rebrand prompt keys with the expected roles', () => {
      for (const key of ['rebrand-glossary', 'rebrand-convert', 'rebrand-audit'] as const) expect(PROMPT_REGISTRY[key]).toBeDefined();
      expect(PROMPT_REGISTRY['rebrand-glossary'].version).toBe('1.0.0');
      expect(PROMPT_REGISTRY['rebrand-audit'].version).toBe('1.0.0');
      expect(PROMPT_REGISTRY['rebrand-convert'].version).toBe('1.1.0');
      expect(PROMPT_REGISTRY['rebrand-glossary'].role).toBe('rebrand');
      expect(PROMPT_REGISTRY['rebrand-convert'].role).toBe('rebrand');
      // The audit reuses the cacheable `audit` role so identical re-audits hit llm_cache.
      expect(PROMPT_REGISTRY['rebrand-audit'].role).toBe('audit');
    });

    it('renders rebrand-convert in cache order: system, stable pack, volatile chapter tail', async () => {
      const messages = await PROMPT_REGISTRY['rebrand-convert'].template.formatMessages({
        stableContext: 'STABLE-WORLD-NOTES',
        volatileContext: 'VOLATILE-GLOSSARY-SLICE',
        chapterProse: 'VOLATILE-CHAPTER-PROSE',
        repairNotes: 'fix the leftover name',
      });
      expect(messages).toHaveLength(3);
      expect(messages[0]?.getType()).toBe('system');
      expect(String(messages[1]?.content)).toBe('STABLE-WORLD-NOTES');
      expect(String(messages[2]?.content)).toContain('VOLATILE-GLOSSARY-SLICE');
      expect(String(messages[2]?.content)).toContain('VOLATILE-CHAPTER-PROSE');
      expect(String(messages[2]?.content)).toContain('fix the leftover name');
    });

    it('names only the stable-segment var in rebrand-convert cacheStrategy', () => {
      expect(PROMPT_REGISTRY['rebrand-convert'].cacheStrategy?.stableVars).toEqual(['stableContext']);
    });

    it('renders rebrand-glossary and rebrand-audit with their template vars', async () => {
      const glossary = await PROMPT_REGISTRY['rebrand-glossary'].template.formatMessages({ contextPack: 'OVERVIEW', openingChapters: 'CH1-EXCERPT' });
      expect(String(glossary[glossary.length - 1]?.content)).toContain('CH1-EXCERPT');

      const audit = await PROMPT_REGISTRY['rebrand-audit'].template.formatMessages({ worldNotes: 'NOTES', glossarySlice: 'SLICE', convertedProse: 'PROSE' });
      expect(String(audit[1]?.content)).toContain('SLICE');
      expect(String(audit[2]?.content)).toContain('PROSE');
    });

    it('validates rebrand-convert output shape', () => {
      const body = 'p'.repeat(120);
      expect(parseSchema(RebrandConvertSchema, { title: 'The Vale Gate', body }).success).toBe(true);
      expect(parseSchema(RebrandConvertSchema, { title: 'Too short', body: 'tiny' }).success).toBe(false);
      const withExtras = {
        title: 'The Vale Gate',
        body,
        discoveredNames: [{ sourceName: 'Li Wei', replacement: 'Liam Vey', category: 'character' }],
        fixes: [{ kind: 'attribution', detail: 'gave the retort back to Mira' }],
        addedScenes: [{ placement: 'after the duel', purpose: 'first romance beat' }],
        carryState: { activeThreads: 'Mira and Evan, first spark' },
      };
      expect(parseSchema(RebrandConvertSchema, withExtras).success).toBe(true);
    });

    it('registers the recombine prompt and validates its decision shape', async () => {
      const prompt = PROMPT_REGISTRY['recombine'];
      expect(prompt.version).toBe('1.0.0');
      // Boundary resolution rides the skeleton role — same source-structure-analysis family.
      expect(prompt.role).toBe('skeleton');

      const messages = await prompt.template.formatMessages({ boundaries: 'Boundary after chapter 12 (flag: bare_repeat)' });
      expect(messages[0]?.getType()).toBe('system');
      expect(String(messages[1]?.content)).toContain('flag: bare_repeat');

      expect(parseSchema(prompt.schema, { decisions: [{ afterChapter: 12, verdict: 'merge' }] }).success).toBe(true);
      expect(parseSchema(prompt.schema, { decisions: [{ afterChapter: 12, verdict: 'maybe' }] }).success).toBe(false);
    });

    it('rebrand-audit postValidate forces verdict/issues agreement', () => {
      const audit = PROMPT_REGISTRY['rebrand-audit'];
      expect(audit.postValidate?.({ verdict: 'clean', issues: [] })).toEqual([]);
      expect(audit.postValidate?.({ verdict: 'issues', issues: [] })[0]).toMatch(/at least one issue/);
      expect(audit.postValidate?.({ verdict: 'clean', issues: [{ type: 'naming', detail: 'x' }] })[0]).toMatch(/empty issues list/);
      expect(parseSchema(RebrandAuditSchema, { verdict: 'issues', issues: [{ type: 'real_world_reference', detail: 'mentions China' }] }).success).toBe(true);
      expect(parseSchema(RebrandAuditSchema, { verdict: 'maybe', issues: [] }).success).toBe(false);
    });
  });

  describe('reforge prompt modules', () => {
    it('registers the three reforge prompt keys with the expected roles', () => {
      for (const key of ['reforge-outline', 'reforge-write', 'reforge-judge'] as const) expect(PROMPT_REGISTRY[key]).toBeDefined();
      expect(PROMPT_REGISTRY['reforge-outline'].version).toBe('1.0.0');
      expect(PROMPT_REGISTRY['reforge-judge'].version).toBe('1.1.0');
      expect(PROMPT_REGISTRY['reforge-write'].version).toBe('1.2.0');
      // Outline and write ride the dedicated writing-group `reforge` role; the fidelity check reuses `judge`.
      expect(PROMPT_REGISTRY['reforge-outline'].role).toBe('reforge');
      expect(PROMPT_REGISTRY['reforge-write'].role).toBe('reforge');
      expect(PROMPT_REGISTRY['reforge-judge'].role).toBe('judge');
      // The re-author elevates prose, so it carries the house style; the two analytical prompts must not.
      expect(PROMPT_REGISTRY['reforge-write'].kind).toBe('authoring');
      expect(PROMPT_REGISTRY['reforge-write'].system).toContain(AUTHORING_STYLE.slice(0, 40));
      expect(PROMPT_REGISTRY['reforge-outline'].kind).toBe('analytical');
      expect(PROMPT_REGISTRY['reforge-judge'].kind).toBe('analytical');
    });

    it('renders reforge-outline with the stable pack first and the volatile source prose last', async () => {
      const messages = await PROMPT_REGISTRY['reforge-outline'].template.formatMessages({ contextPack: 'STABLE-WORLD-NOTES', chapterProse: 'VOLATILE-SOURCE-PROSE' });
      expect(messages).toHaveLength(3);
      expect(messages[0]?.getType()).toBe('system');
      expect(String(messages[1]?.content)).toBe('STABLE-WORLD-NOTES');
      expect(String(messages[2]?.content)).toContain('VOLATILE-SOURCE-PROSE');
    });

    it('renders reforge-write in cache order: system, stable pack, volatile outline tail', async () => {
      const messages = await PROMPT_REGISTRY['reforge-write'].template.formatMessages({
        stableContext: 'STABLE-PACK',
        fidelityGuidance: '',
        volatileContext: 'VOLATILE-CARRY-STATE',
        outline: 'VOLATILE-OUTLINE',
        repairNotes: 'fix the leftover name',
      });
      expect(messages).toHaveLength(3);
      expect(messages[0]?.getType()).toBe('system');
      expect(String(messages[1]?.content)).toBe('STABLE-PACK');
      expect(String(messages[2]?.content)).toContain('VOLATILE-CARRY-STATE');
      expect(String(messages[2]?.content)).toContain('VOLATILE-OUTLINE');
      expect(String(messages[2]?.content)).toContain('fix the leftover name');
    });

    it('names only the stable-segment vars in reforge-write cacheStrategy', () => {
      expect(PROMPT_REGISTRY['reforge-write'].cacheStrategy?.stableVars).toEqual(['stableContext', 'fidelityGuidance']);
    });

    it('renders reforge-judge with its outline, world notes, glossary, and written prose vars', async () => {
      const messages = await PROMPT_REGISTRY['reforge-judge'].template.formatMessages({
        outline: 'OUTLINE',
        worldNotes: 'NOTES',
        glossarySlice: 'SLICE',
        fidelityRule: '',
        writtenProse: 'PROSE',
      });
      expect(String(messages[1]?.content)).toContain('OUTLINE');
      expect(String(messages[1]?.content)).toContain('SLICE');
      expect(String(messages[2]?.content)).toContain('PROSE');
    });

    it('should keep the prompt fidelity levels aligned with the reforge_fidelity enum', () => {
      expect(reforgeFidelity.enumValues).toEqual(['preserve', 'close', 'loose']);
    });

    it('should render no fidelity block at preserve, keeping the level-less prompts byte-identical', async () => {
      expect(renderReforgeFidelityGuidance('preserve')).toBe('');
      expect(renderReforgeFidelityRule('preserve')).toBe('');
      expect(renderReforgeFidelityRule('close')).toBe('');

      const messages = await PROMPT_REGISTRY['reforge-write'].template.formatMessages({
        stableContext: 'STABLE-PACK',
        fidelityGuidance: renderReforgeFidelityGuidance('preserve'),
        volatileContext: 'V',
        outline: 'O',
        repairNotes: 'none',
      });
      expect(String(messages[1]?.content)).toBe('STABLE-PACK');
    });

    it('should give the writer dialogue latitude at close and beat-reordering latitude at loose', async () => {
      expect(renderReforgeFidelityGuidance('close')).toContain('source dialogue');
      expect(renderReforgeFidelityGuidance('loose')).toContain('reorder beats');
      expect(renderReforgeFidelityGuidance('loose')).toContain('Never move material into or out of another chapter');

      const messages = await PROMPT_REGISTRY['reforge-write'].template.formatMessages({
        stableContext: 'STABLE-PACK',
        fidelityGuidance: renderReforgeFidelityGuidance('loose'),
        volatileContext: 'V',
        outline: 'O',
        repairNotes: 'none',
      });
      // The latitude must ride the cached stable message, not the per-chapter tail.
      expect(String(messages[1]?.content)).toContain('FIDELITY: LOOSE');
      expect(String(messages[2]?.content)).not.toContain('FIDELITY');
    });

    it('should stop the judge flagging reordering as missing or invented beats at loose only', async () => {
      const rule = renderReforgeFidelityRule('loose');
      expect(rule).toContain('Do not report reordering');
      expect(rule).toContain('MAJOR beat dropped outright');

      const messages = await PROMPT_REGISTRY['reforge-judge'].template.formatMessages({
        outline: 'OUTLINE',
        worldNotes: 'NOTES',
        glossarySlice: 'SLICE',
        fidelityRule: rule,
        writtenProse: 'PROSE',
      });
      expect(String(messages[1]?.content)).toContain('Do not report reordering');
    });

    it('validates the reforge output shapes', () => {
      expect(
        parseSchema(ReforgeOutlineSchema, { title: 'The Vale Gate', throughline: 'Evan claims the gate.', beats: [{ summary: 'He enters.', purpose: 'set stakes' }] }).success,
      ).toBe(true);
      expect(parseSchema(ReforgeOutlineSchema, { title: 'Empty', throughline: 't', beats: [] }).success).toBe(false);

      const body = 'p'.repeat(120);
      expect(parseSchema(ReforgeWriteSchema, { title: 'The Vale Gate', body }).success).toBe(true);
      expect(parseSchema(ReforgeWriteSchema, { title: 'Too short', body: 'tiny' }).success).toBe(false);
      const withChanges = { title: 'The Vale Gate', body, changes: { renames: ['Ye Fan → Evan Vale'], removals: ['cut the filler tournament'] }, discoveredNames: [] };
      expect(parseSchema(ReforgeWriteSchema, withChanges).success).toBe(true);

      expect(parseSchema(ReforgeJudgeSchema, { verdict: 'clean', coveredBeats: 3, totalBeats: 3, issues: [] }).success).toBe(true);
      expect(
        parseSchema(ReforgeJudgeSchema, {
          verdict: 'issues',
          coveredBeats: 2,
          totalBeats: 3,
          missingBeats: ['the duel'],
          issues: [{ type: 'missing_beat', detail: 'the duel is gone' }],
        }).success,
      ).toBe(true);
      expect(parseSchema(ReforgeJudgeSchema, { verdict: 'bogus', coveredBeats: 0, totalBeats: 0, issues: [] }).success).toBe(false);
    });

    it('reforge-judge postValidate forces verdict/issues agreement and beat-count sanity', () => {
      const judge = PROMPT_REGISTRY['reforge-judge'];
      expect(judge.postValidate?.({ verdict: 'clean', coveredBeats: 3, totalBeats: 3, issues: [] })).toEqual([]);
      expect(judge.postValidate?.({ verdict: 'issues', coveredBeats: 3, totalBeats: 3, issues: [] })[0]).toMatch(/at least one issue/);
      expect(judge.postValidate?.({ verdict: 'clean', coveredBeats: 3, totalBeats: 3, issues: [{ type: 'naming', detail: 'x' }] })[0]).toMatch(/empty issues list/);
      expect(judge.postValidate?.({ verdict: 'clean', coveredBeats: 4, totalBeats: 3, issues: [] })[0]).toMatch(/cannot exceed totalBeats/);
    });
  });

  describe('ending contract (v2 bumps)', () => {
    it('outline v2 requires an ending contract per brief', () => {
      const brief = { chapter: 1, volumeKey: 'v1', title: 'T', objective: 'obj', events: ['e1'], requiredContext: [] };
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

  describe('knowledge contract (generation/judge v2.2, character-knowledge design §5–6)', () => {
    it('generation v2.2 states the epistemic rule for the knowledge sections', () => {
      expect(PROMPT_REGISTRY.generation.version).toBe('2.4.0');
      expect(PROMPT_REGISTRY.generation.system).toContain('## KNOWN FACTS (POV CAST)');
      expect(PROMPT_REGISTRY.generation.system).toContain('## REVEALED THIS CHAPTER');
      expect(PROMPT_REGISTRY.generation.system).toContain('## BEHAVIORAL CONSTRAINTS');
      expect(PROMPT_REGISTRY.generation.system).toContain('does not exist for the cast');
    });

    it('judge v2.2 explains the forbidden-knowledge assessment and its JSON field', () => {
      expect(PROMPT_REGISTRY.judge.system).toContain('## FORBIDDEN KNOWLEDGE');
      expect(PROMPT_REGISTRY.judge.system).toContain('knowledgeCompliance');
    });

    it('judge schema accepts knowledgeCompliance and keeps it optional', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [] }).success).toBe(true);
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [], knowledgeCompliance: { compliant: false, issues: ['[ledger_forgery] leaked'] } }).success).toBe(true);
    });

    it('outline v2.2 instructs the outliner to author contracts from catalog fact keys', () => {
      expect(PROMPT_REGISTRY.outline.system).toContain('CANON FACTS');
      expect(PROMPT_REGISTRY.outline.system).toContain('never invent one');
      expect(PROMPT_REGISTRY.outline.system).toContain('"knowledgeContract": {"pov": ["entity-key"]');
    });

    it('outline schema accepts a brief with a knowledgeContract and keeps it optional', () => {
      const brief = {
        chapter: 1,
        volumeKey: 'vol_01',
        title: 't',
        objective: 'o',
        events: ['e'],
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

  describe('reader value and purpose (outline v2.3, harness-final-recommendation.md D16)', () => {
    const baseBrief = {
      chapter: 1,
      volumeKey: 'vol_01',
      title: 't',
      objective: 'o',
      events: ['e'],
      requiredContext: [],
      endingContract: { hookType: 'cliffhanger', emotionalBeat: 'b', openQuestion: 'q', handoffState: 'h', mustNotResolve: [] },
    };

    it('outline v2.3 instructs the outliner to name a falsifiable readerValue and forbids empty purpose', () => {
      expect(PROMPT_REGISTRY.outline.version).toBe('2.3.0');
      expect(PROMPT_REGISTRY.outline.system).toContain('chapterPurpose');
      expect(PROMPT_REGISTRY.outline.system).toContain('readerValue');
      expect(PROMPT_REGISTRY.outline.system).toContain('repetitionRisks');
      expect(PROMPT_REGISTRY.outline.system).toContain('is not earning its place');
    });

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
    it('judge v2.3 asks for an unconditional brief-fulfillment assessment', () => {
      expect(PROMPT_REGISTRY.judge.version).toBe('2.3.0');
      expect(PROMPT_REGISTRY.judge.system).toContain('## BRIEF');
      expect(PROMPT_REGISTRY.judge.system).toContain('briefCompliance');
      expect(PROMPT_REGISTRY.judge.system).toContain('"briefCompliance": {"compliant": true/false, "issues": ["..."]} (always)');
    });

    it('judge schema accepts briefCompliance and keeps it optional', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [] }).success).toBe(true);
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [], briefCompliance: { compliant: false, issues: ['the bribe never happens on-page'] } }).success).toBe(
        true,
      );
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [], briefCompliance: { compliant: false } }).success).toBe(false);
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

  describe('ExtractionSchema', () => {
    it('accepts minimal valid output', () => {
      const result = parseSchema(ExtractionSchema, {
        entities: [],
        relationships: [],
        beats: [],
        plotThreads: [],
        worldFacts: [],
        mysteries: [],
        chapterSummary: 'The hero arrives in the city.',
      });
      expect(result.success).toBe(true);
    });
  });
});
