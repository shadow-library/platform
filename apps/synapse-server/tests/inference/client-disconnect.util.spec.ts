import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'bun:test';

import { watchClientDisconnect } from '@modules/inference/client-disconnect.util';

class FakeResponse extends EventEmitter {
  writableFinished = false;
  destroyed = false;
}

describe('watchClientDisconnect', () => {
  it('should report a response or a socket that closes before the answer finished', () => {
    for (const source of ['response', 'socket'] as const) {
      const response = new FakeResponse();
      const socket = new EventEmitter();
      let disconnects = 0;
      watchClientDisconnect({ response, socket }, () => disconnects++);

      (source === 'response' ? response : socket).emit('close');

      expect([source, disconnects]).toEqual([source, 1]);
    }
  });

  it('should ignore the connection closing after the answer finished', () => {
    const response = new FakeResponse();
    let disconnects = 0;
    watchClientDisconnect({ response }, () => disconnects++);

    response.writableFinished = true;
    response.emit('close');

    expect(disconnects).toBe(0);
  });

  it('should report at once a caller that hung up before watching began', () => {
    for (const source of ['response', 'socket'] as const) {
      const response = new FakeResponse();
      const socket = Object.assign(new EventEmitter(), { destroyed: source === 'socket' });
      response.destroyed = source === 'response';
      let disconnects = 0;

      watchClientDisconnect({ response, socket }, () => disconnects++);

      expect([source, disconnects]).toEqual([source, 1]);
    }
  });

  it('should stop listening to the keep-alive socket once the request ends', () => {
    const response = new FakeResponse();
    const socket = new EventEmitter();
    const stop = watchClientDisconnect({ response, socket }, () => undefined);

    stop();

    expect([response.listenerCount('close'), socket.listenerCount('close')]).toEqual([0, 0]);
  });
});
