/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { Module, ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatabaseModule, DatabaseService, type DrizzleClient } from '@shadow-library/modules/database';

describe('Database Module', () => {
  const drizzleMock = { execute: mock() } as unknown as DrizzleClient;
  const drizzleFactory = mock((): DrizzleClient => drizzleMock);
  const drizzleDriverFactory = mock((): DrizzleClient => drizzleMock);

  beforeEach(() => {
    mock.clearAllMocks();
  });

  describe('Custom Factory (CustomPostgresConfig)', () => {
    let databaseService: DatabaseService;

    @Module({
      imports: [
        DatabaseModule.forRoot({
          postgres: { type: 'custom', factory: drizzleFactory },
        }),
      ],
    })
    class DrizzleAppModule {}

    beforeEach(async () => {
      const app = await ShadowFactory.create(DrizzleAppModule);
      databaseService = app.get(DatabaseService);
    });

    it('should be defined', () => {
      expect(databaseService).toBeDefined();
    });

    it('should have drizzle enabled', () => {
      expect(databaseService.isDrizzleEnabled()).toBe(true);
    });

    it('should return the drizzle client', () => {
      expect(databaseService.getDrizzleClient()).toBe(drizzleMock);
    });

    it('should have called the drizzle factory', () => {
      expect(drizzleFactory).toHaveBeenCalledTimes(1);
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
            type: 'custom',
            factory: drizzleFactory,
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
            postgres: { type: 'custom' as const, factory: drizzleFactory },
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

    it('should have drizzle enabled', () => {
      expect(databaseService.isDrizzleEnabled()).toBe(true);
    });

    it('should have called factory', () => {
      expect(drizzleFactory).toHaveBeenCalledTimes(1);
    });
  });

  describe('Built-in Driver (DrizzleDriverPostgresConfig)', () => {
    let databaseService: DatabaseService;

    mock.module('drizzle-orm/bun-sql', () => ({ drizzle: drizzleDriverFactory }));

    @Module({
      imports: [
        DatabaseModule.forRoot({
          postgres: { type: 'bun-sql', schema: { users: {} }, url: 'postgres://localhost:5432/test-driver' },
        }),
      ],
    })
    class DriverAppModule {}

    beforeEach(async () => {
      const app = await ShadowFactory.create(DriverAppModule);
      databaseService = app.get(DatabaseService);
    });

    it('should be defined', () => {
      expect(databaseService).toBeDefined();
    });

    it('should have drizzle enabled', () => {
      expect(databaseService.isDrizzleEnabled()).toBe(true);
    });

    it('should return the drizzle client', () => {
      expect(databaseService.getDrizzleClient()).toBe(drizzleMock);
    });

    it('should have called the driver drizzle function with correct connection and schema', () => {
      expect(drizzleDriverFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: { users: {} },
          connection: 'postgres://localhost:5432/test-driver',
        }),
      );
    });
  });

  describe('Built-in Driver with connection options', () => {
    let databaseService: DatabaseService;

    mock.module('drizzle-orm/bun-sql', () => ({ drizzle: drizzleDriverFactory }));

    @Module({
      imports: [
        DatabaseModule.forRoot({
          postgres: { type: 'bun-sql', schema: { users: {} }, url: 'postgres://localhost:5432/test-driver', connection: { max: 10 } },
        }),
      ],
    })
    class DriverOptionsAppModule {}

    beforeEach(async () => {
      const app = await ShadowFactory.create(DriverOptionsAppModule);
      databaseService = app.get(DatabaseService);
    });

    it('should have drizzle enabled', () => {
      expect(databaseService.isDrizzleEnabled()).toBe(true);
    });

    it('should have merged connection options with url', () => {
      expect(drizzleDriverFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: { users: {} },
          connection: { url: 'postgres://localhost:5432/test-driver', max: 10 },
        }),
      );
    });
  });
});
