import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { type PrimaryDatabase } from '@server/database';
import {
  BASELINE_LAYOUTS,
  BASELINE_PARTIALS,
  BASELINE_TEMPLATES,
  type BaselineGate,
  BaselineRenderGate,
  type BaselineVersion,
  bootstrapLayouts,
  bootstrapTemplates,
  fixtureDesignSystem,
  hashBaseline,
  hashTemplateContents,
  isSameContract,
  planBaselineStep,
  renderLayout,
  renderTemplate,
  type TemplateFixture,
  templateFixtureContents,
} from '@server/database/seed';
import { TemplateEngineService } from '@modules/template';

interface RecordedCall {
  root: string;
  steps: { method: string; args: unknown[] }[];
}

interface ScriptedOptions {
  failTransactions?: boolean;
}

/** Records every query chain and answers each awaited one, in order, with the next scripted row set. It runs no SQL. */
function scriptedPostgres(results: unknown[][], options: ScriptedOptions = {}): { db: PrimaryDatabase; calls: RecordedCall[] } {
  const queue = [...results];
  const calls: RecordedCall[] = [];
  const chain = (call: RecordedCall): object => {
    const proxy: object = new Proxy(() => undefined, {
      get: (_target, property) => {
        if (property === 'then') return (resolve: (value: unknown) => unknown) => Promise.resolve(queue.shift() ?? []).then(resolve);
        return (...args: unknown[]) => {
          call.steps.push({ method: String(property), args });
          return proxy;
        };
      },
    });
    return proxy;
  };
  const root = (name: string) => (): object => {
    const call: RecordedCall = { root: name, steps: [] };
    calls.push(call);
    return chain(call);
  };
  const transaction = (work: (tx: object) => Promise<unknown>): Promise<unknown> => (options.failTransactions ? Promise.reject(new Error('lock timeout')) : work(db));
  const db = { select: root('select'), insert: root('insert'), update: root('update'), transaction };
  return { db: db as unknown as PrimaryDatabase, calls };
}

function written(calls: RecordedCall[], root: string): Record<string, unknown>[] {
  return calls
    .filter(call => call.root === root)
    .flatMap(call => call.steps.filter(step => step.method === 'values' || step.method === 'set').map(step => step.args[0] as Record<string, unknown>));
}

function renderedWhere(call: RecordedCall | undefined): { sql: string; params: unknown[] } {
  const { sql, params } = new PgDialect().sqlToQuery(call?.steps.find(step => step.method === 'where')?.args[0] as SQL);
  return { sql, params };
}

const PASSING_GATE: BaselineGate = { catalogueRenders: () => Promise.resolve(true), layoutRenders: () => Promise.resolve(true), templateRenders: () => Promise.resolve(true) };
const FAILING_GATE: BaselineGate = { catalogueRenders: () => Promise.resolve(false), layoutRenders: () => Promise.resolve(false), templateRenders: () => Promise.resolve(false) };

const engine = new TemplateEngineService();
const FIXTURE_DESIGN = fixtureDesignSystem({ layouts: BASELINE_LAYOUTS, partials: BASELINE_PARTIALS, templates: BASELINE_TEMPLATES });

const [DEFAULT_LAYOUT] = BASELINE_LAYOUTS;
const LAYOUT = { id: 1n, layoutKey: DEFAULT_LAYOUT?.layoutKey };
const SEEDED_LAYOUT_V1 = { id: 10n, layoutId: 1n, version: 1, status: 'PUBLISHED', body: '<html>an older baseline</html>', notes: 'Baseline', baselineHash: 'legacy' };

const TEMPLATE_FIXTURE = BASELINE_TEMPLATES[0] as TemplateFixture;
const TEMPLATE = { id: 5n, templateKey: TEMPLATE_FIXTURE.templateKey, variableSchema: { variables: TEMPLATE_FIXTURE.variables } };
const SEEDED_TEMPLATE_V1 = { id: 50n, templateId: 5n, version: 1, status: 'PUBLISHED', notes: 'Baseline', baselineHash: 'legacy' };
const STALE_CONTENTS = templateFixtureContents(TEMPLATE_FIXTURE).map(content => ({ ...content, body: `${content.body} (older copy)` }));

/** Script answers for one template up to its stored-content read: upsert, lookup, one channel-settings insert per channel, versions, contents. */
function templateScript(template: object, versions: object[], storedContents: object[]): unknown[][] {
  return [[], [template], ...TEMPLATE_FIXTURE.channels.map(() => []), versions, storedContents];
}

describe('baseline seed', () => {
  describe('bootstrapLayouts', () => {
    it('should publish the changed fixture as a new version over the one it seeded earlier', async () => {
      const { db, calls } = scriptedPostgres([[], [LAYOUT], [SEEDED_LAYOUT_V1]]);
      await bootstrapLayouts(db, PASSING_GATE);

      expect(written(calls, 'update')).toContainEqual(expect.objectContaining({ status: 'ARCHIVED' }));
      expect(written(calls, 'insert')).toContainEqual(expect.objectContaining({ layoutId: 1n, version: 2, status: 'PUBLISHED', body: DEFAULT_LAYOUT?.body }));
    });

    it('should archive whatever is PUBLISHED for the layout, as publishDraft does, rather than one version by id', async () => {
      const { db, calls } = scriptedPostgres([[], [LAYOUT], [SEEDED_LAYOUT_V1]]);
      await bootstrapLayouts(db, PASSING_GATE);

      expect(renderedWhere(calls.find(call => call.root === 'update'))).toEqual({
        sql: '("layout_versions"."layout_id" = $1 and "layout_versions"."status" = $2)',
        params: [1n, 'PUBLISHED'],
      });
    });

    it('should leave a layout alone once an operator has published their own version', async () => {
      const operatorV2 = { ...SEEDED_LAYOUT_V1, id: 11n, version: 2, notes: 'Rebrand', baselineHash: null };
      const { db, calls } = scriptedPostgres([[], [LAYOUT], [{ ...SEEDED_LAYOUT_V1, status: 'ARCHIVED' }, operatorV2]]);
      await bootstrapLayouts(db, PASSING_GATE);

      expect(calls.filter(call => call.root === 'update')).toHaveLength(0);
      expect(calls.filter(call => call.root === 'insert')).toHaveLength(1);
    });

    it('should withhold a fixture that fails its render gate', async () => {
      const { db, calls } = scriptedPostgres([[], [LAYOUT], [SEEDED_LAYOUT_V1]]);
      await bootstrapLayouts(db, FAILING_GATE);

      expect(calls.filter(call => call.root === 'update')).toHaveLength(0);
      expect(calls.filter(call => call.root === 'insert')).toHaveLength(1);
    });

    it('should log a failed supersede and carry on rather than fail the migration', async () => {
      const { db } = scriptedPostgres([[], [LAYOUT], [SEEDED_LAYOUT_V1]], { failTransactions: true });

      expect(await bootstrapLayouts(db, PASSING_GATE)).toBeUndefined();
    });
  });

  describe('bootstrapTemplates', () => {
    it('should supersede a seeded template with the fixture content, hashed, under the next version', async () => {
      const { db, calls } = scriptedPostgres([...templateScript(TEMPLATE, [SEEDED_TEMPLATE_V1], STALE_CONTENTS), [], [{ id: 51n }]]);
      await bootstrapTemplates(db, PASSING_GATE, [TEMPLATE_FIXTURE]);
      const inserts = written(calls, 'insert');

      expect(written(calls, 'update')).toEqual([expect.objectContaining({ status: 'ARCHIVED' })]);
      expect(inserts).toContainEqual(
        expect.objectContaining({ templateId: 5n, version: 2, status: 'PUBLISHED', baselineHash: hashTemplateContents(templateFixtureContents(TEMPLATE_FIXTURE)) }),
      );
      expect(inserts.at(-1)).toEqual(templateFixtureContents(TEMPLATE_FIXTURE).map(content => ({ templateVersionId: 51n, ...content })) as unknown as Record<string, unknown>);
    });

    it('should only stamp a seeded template whose stored content already matches the fixture', async () => {
      const { db, calls } = scriptedPostgres(templateScript(TEMPLATE, [SEEDED_TEMPLATE_V1], templateFixtureContents(TEMPLATE_FIXTURE)));
      await bootstrapTemplates(db, PASSING_GATE, [TEMPLATE_FIXTURE]);

      expect(written(calls, 'update')).toEqual([{ baselineHash: hashTemplateContents(templateFixtureContents(TEMPLATE_FIXTURE)) }]);
    });

    it('should withhold new content when the stored variable contract differs from the fixture', async () => {
      const edited = { ...TEMPLATE, variableSchema: { variables: { ...TEMPLATE_FIXTURE.variables, operatorAdded: { type: 'string', required: true } } } };
      const { db, calls } = scriptedPostgres(templateScript(edited, [SEEDED_TEMPLATE_V1], STALE_CONTENTS));
      await bootstrapTemplates(db, PASSING_GATE, [TEMPLATE_FIXTURE]);

      expect(calls.filter(call => call.root === 'update')).toHaveLength(0);
    });

    it('should withhold new content that fails its render gate', async () => {
      const { db, calls } = scriptedPostgres(templateScript(TEMPLATE, [SEEDED_TEMPLATE_V1], STALE_CONTENTS));
      await bootstrapTemplates(db, FAILING_GATE, [TEMPLATE_FIXTURE]);

      expect(calls.filter(call => call.root === 'update')).toHaveLength(0);
    });
  });

  describe('planBaselineStep', () => {
    const FIXTURE_HASH = hashBaseline({ body: 'current fixture' });
    const STALE_HASH = hashBaseline({ body: 'older fixture' });
    const version = (overrides: Partial<BaselineVersion>): BaselineVersion => ({ id: 1n, version: 1, status: 'PUBLISHED', baselineHash: STALE_HASH, ...overrides });
    const plan = (versions: BaselineVersion[], storedHash = STALE_HASH, contractChanged = false) => planBaselineStep(FIXTURE_HASH, versions, () => storedHash, { contractChanged });

    it('should create the first version when nothing is published', async () => {
      expect(await plan([])).toEqual({ action: 'create', version: 1 });
    });

    it('should supersede a seeded version whose fixture has changed, numbering past every existing version', async () => {
      const versions = [version({ id: 1n, version: 1, status: 'ARCHIVED', baselineHash: null }), version({ id: 2n, version: 2 })];

      expect(await plan(versions)).toEqual({ action: 'supersede', version: 3, publishedId: 2n });
    });

    it('should supersede a version seeded before hashes were recorded', async () => {
      expect(await plan([version({ baselineHash: 'legacy' })])).toEqual({ action: 'supersede', version: 2, publishedId: 1n });
    });

    it('should keep a version that already carries the fixture hash', async () => {
      expect(await plan([version({ baselineHash: FIXTURE_HASH })])).toEqual({ action: 'keep', reason: 'current' });
    });

    it('should never touch a version an operator published', async () => {
      expect(await plan([version({ baselineHash: null })], STALE_HASH)).toEqual({ action: 'keep', reason: 'operator-owned' });
      expect(await plan([version({ baselineHash: null })], FIXTURE_HASH)).toEqual({ action: 'keep', reason: 'operator-owned' });
    });

    it('should adopt a seeded version whose stored content already matches the fixture instead of republishing it', async () => {
      expect(await plan([version({ baselineHash: 'legacy' })], FIXTURE_HASH)).toEqual({ action: 'adopt', versionId: 1n });
    });

    it('should withhold the update while an operator draft is open', async () => {
      expect(await plan([version({}), version({ id: 2n, version: 2, status: 'DRAFT', baselineHash: null })])).toEqual({ action: 'keep', reason: 'draft-open' });
    });

    it('should withhold the update when the stored variable contract differs from the fixture', async () => {
      expect(await plan([version({})], STALE_HASH, true)).toEqual({ action: 'keep', reason: 'contract-changed' });
    });
  });

  describe('content hashing', () => {
    it('should hash template contents independently of channel order and absent optionals', () => {
      const email = { channel: 'EMAIL' as const, locale: 'en-ZZ', subject: 'Hi', body: '<p>Hi</p>', layoutKey: 'default' };
      const sms = { channel: 'SMS' as const, locale: 'en-ZZ', subject: null, body: 'Hi', layoutKey: null };

      expect(hashTemplateContents([email, sms])).toBe(hashTemplateContents([sms, email]));
      expect(hashTemplateContents([email])).not.toBe(hashTemplateContents([{ ...email, subject: 'Hello' }]));
    });

    it('should compare variable contracts independently of key order', () => {
      const fixture = { variables: { code: { type: 'string', required: true }, ttl: { type: 'number', required: false } } };
      const stored = { variables: { ttl: { required: false, type: 'number' }, code: { required: true, type: 'string' } } };

      expect(isSameContract(stored, fixture)).toBe(true);
      expect(isSameContract({ variables: { code: { type: 'string', required: true } } }, fixture)).toBe(false);
    });
  });

  describe('the fixture catalogue', () => {
    for (const layout of BASELINE_LAYOUTS) {
      it(`should render layout '${layout.layoutKey}' around probe content against sample data`, async () => {
        expect(await renderLayout(engine, layout.body, FIXTURE_DESIGN)).toBeUndefined();
      });
    }

    for (const fixture of BASELINE_TEMPLATES) {
      it(`should render every channel of '${fixture.templateKey}' with its layout and partials against its variables' sample values`, async () => {
        expect(await renderTemplate(engine, fixture, FIXTURE_DESIGN)).toBeUndefined();
      });
    }

    it('should exercise every partial through some template or layout render', () => {
      const sources = [...BASELINE_LAYOUTS.map(layout => layout.body), ...BASELINE_TEMPLATES.flatMap(fixture => fixture.channels.map(content => content.body))];

      for (const partial of BASELINE_PARTIALS) expect(sources.some(source => source.includes(`render '${partial.partialKey}'`))).toBe(true);
    });
  });

  describe('BaselineRenderGate', () => {
    const liveDesign = (): Promise<typeof FIXTURE_DESIGN> => Promise.resolve(FIXTURE_DESIGN);

    it('should pass a catalogue that renders and a real template', async () => {
      const gate = new BaselineRenderGate(engine, liveDesign, { layouts: [], partials: BASELINE_PARTIALS, templates: [TEMPLATE_FIXTURE] });

      expect(await gate.catalogueRenders()).toBe(true);
      expect(await gate.templateRenders(TEMPLATE_FIXTURE)).toBe(true);
    });

    it('should refuse a template that references an undeclared variable', async () => {
      const broken: TemplateFixture = { ...TEMPLATE_FIXTURE, channels: [{ channel: 'SMS', body: 'Code {{ undeclared }}' }] };
      const gate = new BaselineRenderGate(engine, liveDesign, { layouts: BASELINE_LAYOUTS, partials: BASELINE_PARTIALS, templates: [broken] });

      expect(await gate.templateRenders(broken)).toBe(false);
      expect(await gate.catalogueRenders()).toBe(false);
    });

    it('should refuse a layout that does not parse', async () => {
      const gate = new BaselineRenderGate(engine, liveDesign);

      expect(await gate.layoutRenders({ layoutKey: 'broken', name: 'Broken', description: '', body: '<html>{% if %}</html>' })).toBe(false);
    });
  });
});
