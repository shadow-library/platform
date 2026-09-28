import { afterEach, describe, expect, it } from 'bun:test';
import { EventEmitter } from 'node:events';
import { HttpMethod } from '@shadow-library/fastify';
import { type RestoreConfig, setConfig } from '@shadow-library/common/testing';

import { ImportAdmissionGuard } from '@modules/novel-import/import-admission.middleware';

class FakeStream extends EventEmitter {
  destroyed = false;

  destroy(): void {
    this.destroyed = true;
    this.emit('aborted');
    this.emit('close');
  }
}

interface FakeRequest {
  raw: FakeStream;
}

interface FakeReply {
  headers: Record<string, string>;
  raw: FakeStream;
  header(name: string, value: string): FakeReply;
}

function request(): FakeRequest {
  return { raw: new FakeStream() };
}

function reply(): FakeReply {
  const fake: FakeReply = {
    headers: {},
    raw: new FakeStream(),
    header(name, value) {
      fake.headers[name] = value;
      return fake;
    },
  };
  return fake;
}

type Admit = (request: FakeRequest, reply: FakeReply) => Promise<void>;

function importAdmission(): Admit {
  const handler = new ImportAdmissionGuard().generate({ path: '/api/v1/import', method: HttpMethod.POST });
  if (!handler) throw new Error('the import route got no admission handler');
  return handler as unknown as Admit;
}

/** The body fully arrives after admission: Bun also closes the request stream then, long before the handler answers. */
function receive(incoming: FakeRequest): void {
  incoming.raw.emit('end');
  incoming.raw.emit('close');
}

const elapse = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('ImportAdmissionGuard', () => {
  let restoreConfig: RestoreConfig | undefined;

  afterEach(() => {
    restoreConfig?.();
    restoreConfig = undefined;
  });

  it('should guard the import route only', () => {
    const guard = new ImportAdmissionGuard();

    expect(guard.generate({ path: '/api/v1/import', method: HttpMethod.POST })).toBeDefined();
    expect(guard.generate({ path: '/api/v1/projects', method: HttpMethod.POST })).toBeUndefined();
  });

  it('should admit two imports at once and refuse a third with 429 and a Retry-After', async () => {
    const admit = importAdmission();
    const refused = reply();

    await admit(request(), reply());
    await admit(request(), reply());

    await expect(admit(request(), refused)).rejects.toMatchObject({ code: 'IMP_001', status: 429 });
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('should hold the permit after the body is received until the response is sent', async () => {
    const admit = importAdmission();
    const first = request();
    const firstReply = reply();
    const second = request();
    await admit(first, firstReply);
    await admit(second, reply());
    receive(first);
    receive(second);

    await expect(admit(request(), reply())).rejects.toMatchObject({ code: 'IMP_001' });

    firstReply.raw.emit('finish');
    await expect(admit(request(), reply())).resolves.toBeUndefined();
  });

  it('should admit another import once an admitted one has closed its response', async () => {
    const admit = importAdmission();
    const first = reply();
    await admit(request(), first);
    await admit(request(), reply());

    first.raw.emit('close');

    await expect(admit(request(), reply())).resolves.toBeUndefined();
  });

  it('should return the permit when the client aborts its upload, which under Bun closes no response', async () => {
    const admit = importAdmission();
    const aborted = request();
    await admit(aborted, reply());
    await admit(request(), reply());

    aborted.raw.emit('aborted');

    await expect(admit(request(), reply())).resolves.toBeUndefined();
  });

  it('should return the permit when the request stream errors', async () => {
    const admit = importAdmission();
    const failed = request();
    await admit(failed, reply());
    await admit(request(), reply());

    failed.raw.emit('error', new Error('socket hang up'));

    await expect(admit(request(), reply())).resolves.toBeUndefined();
  });

  it('should release and destroy an upload whose body has not arrived by the receive deadline', async () => {
    restoreConfig = setConfig({ 'imports.receive-deadline-ms': 2 });
    const admit = importAdmission();
    const trickle = request();
    const whole = request();
    await admit(trickle, reply());
    await admit(whole, reply());
    receive(whole);

    await elapse(6);

    expect(trickle.raw.destroyed).toBe(true);
    await expect(admit(request(), reply())).resolves.toBeUndefined();
  });

  it('should keep the deadline off an upload whose body has arrived', async () => {
    restoreConfig = setConfig({ 'imports.receive-deadline-ms': 2 });
    const admit = importAdmission();
    const slowHandler = request();
    const other = request();
    await admit(slowHandler, reply());
    await admit(other, reply());
    receive(slowHandler);
    receive(other);

    await elapse(6);

    expect(slowHandler.raw.destroyed).toBe(false);
    await expect(admit(request(), reply())).rejects.toMatchObject({ code: 'IMP_001' });
  });

  it('should free a permit once however many of its release signals fire', async () => {
    const admit = importAdmission();
    const first = request();
    const firstReply = reply();
    await admit(first, firstReply);
    first.raw.emit('aborted');
    first.raw.emit('error', new Error('reset'));
    firstReply.raw.emit('finish');
    firstReply.raw.emit('close');

    await admit(request(), reply());
    await admit(request(), reply());

    await expect(admit(request(), reply())).rejects.toMatchObject({ code: 'IMP_001' });
  });
});
