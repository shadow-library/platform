/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { Module, ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule, DatabaseService, type PostgresClient } from '@shadow-library/modules/database';

describe('Database Module', () => {
  const postgresMock = { execute: mock() } as unknown as PostgresClient;
  const postgresFactory = mock((_config: unknown, _connection: unknown): PostgresClient => postgresMock);

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
