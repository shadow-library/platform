import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { setConfig } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { AppErrorCode } from '@server/classes';
import { RecoveryCodeService } from '@server/modules/auth/mfa/recovery-code.service';
import { RateLimiterService } from '@server/modules/infrastructure/security/rate-limiter.service';

import { fakeReply, withinRequest } from './request-context';

interface StoredCode {
  id: bigint;
  codeHash: string;
  lookupHash?: string | null;
  usedAt: Date | null;
}

const normalized = (code: string): string => code.toUpperCase().replace(/[^0-9A-Z]/g, '');

function recoveryCodes() {
  const stored: StoredCode[] = [];
  const insert = () => ({
    values: (rows: Omit<StoredCode, 'id' | 'usedAt'>[]) => (stored.push(...rows.map((row, index) => ({ ...row, id: BigInt(index + 1), usedAt: null }))), Promise.resolve()),
  });
  const tx = {
    select: () => ({ from: () => ({ where: () => Promise.resolve([{ generation: 0 }]) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
    insert,
  };
  const postgres = {
    transaction: (work: (handle: unknown) => Promise<unknown>) => work(tx),
    query: { recoveryCodes: { findMany: () => Promise.resolve(stored.filter(code => code.usedAt === null)) } },
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([{ id: 1n }]) }) }) }),
  };
  const databaseService = new FakeDatabaseService({ postgres });
  const service = new RecoveryCodeService(
    databaseService,
    { getPrimaryEmail: () => Promise.resolve(null) } as never,
    { record: () => Promise.resolve() } as never,
    {} as never,
    new RateLimiterService(databaseService),
  );
  return { service, stored };
}

describe('RecoveryCodeService', () => {
  let verify: ReturnType<typeof spyOn<typeof Bun.password, 'verify'>>;
  let hash: ReturnType<typeof spyOn<typeof Bun.password, 'hash'>>;

  beforeEach(() => {
    setConfig({ 'security.master-encryption-key': 'test-master-key', 'rate-limit.enabled': true, 'rate-limit.ip-allowlist': '' });
    hash = spyOn(Bun.password, 'hash').mockImplementation((password => Promise.resolve(`argon2:${String(password)}`)) as typeof Bun.password.hash);
    verify = spyOn(Bun.password, 'verify').mockImplementation(((password, stored) => Promise.resolve(stored === `argon2:${String(password)}`)) as typeof Bun.password.verify);
  });

  afterEach(() => {
    hash.mockRestore();
    verify.mockRestore();
  });

  it('should spend no argon2 verification on a wrong recovery code', async () => {
    const { service } = recoveryCodes();
    const codes = await service.generate(42n);

    expect(await service.consume(42n, 'WRONG-CODE0')).toBe(false);
    expect(verify).not.toHaveBeenCalled();

    expect(await service.consume(42n, codes[7] as string)).toBe(true);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('should still verify codes issued before the lookup hash existed', async () => {
    const { service, stored } = recoveryCodes();
    const codes = await service.generate(42n);
    for (const code of stored) code.lookupHash = null;

    expect(await service.consume(42n, (codes[2] as string).toLowerCase())).toBe(true);
    expect(verify.mock.calls.some(([password]) => password === normalized(codes[2] as string))).toBe(true);
  });

  it('should keep the argon2 hash as the stored proof and never store the code itself', async () => {
    const { service, stored } = recoveryCodes();
    const codes = await service.generate(42n);

    for (const [index, code] of stored.entries()) {
      expect(code.codeHash).toBe(`argon2:${normalized(codes[index] as string)}`);
      expect(code.lookupHash).toMatch(/^[0-9a-f]{64}$/);
      expect(code.lookupHash).not.toContain(normalized(codes[index] as string));
    }
  });

  it("should refuse a user's recovery codes after ten wrong ones, without verifying, and say when to retry", async () => {
    const { service } = recoveryCodes();
    const codes = await service.generate(42n);
    for (let attempt = 0; attempt < 10; attempt++) expect(await service.consume(42n, `WRONG-${attempt}`)).toBe(false);
    verify.mockClear();
    const reply = fakeReply();

    const refused = await withinRequest(() => service.consume(42n, codes[0] as string).catch((error: unknown) => error), reply);

    expect(AppError.is(refused, AppErrorCode.SEC_001)).toBe(true);
    expect(reply.headers.get('retry-after')).toBe('900');
    expect(verify).not.toHaveBeenCalled();
    expect(await service.consume(43n, 'WRONG-CODE0'), "another user's budget is untouched").toBe(false);
  });
});
