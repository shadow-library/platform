/**
 * Importing npm packages
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { Module, ShadowFactory } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { setConfig } from '@shadow-library/common/testing';

/**
 * Importing user defined packages
 */
import { DatabaseModule, DatabaseService, type PostgresClient } from '@shadow-library/modules/database';

describe('Database Module', () => {
  const postgresMock = { execute: mock() } as unknown as PostgresClient;
  const postgresFactory = mock((): PostgresClient => postgresMock);

  const PIPELINING_FLAG = 'BUN_FEATURE_FLAG_DISABLE_SQL_AUTO_PIPELINING';
  const originalPipeliningFlag = process.env[PIPELINING_FLAG];

  const setPipeliningFlag = (value: string | undefined) => {
    if (value === undefined) delete process.env[PIPELINING_FLAG];
    else process.env[PIPELINING_FLAG] = value;
  };

  beforeAll(() => setPipeliningFlag('1'));

  afterAll(() => setPipeliningFlag(originalPipeliningFlag));

  beforeEach(() => {
    mock.clearAllMocks();
  });

  describe('Custom Factory (PostgresConfig)', () => {
    let databaseService: DatabaseService;

    @Module({
      imports: [
        DatabaseModule.forRoot({
          postgres: { factory: postgresFactory },
        }),
      ],
    })
    class PostgresAppModule {}

    beforeEach(async () => {
      const app = await ShadowFactory.create(PostgresAppModule);
      databaseService = app.get(DatabaseService);
    });

    it('should be defined', () => {
      expect(databaseService).toBeDefined();
    });

    it('should have postgres enabled', () => {
      expect(databaseService.isPostgresEnabled()).toBe(true);
    });

    it('should return the postgres client', () => {
      expect(databaseService.getPostgresClient()).toBe(postgresMock);
    });

    it('should have called the postgres factory', () => {
      expect(postgresFactory).toHaveBeenCalledTimes(1);
    });

    it('should pass prepare true to the factory by default', () => {
      expect(postgresFactory).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ prepare: true }));
    });

    it('should have redis disabled', () => {
      expect(databaseService.isRedisEnabled()).toBe(false);
    });

    it('should have memcache disabled', () => {
      expect(databaseService.isMemcacheEnabled()).toBe(false);
    });

    it('should throw when getting redis client while not enabled', () => {
      expect(() => databaseService.getRedisClient()).toThrow('Redis client is not initialized');
    });

    it('should throw when getting memcache client while not enabled', () => {
      expect(() => databaseService.getMemcacheClient()).toThrow('Memcached client is not initialized');
    });
  });

  describe('prepared statements', () => {
    const clientWithDriverPrepare = (prepare: boolean) => ({ execute: mock(), $client: { options: { prepare }, close: mock(async () => {}) } }) as unknown as PostgresClient;

    const createApp = (client: PostgresClient) => {
      @Module({ imports: [DatabaseModule.forRoot({ postgres: { factory: () => client } })] })
      class PrepareAppModule {}
      return ShadowFactory.create(PrepareAppModule);
    };

    it('should pass a configured prepare false to the factory', async () => {
      const factory = mock((): PostgresClient => clientWithDriverPrepare(false));
      const restoreConfig = setConfig({ 'database.postgres.prepare': false });
      try {
        @Module({ imports: [DatabaseModule.forRoot({ postgres: { factory } })] })
        class PrepareDisabledAppModule {}
        await ShadowFactory.create(PrepareDisabledAppModule);
      } finally {
        restoreConfig();
      }
      expect(factory).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ prepare: false }));
    });

    it('should boot when the driver honours the requested prepare option', async () => {
      const app = await createApp(clientWithDriverPrepare(true));
      expect(app.get(DatabaseService).isPostgresEnabled()).toBe(true);
    });

    it('should close the client and refuse to boot when the factory drops the prepare option', async () => {
      const client = clientWithDriverPrepare(false);
      await expect(createApp(client)).rejects.toThrow('Postgres factory ignored connection.prepare');
      expect((client as unknown as { $client: { close: ReturnType<typeof mock> } }).$client.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('auto-pipelining guard', () => {
    const factory = mock((): PostgresClient => postgresMock);
    const productionDeployment = { 'app.env': 'production', 'app.stage': 'prod' } as const;
    const localDevelopment = { 'app.env': 'development', 'app.stage': 'dev' } as const;

    const bootWith = async (flag: string | undefined, config: Parameters<typeof setConfig>[0]) => {
      const restoreConfig = setConfig(config);
      setPipeliningFlag(flag);
      try {
        @Module({ imports: [DatabaseModule.forRoot({ postgres: { factory } })] })
        class GuardedAppModule {}
        return await ShadowFactory.create(GuardedAppModule);
      } finally {
        setPipeliningFlag('1');
        restoreConfig();
      }
    };

    const captureDatabaseWarnings = () => {
      const warn = mock();
      const getLogger = Logger.getLogger.bind(Logger);
      const withWarn = (logger: Logger) => new Proxy(logger, { get: (target, key) => (key === 'warn' ? warn : Reflect.get(target, key)) });
      const spy = spyOn(Logger, 'getLogger').mockImplementation(((namespace: string, label: string) =>
        label === 'DatabaseService' ? withWarn(getLogger(namespace, label)) : getLogger(namespace, label)) as typeof Logger.getLogger);
      return { warn, restore: () => spy.mockRestore() };
    };

    it('should refuse to boot a production deployment without the flag', async () => {
      await expect(bootWith(undefined, productionDeployment)).rejects.toThrow(PIPELINING_FLAG);
      expect(factory).not.toHaveBeenCalled();
    });

    it('should refuse to boot a production deployment whose flag is set to a value Bun reads as off', async () => {
      await expect(bootWith('FALSE', productionDeployment)).rejects.toThrow(PIPELINING_FLAG);
    });

    it('should boot a production deployment with the flag set', async () => {
      const app = await bootWith('true', productionDeployment);
      expect(app.get(DatabaseService).isPostgresEnabled()).toBe(true);
    });

    it('should skip the check when prepared statements are off', async () => {
      const app = await bootWith(undefined, { ...productionDeployment, 'database.postgres.prepare': false });
      expect(app.get(DatabaseService).isPostgresEnabled()).toBe(true);
    });

    it('should only warn outside a production deployment', async () => {
      const { warn, restore } = captureDatabaseWarnings();
      try {
        const app = await bootWith(undefined, localDevelopment);
        expect(app.get(DatabaseService).isPostgresEnabled()).toBe(true);
      } finally {
        restore();
      }
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(PIPELINING_FLAG), { flag: PIPELINING_FLAG, value: null });
    });
  });

  describe('translateError', () => {
    let databaseService: DatabaseService;

    const customError = new Error('Duplicate entry');

    @Module({
      imports: [
        DatabaseModule.forRoot({
          postgres: {
            factory: postgresFactory,
            constraintErrorMap: {
              users_email_unique: customError,
            },
          },
        }),
      ],
    })
    class ErrorAppModule {}

    beforeEach(async () => {
      const app = await ShadowFactory.create(ErrorAppModule);
      databaseService = app.get(DatabaseService);
    });

    it('should translate a known constraint error', () => {
      const pgError = {
        errno: '23505',
        detail: 'Key (email)=(test@test.com) already exists.',
        severity: 'ERROR',
        schema: 'public',
        table: 'users',
        constraint: 'users_email_unique',
        file: 'nbtinsert.c',
        routine: '_bt_check_unique',
        code: 'ERR_POSTGRES_SERVER_ERROR' as const,
      };

      expect(() => databaseService.translateError(pgError)).toThrow(customError);
    });

    it('should throw InternalError for an unknown constraint', () => {
      const pgError = {
        errno: '23505',
        detail: 'Key (name)=(test) already exists.',
        severity: 'ERROR',
        schema: 'public',
        table: 'users',
        constraint: 'users_name_unique',
        file: 'nbtinsert.c',
        routine: '_bt_check_unique',
        code: 'ERR_POSTGRES_SERVER_ERROR' as const,
      };

      expect(() => databaseService.translateError(pgError)).toThrow('Unknown database error occurred');
    });

    it('should throw InternalError for a non-postgres error', () => {
      expect(() => databaseService.translateError(new Error('random error'))).toThrow('Unknown database error occurred');
    });

    it('should translate a nested constraint error (error.cause)', () => {
      const pgError = {
        errno: '23505',
        detail: 'Key (email)=(test@test.com) already exists.',
        severity: 'ERROR',
        schema: 'public',
        table: 'users',
        constraint: 'users_email_unique',
        file: 'nbtinsert.c',
        routine: '_bt_check_unique',
        code: 'ERR_POSTGRES_SERVER_ERROR' as const,
      };
      const wrappedError = new Error('Query failed', { cause: pgError });

      expect(() => databaseService.translateError(wrappedError)).toThrow(customError);
    });
  });

  describe('run', () => {
    let databaseService: DatabaseService;

    const mappedError = new Error('Email already exists');
    const pgError = {
      errno: '23505',
      detail: 'Key (email)=(test@test.com) already exists.',
      severity: 'ERROR',
      schema: 'public',
      table: 'users',
      constraint: 'users_email_unique',
      file: 'nbtinsert.c',
      routine: '_bt_check_unique',
      code: 'ERR_POSTGRES_SERVER_ERROR' as const,
    };

    @Module({
      imports: [
        DatabaseModule.forRoot({
          postgres: {
            factory: postgresFactory,
            constraintErrorMap: { users_email_unique: mappedError },
          },
        }),
      ],
    })
    class RunAppModule {}

    beforeEach(async () => {
      const app = await ShadowFactory.create(RunAppModule);
      databaseService = app.get(DatabaseService);
    });

    it('should return the operation result on success', async () => {
      const result = await databaseService.run(async () => 'query-result');
      expect(result).toBe('query-result');
    });

    it('should translate a constraint violation to the mapped error', async () => {
      await expect(databaseService.run(async () => Promise.reject(pgError))).rejects.toThrow(mappedError);
    });

    it('should translate an unknown failure to an internal error', async () => {
      await expect(databaseService.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('Unknown database error occurred');
    });
  });

  describe('forRootAsync', () => {
    let databaseService: DatabaseService;

    @Module({
      imports: [
        DatabaseModule.forRootAsync({
          useFactory: () => ({
            postgres: { factory: postgresFactory },
          }),
        }),
      ],
    })
    class AsyncAppModule {}

    beforeEach(async () => {
      const app = await ShadowFactory.create(AsyncAppModule);
      databaseService = app.get(DatabaseService);
    });

    it('should be defined', () => {
      expect(databaseService).toBeDefined();
    });

    it('should have postgres enabled', () => {
      expect(databaseService.isPostgresEnabled()).toBe(true);
    });

    it('should have called factory', () => {
      expect(postgresFactory).toHaveBeenCalledTimes(1);
    });
  });
});
