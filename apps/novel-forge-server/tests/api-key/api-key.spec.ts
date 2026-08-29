import { createHash } from 'node:crypto';

import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { type AuthPrincipal } from '@shadow-library/auth';
import { AppError, Reflector } from '@shadow-library/common';
import { type ContextService, HttpMethod } from '@shadow-library/fastify';

import { API_KEY_ROUTE_METADATA, ApiKeyAuthenticated, ApiKeyGuard, ApiKeyService } from '@modules/api-key';
import { CURATE_PERMISSION } from '@server/constants';
import { schema } from '@server/database';
import { TEST_REGEX, TestEnvironment } from '@tests/test-environment';
import { TEST_ORG, TEST_USER, testIdP } from '@tests/test-idp';

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge');
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

/** A subject the mock IdP never grants `novel-forge:curate` to, so its keys exercise the denial path */
const UNENTITLED_OWNER = 99n;

testIdP.grantPermission({ kind: 'user', sub: TEST_USER.userId }, TEST_ORG, CURATE_PERMISSION);

const testEnv = new TestEnvironment('api_key_test');

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

interface StubbedContext {
  context: ContextService;
  written: AuthPrincipal[];
}

/** The guard is exercised outside any route here, so it gets a context that records rather than stores */
const stubContext = (existing: AuthPrincipal | null = null): StubbedContext => {
  const written: AuthPrincipal[] = [];
  const context = { getAuthPrincipalOrNull: () => existing, set: (_key: symbol, value: AuthPrincipal) => written.push(value) };
  return { context: context as unknown as ContextService, written };
};

type GuardHandler = (request: { headers: Record<string, unknown> }) => Promise<void>;

const guardHandler = (guard: ApiKeyGuard): GuardHandler =>
  guard.generate({ method: HttpMethod.POST, path: '/api/v1/ingest/things', [API_KEY_ROUTE_METADATA]: { authenticated: true } }) as unknown as GuardHandler;

describe('ApiKeyAuthenticated', () => {
  it('should write the forge-local route metadata the guard reads', () => {
    @ApiKeyAuthenticated()
    class IngestController {}

    // The framework's handler-metadata key is not exported, so the assertion goes through whatever key holds it.
    const written = Reflector.getMetadataKeys(IngestController)
      .map(key => Reflector.getMetadata(key, IngestController) as unknown)
      .find(value => typeof value === 'object' && value !== null && API_KEY_ROUTE_METADATA in value);

    expect(written).toEqual({ [API_KEY_ROUTE_METADATA]: { authenticated: true } });
  });
});

describe.if(pgAvailable)('API keys', () => {
  testEnv.init();

  const createKey = async (name = 'ingest'): Promise<{ id: string; secret: string; keyPrefix: string }> => {
    const response = await testEnv.getRouter().mockRequest().post('/api/v1/api-keys').body({ name });
    expect(response.statusCode).toBe(201);
    return response.json();
  };

  // Explicit ids: every test restarts from the template database, so the id sequence restarts too, and
  // the service's `lastUsedAt` throttle — keyed by an id that is unique for all time in production —
  // would otherwise suppress a write for a different key that happened to reuse the number.
  const insertKey = async (id: bigint, secret: string, ownerId = UNENTITLED_OWNER, name = 'theirs'): Promise<bigint> => {
    await testEnv
      .getPostgresClient()
      .insert(schema.apiKeys)
      .values({ id, name, keyPrefix: secret.slice(4, 12), keyHash: sha256(secret), ownerId, ownerOrgId: TEST_ORG });
    return id;
  };

  describe('POST /api/v1/api-keys', () => {
    it('should return the plaintext secret once and store only its hash', async () => {
      const created = await createKey('ingest-tool');
      expect(created.id).toMatch(TEST_REGEX.id);
      expect(created.secret).toStartWith('nfk_');
      expect(created.keyPrefix).toBe(created.secret.slice(4, 12));

      const stored = await testEnv.getPostgresClient().query.apiKeys.findFirst({ where: eq(schema.apiKeys.id, BigInt(created.id)) });
      expect(stored?.keyHash).toBe(sha256(created.secret));
      expect(stored?.ownerId).toBe(BigInt(TEST_USER.userId));
      expect(stored?.ownerOrgId).toBe(TEST_ORG);
      expect(Object.values(stored ?? {}).map(String)).not.toContain(created.secret);
    });

    it('should mint a distinct secret per key', async () => {
      const first = await createKey('one');
      const second = await createKey('two');
      expect(second.secret).not.toBe(first.secret);
    });
  });

  describe('GET /api/v1/api-keys', () => {
    it('should list only the caller own keys and never expose a secret', async () => {
      const created = await createKey('mine');
      await insertKey(900_001n, 'nfk_foreign');

      const response = await testEnv.getRouter().mockRequest().get('/api/v1/api-keys');
      expect(response.statusCode).toBe(200);
      const keys = response.json().keys as Record<string, unknown>[];
      expect(keys).toHaveLength(1);
      expect(keys[0]).toEqual({
        id: created.id,
        name: 'mine',
        keyPrefix: created.keyPrefix,
        createdAt: expect.stringMatching(TEST_REGEX.dateISO),
        lastUsedAt: null,
        revokedAt: null,
      });
    });
  });

  describe('DELETE /api/v1/api-keys/:id', () => {
    it('should revoke the caller own key and keep the row', async () => {
      const created = await createKey('doomed');
      const response = await testEnv.getRouter().mockRequest().delete(`/api/v1/api-keys/${created.id}`);
      expect(response.statusCode).toBe(204);

      const stored = await testEnv.getPostgresClient().query.apiKeys.findFirst({ where: eq(schema.apiKeys.id, BigInt(created.id)) });
      expect(stored?.revokedAt).toBeInstanceOf(Date);
    });

    it('should be idempotent', async () => {
      const created = await createKey('doomed-twice');
      await testEnv.getRouter().mockRequest().delete(`/api/v1/api-keys/${created.id}`);
      const again = await testEnv.getRouter().mockRequest().delete(`/api/v1/api-keys/${created.id}`);
      expect(again.statusCode).toBe(204);
    });

    it('should answer 404 for an unknown key and for another owner key alike', async () => {
      const foreignId = await insertKey(900_002n, 'nfk_foreign-2');

      const unknown = await testEnv.getRouter().mockRequest().delete('/api/v1/api-keys/999999');
      expect(unknown.statusCode).toBe(404);
      expect(unknown.json().code).toBe('KEY_004');

      const other = await testEnv.getRouter().mockRequest().delete(`/api/v1/api-keys/${foreignId}`);
      expect(other.statusCode).toBe(404);
      expect(other.json().code).toBe('KEY_004');
    });
  });

  describe('ApiKeyService.authenticate', () => {
    it('should resolve a valid secret to its key row', async () => {
      const created = await createKey('valid');
      const key = await testEnv.getService(ApiKeyService).authenticate(created.secret);
      expect(key.id).toBe(BigInt(created.id));
      expect(key.ownerId).toBe(BigInt(TEST_USER.userId));
    });

    it('should reject a malformed and an unknown secret with KEY_001', async () => {
      const service = testEnv.getService(ApiKeyService);
      await expect(service.authenticate('not-a-key')).rejects.toThrow(expect.objectContaining({ code: 'KEY_001' }));
      await expect(service.authenticate('nfk_absent')).rejects.toThrow(expect.objectContaining({ code: 'KEY_001' }));
    });

    it('should reject a revoked secret with KEY_002', async () => {
      const created = await createKey('revoked');
      await testEnv.getRouter().mockRequest().delete(`/api/v1/api-keys/${created.id}`);
      await expect(testEnv.getService(ApiKeyService).authenticate(created.secret)).rejects.toThrow(expect.objectContaining({ code: 'KEY_002' }));
    });

    it('should record lastUsedAt once and then throttle further writes', async () => {
      const secret = 'nfk_throttled';
      const id = await insertKey(900_004n, secret, BigInt(TEST_USER.userId), 'throttled');
      const service = testEnv.getService(ApiKeyService);
      const db = testEnv.getPostgresClient();

      await service.authenticate(secret);
      await Bun.sleep(100);
      const firstUse = await db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.id, id) });
      expect(firstUse?.lastUsedAt).toBeInstanceOf(Date);

      await db.update(schema.apiKeys).set({ lastUsedAt: null }).where(eq(schema.apiKeys.id, id));
      await service.authenticate(secret);
      await Bun.sleep(100);
      const secondUse = await db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.id, id) });
      expect(secondUse?.lastUsedAt).toBeNull();
    });
  });

  describe('ApiKeyService.assertOwnerPermitted', () => {
    it('should permit a key whose owner still holds the permission', async () => {
      const created = await createKey('permitted');
      const service = testEnv.getService(ApiKeyService);
      const key = await service.authenticate(created.secret);
      await expect(service.assertOwnerPermitted(key)).resolves.toBeUndefined();
    });

    it('should reject with KEY_003 when the owner holds no such permission', async () => {
      const foreignId = await insertKey(900_003n, 'nfk_unentitled', UNENTITLED_OWNER, 'unentitled');
      const key = await testEnv.getPostgresClient().query.apiKeys.findFirst({ where: eq(schema.apiKeys.id, foreignId) });
      await expect(testEnv.getService(ApiKeyService).assertOwnerPermitted(key as never)).rejects.toThrow(expect.objectContaining({ code: 'KEY_003' }));
    });
  });

  describe('ApiKeyGuard', () => {
    it('should attach only to routes carrying the api-key metadata', () => {
      const guard = new ApiKeyGuard(stubContext().context, testEnv.getService(ApiKeyService));
      expect(guard.generate({ method: HttpMethod.POST, path: '/api/v1/ingest/things' })).toBeUndefined();
      expect(guardHandler(guard)).toBeFunction();
    });

    it('should synthesize a user principal carrying the key owner and organisation', async () => {
      const created = await createKey('guarded');
      const { context, written } = stubContext();
      await guardHandler(new ApiKeyGuard(context, testEnv.getService(ApiKeyService)))({ headers: { 'x-api-key': created.secret } });

      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({ kind: 'user', sub: TEST_USER.userId, org: TEST_ORG, scopes: [] });
      expect(written[0]?.aal).toBeUndefined();
    });

    it('should reject a missing, malformed, unknown, or revoked key with a 401', async () => {
      const created = await createKey('guard-revoked');
      await testEnv.getRouter().mockRequest().delete(`/api/v1/api-keys/${created.id}`);
      const handler = guardHandler(new ApiKeyGuard(stubContext().context, testEnv.getService(ApiKeyService)));

      const codes: string[] = [];
      for (const headers of [{}, { 'x-api-key': ['a', 'b'] }, { 'x-api-key': 'nfk_absent' }, { 'x-api-key': created.secret }]) {
        const error = await handler({ headers }).catch((err: unknown) => err);
        expect(AppError.is(error)).toBe(true);
        codes.push((error as AppError).code);
      }
      expect(codes).toEqual(['KEY_001', 'KEY_001', 'KEY_001', 'KEY_002']);
    });

    it('should leave a principal the identity guard already resolved untouched', async () => {
      const created = await createKey('already-authenticated');
      const bearer: AuthPrincipal = { kind: 'user', sub: '7', scopes: ['a'], claims: {} };
      const { context, written } = stubContext(bearer);
      await guardHandler(new ApiKeyGuard(context, testEnv.getService(ApiKeyService)))({ headers: { 'x-api-key': created.secret } });
      expect(written).toHaveLength(0);
    });
  });
});
