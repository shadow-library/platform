/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { PROMPT_REGISTRY, SCOPE_PLAYBOOKS, buildChatRefinePrompt } from '@modules/ai/prompts';
import { AUTHORING_STYLE } from '@modules/ai/prompts/authoring-preamble';
import {
  ChatRefineSchema,
  ExtractionSchema,
  FixSchema,
  JudgeSchema,
  PlanSchema,
  RebrandAuditSchema,
  RebrandConvertSchema,
  validateArcCoverage,
  validatePlanContiguity,
} from '@modules/ai/schemas';
import { parseSchema } from '@modules/ai/schemas/validate';

/**
 * Declaring the constants
 */

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

  describe('rebrand prompt modules', () => {
    it('registers the three rebrand prompt keys with the expected roles', () => {
      for (const key of ['rebrand-glossary', 'rebrand-convert', 'rebrand-audit'] as const) {
        expect(PROMPT_REGISTRY[key]).toBeDefined();
        expect(PROMPT_REGISTRY[key].version).toBe('1.0.0');
      }
      expect(PROMPT_REGISTRY['rebrand-glossary'].role).toBe('rebrand');
      expect(PROMPT_REGISTRY['rebrand-convert'].role).toBe('rebrand');
      // The audit reuses the cacheable `audit` role so identical re-audits hit llm_cache.
      expect(PROMPT_REGISTRY['rebrand-audit'].role).toBe('audit');
    });

    it('renders rebrand-convert in cache order: system, stable pack, volatile chapter tail', async () => {
      const messages = await PROMPT_REGISTRY['rebrand-convert'].template.formatMessages({
        contextPack: 'STABLE-WORLD-NOTES',
        chapterProse: 'VOLATILE-CHAPTER-PROSE',
        repairNotes: 'fix the leftover name',
      });
      expect(messages).toHaveLength(3);
      expect(messages[0]?.getType()).toBe('system');
      expect(String(messages[1]?.content)).toBe('STABLE-WORLD-NOTES');
      expect(String(messages[2]?.content)).toContain('VOLATILE-CHAPTER-PROSE');
      expect(String(messages[2]?.content)).toContain('fix the leftover name');
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

  describe('ending contract (v2 bumps)', () => {
    it('outline v2 requires an ending contract per brief', () => {
      const brief = { chapter: 1, volumeKey: 'v1', title: 'T', objective: 'obj', events: ['e1'], requiredContext: [] };
      expect(parseSchema(PROMPT_REGISTRY.outline.schema, [brief]).success).toBe(false);
      const withContract = { ...brief, endingContract: { hookType: 'cliffhanger', emotionalBeat: 'dread', openQuestion: 'who?', handoffState: 'cornered on the roof' } };
      expect(parseSchema(PROMPT_REGISTRY.outline.schema, [withContract]).success).toBe(true);
    });

    it('judge v2 accepts endingCompliance and keeps it optional', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [] }).success).toBe(true);
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [], endingCompliance: { compliant: false, issues: ['hookType missed'] } }).success).toBe(true);
    });

    it('generation v2 renders the ending contract in the volatile tail', async () => {
      const messages = await PROMPT_REGISTRY.generation.template.formatMessages({
        contextPack: 'PACK',
        chapterBrief: 'BRIEF',
        endingContract: 'Hook type: cliffhanger',
        guidance: '',
      });
      expect(String(messages[messages.length - 1]?.content)).toContain('## ENDING CONTRACT\nHook type: cliffhanger');
    });
  });

  describe('knowledge contract (generation/judge v2.2, character-knowledge design §5–6)', () => {
    it('generation v2.2 states the epistemic rule for the knowledge sections', () => {
      expect(PROMPT_REGISTRY.generation.version).toBe('2.2.0');
      expect(PROMPT_REGISTRY.generation.system).toContain('## KNOWN FACTS (POV CAST)');
      expect(PROMPT_REGISTRY.generation.system).toContain('## REVEALED THIS CHAPTER');
      expect(PROMPT_REGISTRY.generation.system).toContain('## BEHAVIORAL CONSTRAINTS');
      expect(PROMPT_REGISTRY.generation.system).toContain('does not exist for the cast');
    });

    it('judge v2.2 explains the forbidden-knowledge assessment and its JSON field', () => {
      expect(PROMPT_REGISTRY.judge.version).toBe('2.2.0');
      expect(PROMPT_REGISTRY.judge.system).toContain('## FORBIDDEN KNOWLEDGE');
      expect(PROMPT_REGISTRY.judge.system).toContain('knowledgeCompliance');
    });

    it('judge schema accepts knowledgeCompliance and keeps it optional', () => {
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [] }).success).toBe(true);
      expect(parseSchema(JudgeSchema, { verdict: 'consistent', findings: [], knowledgeCompliance: { compliant: false, issues: ['[ledger_forgery] leaked'] } }).success).toBe(true);
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
