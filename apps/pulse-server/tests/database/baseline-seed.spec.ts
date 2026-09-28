import { describe, expect, it } from 'bun:test';

import { type PrimaryDatabase } from '@server/database';
import { BASELINE_LAYOUTS, type BaselineVersion, bootstrapLayouts, hashBaseline, hashTemplateContents, isSameContract, planBaselineStep } from '@server/database/seed';

interface RecordedCall {
  root: string;
  steps: { method: string; args: unknown[] }[];
}

/**
 * Records every query chain and answers each awaited one, in order, with the next scripted row set; a relational `findFirst` reads the
 * first row of its set. It runs no SQL, so the tests exercise the seed's decisions, not Postgres.
 */
function scriptedPostgres(results: unknown[][]): { db: PrimaryDatabase; calls: RecordedCall[] } {
  const queue = [...results];
  const calls: RecordedCall[] = [];
  const chain = (call: RecordedCall, first = false): object => {
    const proxy: object = new Proxy(() => undefined, {
      get: (_target, property) => {
        if (property === 'then') {
          return (resolve: (value: unknown) => unknown) => {
            const rows = queue.shift() ?? [];
            return Promise.resolve(first ? rows[0] : rows).then(resolve);
          };
        }
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
  const query = new Proxy({}, { get: (_target, table) => ({ findFirst: () => chain({ root: `query.${String(table)}`, steps: [] }, true) }) });
  const db = { select: root('select'), insert: root('insert'), update: root('update'), query, transaction: (work: (tx: object) => Promise<unknown>) => work(db) };
  return { db: db as unknown as PrimaryDatabase, calls };
}

function valuesOf(calls: RecordedCall[], root: string): Record<string, unknown>[] {
  return calls
    .filter(call => call.root === root)
    .flatMap(call => call.steps.filter(step => step.method === 'values' || step.method === 'set').map(step => step.args[0] as Record<string, unknown>));
}

const [DEFAULT_LAYOUT] = BASELINE_LAYOUTS;
const LAYOUT = { id: 1n, layoutKey: DEFAULT_LAYOUT?.layoutKey };
const SEEDED_V1 = { id: 10n, layoutId: 1n, version: 1, status: 'PUBLISHED', body: '<html>an older baseline</html>', notes: 'Baseline', editedBy: null, baselineHash: 'legacy' };

describe('baseline seed', () => {
  describe('bootstrapLayouts', () => {
    it('should publish the changed fixture as a new version over the one it seeded earlier', async () => {
      const { db, calls } = scriptedPostgres([[], [LAYOUT], [SEEDED_V1]]);
      await bootstrapLayouts(db);

      expect(valuesOf(calls, 'update')).toContainEqual(expect.objectContaining({ status: 'ARCHIVED' }));
      expect(valuesOf(calls, 'insert')).toContainEqual(expect.objectContaining({ layoutId: 1n, version: 2, status: 'PUBLISHED', body: DEFAULT_LAYOUT?.body }));
    });

    it('should leave a layout alone once an operator has published their own version', async () => {
      const operatorV2 = { ...SEEDED_V1, id: 11n, version: 2, notes: 'Rebrand', baselineHash: null };
      const { db, calls } = scriptedPostgres([[], [LAYOUT], [{ ...SEEDED_V1, status: 'ARCHIVED' }, operatorV2]]);
      await bootstrapLayouts(db);

      expect(calls.filter(call => call.root === 'update')).toHaveLength(0);
      expect(calls.filter(call => call.root === 'insert')).toHaveLength(1);
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
});
