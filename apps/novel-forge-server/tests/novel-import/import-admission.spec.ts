import { describe, expect, it } from 'bun:test';
import { EventEmitter } from 'node:events';
import { HttpMethod } from '@shadow-library/fastify';

import { ImportAdmissionGuard } from '@modules/novel-import/import-admission.middleware';

interface FakeReply {
  headers: Record<string, string>;
  raw: EventEmitter;
  header(name: string, value: string): FakeReply;
}

function reply(): FakeReply {
  const fake: FakeReply = {
    headers: {},
    raw: new EventEmitter(),
    header(name, value) {
      fake.headers[name] = value;
      return fake;
    },
  };
  return fake;
}

type Admit = (request: unknown, reply: FakeReply) => Promise<void>;

function importAdmission(): Admit {
  const handler = new ImportAdmissionGuard().generate({ path: '/api/v1/import', method: HttpMethod.POST });
  if (!handler) throw new Error('the import route got no admission handler');
  return handler as unknown as Admit;
}

describe('ImportAdmissionGuard', () => {
  it('should guard the import route only', () => {
    const guard = new ImportAdmissionGuard();

    expect(guard.generate({ path: '/api/v1/import', method: HttpMethod.POST })).toBeDefined();
    expect(guard.generate({ path: '/api/v1/projects', method: HttpMethod.POST })).toBeUndefined();
  });

  it('should admit two imports at once and refuse a third with 429 and a Retry-After', async () => {
    const admit = importAdmission();
    const refused = reply();

    await admit({}, reply());
    await admit({}, reply());

    await expect(admit({}, refused)).rejects.toMatchObject({ code: 'IMP_001', status: 429 });
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('should admit another import once an admitted one has answered', async () => {
    const admit = importAdmission();
    const first = reply();
    await admit({}, first);
    await admit({}, reply());

    first.raw.emit('close');

    await expect(admit({}, reply())).resolves.toBeUndefined();
  });

  it('should free a permit once however often its response closes', async () => {
    const admit = importAdmission();
    const first = reply();
    await admit({}, first);
    first.raw.emit('close');
    first.raw.emit('close');

    await admit({}, reply());
    await admit({}, reply());

    await expect(admit({}, reply())).rejects.toMatchObject({ code: 'IMP_001' });
  });
});
