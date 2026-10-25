import { describe, expect, it } from 'bun:test';

import { type CatalogDocument, type DocumentEdit } from '../src/features/catalog/catalog-document';
import { resolveSelectorKey } from '../src/features/catalog/catalog-keys';
import { readAliases, readModels, readProviders, readTasks } from '../src/features/catalog/catalog-readers';
import { type ModelEntry, type TaskEntry } from '../src/features/catalog/catalog-spec.types';
import { type CatalogEdit } from '../src/features/catalog/draft-edit';
import { modelCapabilityNames, modelDisplayName, modelEligibility, modelPriceText } from '../src/features/shared/model-options';
import { effortFormOf, effortOf, effortProblems } from '../src/features/tasks/effort-range';
import { featureNote } from '../src/features/catalog/draft-edit';
import { aboutProblems, aliasHints, aliasOptions, dataPolicyHints, saveFeedback } from '../src/features/tasks/feature-detail';
import { buildFeatureGroups, changedTaskKeys } from '../src/features/tasks/feature-list';
import {
  addCondition,
  addRule,
  displayRoutes,
  FALLBACK_MODEL_LABEL,
  moveRule,
  removeRule,
  routesFromRouting,
  type RoutingDraft,
  routingFromRoutes,
  ruleModelLabel,
  setCondition,
  setFallback,
  setRuleModel,
  validateRouting,
} from '../src/features/tasks/route-rules';
import {
  aboutEdit,
  aliasesEdit,
  dataPolicyEdit,
  effortEdit,
  type FeatureSection,
  guardedTaskEdit,
  rawTaskFields,
  routingEdit,
  SECTION_CHANGED,
  SECTION_FIELDS,
  type TaskFields,
} from '../src/features/tasks/section-edits';
import { catalogFixture } from './catalog-fixture';

const CHAT = 'novel-forge.chat';

function fixture(): { document: Record<string, unknown>; models: ModelEntry[]; chat: TaskEntry } {
  const document = catalogFixture();
  const chat = readTasks(document).find(task => task.key === CHAT);
  if (!chat) throw new TypeError('The fixture has no chat task');
  return { document, models: readModels(document), chat };
}

function model(models: readonly ModelEntry[], key: string): ModelEntry {
  const found = models.find(candidate => candidate.key === key);
  if (!found) throw new TypeError(`No model ${key}`);
  return found;
}

const EMBEDDER: ModelEntry = {
  key: 'nomic',
  label: 'Nomic Embed',
  capabilities: { tools: false, structuredOutput: 'prompt', vision: false, embedding: { dimensions: 768 }, reasoning: 'none', promptCache: 'none', sampling: false },
  pricePerMTok: { input: 0, output: 0 },
  deployments: [{ provider: 'ollama', id: 'nomic-embed-text' }],
};

describe('rule display', () => {
  it('should list the default rule last whatever its position in the document', () => {
    const routes = [{ model: 'opus-5.5' }, { when: { tier: 'economy' }, model: 'llama3.1' }];
    expect(displayRoutes(routes).map(route => route.model)).toEqual(['llama3.1', 'opus-5.5']);
  });
});

describe('routing draft', () => {
  it('should write the routes back unchanged with the default first, in the middle or last', () => {
    const economy = { when: { tier: 'economy' }, model: 'llama3.1' };
    const premium = { when: { tier: 'premium', content_mode: 'mature' }, model: 'opus-5.5' };
    const fallback = { model: 'sonnet-5.5' };
    for (const routes of [
      [fallback, economy, premium],
      [economy, fallback, premium],
      [economy, premium, fallback],
    ]) {
      const draft = routingFromRoutes(routes);
      expect(draft.fallback).toBe('sonnet-5.5');
      expect(draft.rules.map(rule => rule.model)).toEqual(['llama3.1', 'opus-5.5']);
      expect(routesFromRouting(draft)).toEqual(routes);
    }
  });

  it('should keep stored route fields, an empty default selector set and untrimmed values it did not change', () => {
    const routes = [
      { when: {}, model: 'opus-5.5', note: 'default' },
      { when: { tier: ' economy ' }, model: 'llama3.1', weight: 2 },
    ];
    const draft = routingFromRoutes(routes);
    expect(routesFromRouting(draft)).toEqual(routes);
    expect(routesFromRouting(setRuleModel(draft, 0, 'sonnet-5.5'))).toEqual([routes[0], { when: { tier: ' economy ' }, model: 'sonnet-5.5', weight: 2 }]);
    expect(routesFromRouting(setCondition(draft, 0, 0, { value: 'premium' }))).toEqual([routes[0], { when: { tier: 'premium' }, model: 'llama3.1', weight: 2 }]);
  });

  it('should put the default last when it had none, and no further than the rules left before it', () => {
    const noDefault = setFallback(routingFromRoutes([{ when: { tier: 'economy' }, model: 'llama3.1' }]), 'opus-5.5');
    expect(routesFromRouting(noDefault)).toEqual([{ when: { tier: 'economy' }, model: 'llama3.1' }, { model: 'opus-5.5' }]);
    const middle = routingFromRoutes([{ when: { tier: 'economy' }, model: 'llama3.1' }, { model: 'opus-5.5' }]);
    expect(routesFromRouting(removeRule(middle, 0))).toEqual([{ model: 'opus-5.5' }]);
  });

  it('should keep extra default routes as condition-less rules and flag them', () => {
    const draft = routingFromRoutes([{ model: 'opus-5.5' }, { model: 'llama3.1' }]);
    expect(draft.rules).toHaveLength(1);
    expect(validateRouting(draft)).toEqual([{ rule: 0, message: 'Rule 1 needs at least one condition; only "everyone else" has none' }]);
  });

  it('should flag a missing default model', () => {
    expect(validateRouting(routingFromRoutes([{ when: { tier: 'economy' }, model: 'llama3.1' }]))).toEqual([{ rule: null, message: 'Choose a model for everyone else' }]);
  });

  it('should reorder, add and remove rules without touching the default', () => {
    let draft: RoutingDraft = routingFromRoutes([{ when: { tier: 'economy' }, model: 'llama3.1' }, { when: { tier: 'premium' }, model: 'opus-5.5' }, { model: 'sonnet-5.5' }]);
    draft = moveRule(draft, 1, -1);
    expect(draft.rules.map(rule => rule.model)).toEqual(['opus-5.5', 'llama3.1']);
    expect(moveRule(draft, 0, -1)).toBe(draft);
    expect(moveRule(draft, 1, 1)).toBe(draft);
    draft = addRule(draft);
    expect(draft.rules).toHaveLength(3);
    expect(new Set([...draft.rules.map(rule => rule.id), ...draft.rules.flatMap(rule => rule.conditions.map(condition => condition.id))]).size).toBe(6);
    draft = removeRule(draft, 0);
    expect(draft.rules.map(rule => rule.model)).toEqual(['llama3.1', '']);
    expect(draft.fallback).toBe('sonnet-5.5');
  });

  it('should refuse a new rule until it has a complete condition and a model', () => {
    const draft = addRule(routingFromRoutes([{ model: 'opus-5.5' }]));
    expect(validateRouting(draft).map(issue => issue.message)).toEqual(['Rule 1 has a condition without a name or a value', 'Choose a model for rule 1']);
    const filled = setRuleModel(setCondition(draft, 0, 0, { key: 'tier', value: 'economy' }), 0, 'llama3.1');
    expect(validateRouting(filled)).toEqual([]);
    expect(routesFromRouting(filled)).toEqual([{ model: 'opus-5.5' }, { when: { tier: 'economy' }, model: 'llama3.1' }]);
  });

  it('should flag two rules with the same conditions in any order', () => {
    const draft = routingFromRoutes([
      { when: { tier: 'economy', content_mode: 'standard' }, model: 'llama3.1' },
      { when: { content_mode: 'standard', tier: 'economy' }, model: 'sonnet-5.5' },
      { model: 'opus-5.5' },
    ]);
    expect(validateRouting(draft)).toEqual([{ rule: 1, message: 'Rule 2 has the same conditions as rule 1, so it would never be used' }]);
  });

  it('should flag a condition name used twice in one rule and one the server would refuse', () => {
    let draft = routingFromRoutes([{ when: { tier: 'economy' }, model: 'llama3.1' }, { model: 'opus-5.5' }]);
    draft = setCondition(addCondition(draft, 0), 0, 1, { key: 'tier', value: 'premium' });
    expect(validateRouting(draft).map(issue => issue.message)).toEqual(['Rule 1 uses Tier more than once']);
    draft = setCondition(draft, 0, 1, { key: 'content mode' });
    expect(validateRouting(draft).map(issue => issue.message)).toEqual(['Rule 1: "content mode" can\'t be a condition name; use letters, digits and _ . : / @ - without spaces']);
  });

  it('should resolve typed text to a known condition by key or readable name', () => {
    const known = ['content_mode', 'tier'];
    expect(resolveSelectorKey(' Content mode ', known)).toBe('content_mode');
    expect(resolveSelectorKey('TIER', known)).toBe('tier');
    expect(resolveSelectorKey('plan', known)).toBe('plan');
  });
});

describe('ruleModelLabel', () => {
  it('should name each rule by its position and complete conditions', () => {
    const draft = routingFromRoutes([{ when: { tier: 'economy', content_mode: 'standard' }, model: 'llama3.1' }, { model: 'opus-5.5' }]);
    expect(draft.rules[0] && ruleModelLabel(draft.rules[0], 1)).toBe('Answered by, rule 2: when Tier is economy and Content mode is standard');
    expect(FALLBACK_MODEL_LABEL).toBe('Answered by, everyone else');
  });

  it('should leave out half-filled conditions and fall back to the position alone', () => {
    const draft = setCondition(addRule(routingFromRoutes([{ model: 'opus-5.5' }])), 0, 0, { key: 'tier', value: ' ' });
    expect(draft.rules[0] && ruleModelLabel(draft.rules[0], 0)).toBe('Answered by, rule 1');
  });
});

describe('routing draft with prototype keys', () => {
  it('should keep a condition named like a prototype key as an own field of the route', () => {
    for (const key of ['__proto__', 'constructor']) {
      const draft = setCondition(addRule(routingFromRoutes([{ model: 'sonnet-5.5' }])), 0, 0, { key, value: 'x' });
      const rule = routesFromRouting(setRuleModel(draft, 0, 'opus-5.5')).find(route => route.when !== undefined);
      expect(Object.hasOwn(rule?.when as object, key)).toBe(true);
      expect(Object.getPrototypeOf(rule?.when)).toBe(Object.prototype);
      expect(JSON.parse(JSON.stringify(rule))).toEqual(JSON.parse(`{"when":{"${key}":"x"},"model":"opus-5.5"}`));
    }
  });

  it('should read a stored condition named like a prototype key', () => {
    const stored = JSON.parse('[{"when":{"__proto__":"x"},"model":"opus-5.5"},{"model":"sonnet-5.5"}]') as unknown[];
    const draft = routingFromRoutes(stored);
    expect(draft.rules[0]?.conditions.map(condition => [condition.key, condition.value])).toEqual([['__proto__', 'x']]);
    expect(routesFromRouting(draft)).toEqual(stored as ReturnType<typeof routesFromRouting>);
  });
});

describe('effort range', () => {
  it('should accept min <= default <= max in effort order and optional bounds', () => {
    expect(effortProblems({ default: 'medium', min: 'low', max: 'high' })).toEqual({});
    expect(effortProblems({ default: 'medium', min: 'medium', max: 'medium' })).toEqual({});
    expect(effortProblems({ default: 'none', min: null, max: null })).toEqual({});
  });

  it('should refuse bounds on the wrong side of the default', () => {
    expect(effortProblems({ default: 'low', min: 'high', max: 'minimal' })).toEqual({
      min: "The lowest effort can't be above the default",
      max: "The highest effort can't be below the default",
    });
    expect(effortProblems({ default: 'xhigh', min: null, max: 'high' })).toEqual({ max: "The highest effort can't be below the default" });
  });

  it('should write no effort when there is no default, and drop unset bounds', () => {
    expect(effortOf({ default: null, min: 'low', max: 'high' })).toBeNull();
    expect(effortOf({ default: 'high', min: null, max: 'max' })).toEqual({ default: 'high', max: 'max' });
    expect(effortFormOf(undefined)).toEqual({ default: null, min: null, max: null });
    expect(effortFormOf({ default: 'medium', min: 'low' })).toEqual({ default: 'medium', min: 'low', max: null });
  });
});

describe('model eligibility hints', () => {
  it('should mirror the server: structured output always holds, embedding models neither stream nor chat', () => {
    const { models } = fixture();
    expect(modelEligibility(model(models, 'llama3.1'), { requires: ['tools', 'structured_output', 'streaming'], kind: 'chat' })).toEqual({ eligible: true });
    expect(modelEligibility(model(models, 'llama3.1'), { requires: ['vision'], kind: 'chat' })).toEqual({ eligible: false, reasons: ["Doesn't support vision"] });
    expect(modelEligibility(EMBEDDER, { requires: ['streaming'], kind: 'chat' })).toEqual({
      eligible: false,
      reasons: ["Can't serve chat features", "Doesn't support streaming"],
    });
    expect(modelEligibility(EMBEDDER, { kind: 'embedding' })).toEqual({ eligible: true });
    expect(modelEligibility(model(models, 'opus-5.5'), { kind: 'image' })).toEqual({ eligible: false, reasons: ["Can't serve image generation features"] });
  });

  it('should flag models outside the cluster only for providers it knows', () => {
    const { document, models } = fixture();
    const providers = readProviders(document);
    expect(modelEligibility(model(models, 'opus-5.5'), { dataPolicy: 'in_cluster_only', providers })).toEqual({
      eligible: false,
      reasons: ['Runs outside our cluster, on Subscription, Openrouter'],
    });
    expect(modelEligibility(model(models, 'llama3.1'), { dataPolicy: 'in_cluster_only', providers })).toEqual({ eligible: true });
    expect(modelEligibility(model(models, 'opus-5.5'), { dataPolicy: 'in_cluster_only', providers: [] })).toEqual({ eligible: true });
    expect(modelEligibility(model(models, 'opus-5.5'), { dataPolicy: 'any', providers })).toEqual({ eligible: true });
  });

  it('should describe a model by name, version, prices and capabilities', () => {
    const { models } = fixture();
    expect(modelDisplayName(model(models, 'opus-5.5'))).toBe('Opus 5.5');
    expect(modelDisplayName({ key: 'gpt', label: 'GPT Sol', version: '2' })).toBe('GPT Sol 2');
    expect(modelPriceText({ input: 3, output: 15, perImage: 0.04 })).toBe('$3.00 in / $15.00 out per M tokens · $0.04 per image');
    expect(modelCapabilityNames(model(models, 'opus-5.5'))).toEqual(['Tools', 'Structured output', 'Vision']);
    expect(modelCapabilityNames(EMBEDDER)).toEqual(['Embeddings']);
  });
});

describe('feature list', () => {
  it('should group tasks by app with their default model, extra rules, effort, names offered and spend', () => {
    const { document } = fixture();
    const usage = [{ key: CHAT, calls: 3, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, listCostUsd: 1.5, billedCostUsd: 0.25 }];
    const groups = buildFeatureGroups(document, new Set([CHAT]), usage);
    expect(groups.map(group => group.name)).toEqual(['Memoir', 'Novel Forge']);
    const chat = groups[1]?.features[0];
    expect(chat).toMatchObject({
      key: CHAT,
      name: 'Chat',
      defaultModel: { key: 'opus-5.5', name: 'Opus 5.5', price: { input: 15, cachedInput: 1.5, output: 75 } },
      extraRules: 1,
      effort: 'medium',
      aliases: [
        { key: 'opus', name: 'Opus' },
        { key: 'sonnet', name: 'Sonnet' },
      ],
      unpublished: true,
      spend: { billed: 0.25, list: 1.5 },
    });
    expect(groups[0]?.features[0]).toMatchObject({ name: 'Receipt structuring', extraRules: 0, unpublished: false, spend: { billed: 0, list: 0 } });
  });

  it('should leave spend unknown without usage and keep a default model the catalog lacks', () => {
    const document = catalogFixture();
    document.tasks['memoir.receipt-structuring'].routes = [{ model: 'gone' }];
    const memoir = buildFeatureGroups(document, new Set(), null)[0]?.features[0];
    expect(memoir?.spend).toBeUndefined();
    expect(memoir?.defaultModel).toEqual({ key: 'gone', name: 'gone' });
  });

  it('should mark only the tasks a draft changes as unpublished', () => {
    const active = catalogFixture();
    const draft = catalogFixture();
    draft.tasks[CHAT].dataPolicy = 'in_cluster_only';
    expect([...changedTaskKeys(active, draft)]).toEqual([CHAT]);
    expect(changedTaskKeys(active, null).size).toBe(0);
    expect(changedTaskKeys(null, draft).has('memoir.receipt-structuring')).toBe(true);
  });
});

describe('feature detail', () => {
  it('should bound the name and description as the server does', () => {
    expect(aboutProblems({ label: ` ${'x'.repeat(60)} `, description: 'y'.repeat(280) })).toEqual({});
    expect(aboutProblems({ label: 'x'.repeat(61), description: 'y'.repeat(281) })).toEqual({
      label: 'Keep the name to 60 characters',
      description: 'Keep the description to 280 characters',
    });
  });

  it('should note the feature and the change', () => {
    expect(featureNote({ app: 'novel-forge', name: 'chat', label: 'Chat' }, 'routing')).toBe('Novel Forge · Chat: routing updated');
  });

  it('should keep offered names the catalog lacks and label retired ones', () => {
    const { document } = fixture();
    const aliases = readAliases(document).map(alias => (alias.key === 'sonnet' ? { ...alias, state: 'retired' as const } : alias));
    expect(aliasOptions(aliases, ['opus', 'gone'])).toEqual([
      { value: 'gone', label: 'gone (not in the catalog)' },
      { value: 'opus', label: 'Opus' },
      { value: 'sonnet', label: 'Sonnet (retired)' },
    ]);
  });

  it('should hint at offered names whose model cannot serve the feature', () => {
    const { document, models, chat } = fixture();
    const aliases = readAliases(document);
    expect(aliasHints(['opus', 'sonnet'], aliases, models, chat)).toEqual([]);
    expect(aliasHints(['opus', 'gone'], aliases, models, { ...chat, requires: ['image_output'] })).toEqual([
      "Opus points to Opus 5.5: doesn't support image output",
      "gone isn't in the catalog, so publishing will refuse it",
    ]);
  });

  it('should list reachable models outside the cluster for an in-cluster-only policy', () => {
    const { document, models, chat } = fixture();
    const context = { aliases: readAliases(document), models, providers: readProviders(document) };
    expect(dataPolicyHints(chat, 'any', context)).toEqual([]);
    expect(dataPolicyHints(chat, 'in_cluster_only', context)).toEqual([
      'Opus 5.5: runs outside our cluster, on Subscription, Openrouter',
      'Sonnet 5.5: runs outside our cluster, on Openrouter',
    ]);
  });
});

describe('save feedback', () => {
  const issue = (path: string): { path: string; code: string; message: string } => ({ path, code: 'missing_capability', message: 'lacks tools' });

  it('should count the draft issues and pick out this feature’s', () => {
    const { document } = fixture();
    const feedback = saveFeedback({ kind: 'saved', issues: [issue(`tasks.${CHAT}.routes[0].model`), issue('aliases.opus.model')] }, CHAT, document);
    expect(feedback).toMatchObject({ intent: 'warning', review: true, keepEditing: false });
    expect(feedback.body).toBe('The draft has 2 issues to fix before it can be published, 1 of them in this feature.');
    expect(feedback.issues).toEqual([{ sentence: 'The chosen model lacks a capability this feature needs', path: `tasks.${CHAT}.routes[0].model` }]);
    expect(saveFeedback({ kind: 'saved', issues: [] }, CHAT, document).intent).toBe('success');
  });

  it('should keep the editor open on a refusal or failure and close it on a conflict', () => {
    const { document } = fixture();
    expect(saveFeedback({ kind: 'invalid', issues: [issue('tasks')] }, CHAT, document)).toMatchObject({ intent: 'danger', keepEditing: true, issues: [{ path: 'tasks' }] });
    expect(saveFeedback({ kind: 'refused', reason: 'pinned' }, CHAT, document)).toMatchObject({ keepEditing: true, body: 'pinned' });
    expect(saveFeedback({ kind: 'failed', message: 'offline' }, CHAT, document)).toMatchObject({ keepEditing: true, body: 'offline' });
    expect(saveFeedback({ kind: 'conflict' }, CHAT, document)).toMatchObject({ intent: 'warning', keepEditing: false });
    expect(saveFeedback({ kind: 'unchanged' }, CHAT, document)).toMatchObject({ intent: 'info', keepEditing: false });
  });
});

describe('section edits', () => {
  type Tasks = Record<string, Record<string, unknown>>;
  const tasksOf = (document: CatalogDocument): Tasks => document.tasks as Tasks;

  function apply(document: CatalogDocument, section: FeatureSection, opened: TaskFields, edit: CatalogEdit): DocumentEdit {
    return guardedTaskEdit(CHAT, SECTION_FIELDS[section], opened, edit)(document);
  }

  function opening(document: CatalogDocument, section: FeatureSection): TaskFields {
    return rawTaskFields(document, CHAT, SECTION_FIELDS[section]);
  }

  it('should read the raw fields of a section, undefined where the task lacks them', () => {
    const document = catalogFixture();
    expect(rawTaskFields(document, CHAT, ['label', 'pinned'])).toEqual({ label: 'Chat', pinned: undefined });
    expect(rawTaskFields(document, 'app.missing', ['label'])).toEqual({ label: undefined });
  });

  it('should refuse a save when someone else changed the section since it opened, whatever the edit', () => {
    const document = catalogFixture();
    const opened = opening(document, 'dataPolicy');
    tasksOf(document)[CHAT]!.dataPolicy = 'in_cluster_only';
    expect(apply(document, 'dataPolicy', opened, dataPolicyEdit(CHAT, 'any', 'any'))).toEqual({ ok: false, reason: SECTION_CHANGED });
    tasksOf(document)[CHAT]!.label = 'Talk';
    expect(
      apply(
        document,
        'about',
        { label: 'Chat', description: tasksOf(document)[CHAT]!.description },
        aboutEdit(CHAT, { label: 'Chat', description: '' }, { label: 'X', description: '' }),
      ),
    ).toEqual({
      ok: false,
      reason: SECTION_CHANGED,
    });
  });

  it('should apply a section edit when only other sections changed', () => {
    const document = catalogFixture();
    const opened = opening(document, 'dataPolicy');
    tasksOf(document)[CHAT]!.label = 'Talk';
    const next = apply(document, 'dataPolicy', opened, dataPolicyEdit(CHAT, 'any', 'in_cluster_only'));
    expect(next.ok && tasksOf(next.document)[CHAT]!.dataPolicy).toBe('in_cluster_only');
  });

  it('should return the same document when no section changed, keeping how each field is stored', () => {
    const document = catalogFixture();
    const chat = tasksOf(document)[CHAT]!;
    Object.assign(chat, {
      label: '',
      effort: { default: 'medium', min: 'low', max: 'high', note: 'kept' },
      aliases: ['opus', 'sonnet', 7],
      routes: [
        { when: {}, model: 'opus-5.5' },
        { when: { tier: ' economy ' }, model: 'llama3.1', weight: 2 },
      ],
    });
    const task = readTasks(document).find(entry => entry.key === CHAT)!;
    const about = { label: task.label ?? '', description: task.description ?? '' };
    const effort = effortFormOf(task.effort);
    const routes = opening(document, 'routing').routes as unknown[];
    const edits: [FeatureSection, CatalogEdit][] = [
      ['about', aboutEdit(CHAT, about, { ...about })],
      ['effort', effortEdit(CHAT, effort, { ...effort })],
      ['routing', routingEdit(CHAT, routes, routingFromRoutes(routes))],
      ['aliases', aliasesEdit(CHAT, task.aliases, [...task.aliases])],
      ['dataPolicy', dataPolicyEdit(CHAT, task.dataPolicy, task.dataPolicy)],
    ];
    for (const [section, edit] of edits) expect(apply(document, section, opening(document, section), edit)).toEqual({ ok: true, document });
  });

  it('should send only the About fields the person changed', () => {
    const document = catalogFixture();
    tasksOf(document)[CHAT]!.label = '';
    const opened = { label: '', description: 'Talk the story through with an assistant.' };
    const next = apply(document, 'about', opening(document, 'about'), aboutEdit(CHAT, opened, { ...opened, description: 'Plot with an assistant.' }));
    expect(next.ok && tasksOf(next.document)[CHAT]).toMatchObject({ label: '', description: 'Plot with an assistant.' });
  });

  it('should keep effort keys this console does not model and drop cleared bounds', () => {
    const document = catalogFixture();
    tasksOf(document)[CHAT]!.effort = { default: 'medium', min: 'low', max: 'high', note: 'kept' };
    const opened = { default: 'medium', min: 'low', max: 'high' } as const;
    const next = apply(document, 'effort', opening(document, 'effort'), effortEdit(CHAT, opened, { default: 'high', min: null, max: 'max' }));
    expect(next.ok && tasksOf(next.document)[CHAT]!.effort).toEqual({ note: 'kept', default: 'high', max: 'max' });
    const cleared = apply(document, 'effort', opening(document, 'effort'), effortEdit(CHAT, opened, { default: null, min: null, max: null }));
    expect(cleared.ok && 'effort' in tasksOf(cleared.document)[CHAT]!).toBe(false);
  });

  it('should write changed routes in place and refuse a pinned task', () => {
    const document = catalogFixture();
    const routes = opening(document, 'routing').routes as unknown[];
    const draft = setFallback(routingFromRoutes(routes), 'sonnet-5.5');
    const next = apply(document, 'routing', opening(document, 'routing'), routingEdit(CHAT, routes, draft));
    expect(next.ok && tasksOf(next.document)[CHAT]!.routes).toEqual([{ when: { tier: 'economy' }, model: 'llama3.1' }, { model: 'sonnet-5.5' }]);
    tasksOf(document)[CHAT]!.pinned = true;
    expect(apply(document, 'routing', opening(document, 'routing'), routingEdit(CHAT, routes, draft)).ok).toBe(false);
  });

  it('should close the editor when the section changed underneath it', () => {
    expect(saveFeedback({ kind: 'refused', reason: SECTION_CHANGED }, CHAT, catalogFixture())).toMatchObject({ intent: 'warning', keepEditing: false, body: SECTION_CHANGED });
  });
});
