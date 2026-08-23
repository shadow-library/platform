import '@server/bootstrap';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { eq } from 'drizzle-orm';
import { Dispatcher, Injectable, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Authenticated, RequireScope } from '@shadow-library/auth/module';
import { Field, Schema } from '@shadow-library/class-schema';
import { Config } from '@shadow-library/common';
import { FastifyModule, type FastifyRouter, Get, HttpController, RespondFor } from '@shadow-library/fastify';
import { DatabaseModule, DatabaseService } from '@shadow-library/modules';

import { AccountContext, MemoirAuthModule, OwnerScopedRepository } from '@server/modules/auth';
import { DatastoreModule, schema } from '@server/database';
import { createDatabaseFromTemplate, dropDatabase } from '@tests/fixtures/template-db';

import { AUDIENCE, idp, serviceToken, userToken } from '../test-idp';

@Schema()
class AccountIdDto {
  @Field()
  accountId!: string;
}

@Injectable()
class TestDeviceRepository extends OwnerScopedRepository {
  async listOwn(): Promise<unknown[]> {
    return this.scoped(schema.devices);
  }

  async listFor(accountId: bigint): Promise<unknown[]> {
    return this.forAccount(accountId).scoped(schema.devices);
  }
}

@HttpController('/api/v1/test')
@Authenticated()
@RequireScope('memoir:sync')
class DiagnosticsController {
  constructor(
    private readonly accountContext: AccountContext,
    private readonly devices: TestDeviceRepository,
  ) {}

  @Get('/account')
  @RespondFor(200, AccountIdDto)
  async whoAmI(): Promise<{ accountId: string }> {
    const accountId = this.accountContext.getAccountId();
    await this.devices.listOwn();
    return { accountId: String(accountId) };
  }
}

const TestHttpModule = FastifyModule.forRoot({
  imports: [MemoirAuthModule, DatabaseModule],
  controllers: [DiagnosticsController],
  providers: [TestDeviceRepository],
  exports: [TestDeviceRepository],
  host: 'localhost',
  port: 0,
});

@Module({ imports: [DatastoreModule, TestHttpModule] })
class TestAppModule {}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost:55433/shadow_memoir';
const baseUrl = baseConnectionString.replace(/\/[^/]*$/, '');
const databaseName = `${baseConnectionString.split('/').pop()}_account_context_spec`;

describe('Auth integration & owner scoping (T-09)', () => {
  let app: ShadowApplication;
  let router: FastifyRouter;
  let db: ReturnType<DatabaseService['getPostgresClient']>;

  beforeAll(async () => {
    await createDatabaseFromTemplate(databaseName);
    Config['cache'].set('database.postgres.url', `${baseUrl}/${databaseName}`);

    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as FastifyRouter;
    db = app.get(DatabaseService).getPostgresClient();
  });

  afterAll(async () => {
    await app.stop();
    await dropDatabase(databaseName);
  });

  async function whoAmI(bearer: string) {
    return router
      .mockRequest()
      .get('/api/v1/test/account')
      .headers({ authorization: `Bearer ${bearer}` });
  }

  it('should resolve a valid token to an account, creating it exactly once under concurrency', async () => {
    const sub = 'concurrent-first-contact-sub';
    const bearer = await userToken(sub);

    const [first, second] = await Promise.all([whoAmI(bearer), whoAmI(bearer)]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().accountId).toBe(second.json().accountId);

    const rows = await db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, sub));
    expect(rows).toHaveLength(1);
  });

  it('should reject a token minted for the wrong audience with 401', async () => {
    const bearer = await idp.issueToken({ sub: 'wrong-audience-sub', kind: 'user', audience: 'api://someone-else', scopes: ['memoir:sync'] });
    const response = await whoAmI(bearer);
    expect(response.statusCode).toBe(401);
  });

  it('should reject a token minted by the wrong issuer with 401', async () => {
    const bearer = await idp.issueToken({
      sub: 'wrong-issuer-sub',
      kind: 'user',
      audience: AUDIENCE,
      scopes: ['memoir:sync'],
      claims: { iss: 'https://not-our-identity.example' },
    });
    const response = await whoAmI(bearer);
    expect(response.statusCode).toBe(401);
  });

  it('should reject an expired token with 401', async () => {
    const bearer = await idp.issueToken({ sub: 'expired-sub', kind: 'user', audience: AUDIENCE, scopes: ['memoir:sync'], ttlSeconds: -60 });
    const response = await whoAmI(bearer);
    expect(response.statusCode).toBe(401);
  });

  it('should reject a service-typed token on a user route', async () => {
    const bearer = await serviceToken();
    const response = await whoAmI(bearer);
    expect(response.statusCode).toBe(403);
  });

  it('should refuse traffic once the account enters a non-none deletion state', async () => {
    const sub = 'deleting-account-sub';
    const bearer = await userToken(sub);
    expect((await whoAmI(bearer)).statusCode).toBe(200);

    await db.update(schema.accounts).set({ deletionState: 'pending' }).where(eq(schema.accounts.identitySub, sub));

    const response = await whoAmI(bearer);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'ACC_002' });
  });

  it('should throw when an OwnerScopedRepository is used without a resolved account context', async () => {
    const repository = app.get(TestDeviceRepository);
    await expect(repository.listOwn()).rejects.toThrow();
  });

  it('should let a machine principal read another account explicitly via forAccount', async () => {
    const sub = 'machine-read-sub';
    await whoAmI(await userToken(sub));

    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.identitySub, sub));
    expect(account).toBeDefined();

    const repository = app.get(TestDeviceRepository);
    await expect(repository.listFor(account!.id)).resolves.toEqual([]);
  });
});
