import { describe, expect, it } from 'bun:test';
import { PulseClient } from '@shadow-library/clients/pulse';
import { FakeServiceFetch, jsonResponse, type ServiceReply } from '@shadow-library/clients/testing';

import { HttpPulseTransport } from '@modules/notifications/pulse-transport';

const REQUEST = { templateKey: 'memoir.weekly-digest', email: 'reader@example.test', variables: { netAmount: 12 } };

function transportAnswering(reply: ServiceReply): { transport: HttpPulseTransport; pulse: FakeServiceFetch } {
  const pulse = new FakeServiceFetch(reply);
  return { transport: new HttpPulseTransport(new PulseClient(pulse.fetch)), pulse };
}

describe('HttpPulseTransport', () => {
  it('should send the template to the email recipient with the variables as payload', async () => {
    const { transport, pulse } = transportAnswering(() => jsonResponse(201, { status: 'ACCEPTED', channelResults: [] }));

    expect(await transport.send(REQUEST)).toBe('sent');
    expect(pulse.calls[0]?.body).toEqual({ templateKey: 'memoir.weekly-digest', recipients: { email: 'reader@example.test' }, payload: { netAmount: 12 } });
  });

  it('should report a refusal as rejected', async () => {
    const { transport } = transportAnswering(() => jsonResponse(400, { code: 'VALIDATION_ERROR' }));
    expect(await transport.send(REQUEST)).toBe('rejected');
  });

  it('should report an unreachable pulse as unavailable', async () => {
    const { transport } = transportAnswering(() => Promise.reject(new Error('Unable to connect')));
    expect(await transport.send(REQUEST)).toBe('unavailable');
  });
});
