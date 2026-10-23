import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { utils } from '@lib/utils';

describe('Temporal Utils', () => {
  let setTimeoutSpy: ReturnType<typeof spyOn>;

  afterEach(() => setTimeoutSpy.mockRestore());
  beforeEach(() => (setTimeoutSpy = spyOn(global, 'setTimeout').mockImplementation(((callback: () => void) => callback()) as any)));

  describe('sleep', () => {
    it('should call setTimeout with the correct duration in milliseconds by default', async () => {
      const duration = 100;
      await utils.temporal.sleep(duration);

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), duration);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    });

    it('should call setTimeout with the correct duration when unit is "ms"', async () => {
      const duration = 150;
      await utils.temporal.sleep(duration, 'ms');

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), duration);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    });

    it('should call setTimeout with the correct duration in milliseconds when unit is "s"', async () => {
      const duration = 2;
      await utils.temporal.sleep(duration, 's');

      const expectedMs = duration * 1000;
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), expectedMs);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    });

    it('should call setTimeout with the correct duration in milliseconds when unit is "m"', async () => {
      const duration = 0.5;
      await utils.temporal.sleep(duration, 'm');

      const expectedMs = duration * 60 * 1000;
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), expectedMs);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    });

    it('should call setTimeout with the correct duration in milliseconds when unit is "h"', async () => {
      const duration = 0.1;
      await utils.temporal.sleep(duration, 'h');

      const expectedMs = duration * 60 * 60 * 1000;
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), expectedMs);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    });

    it('should call setTimeout with zero duration', async () => {
      await utils.temporal.sleep(0);

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    });

    it('should return a Promise that resolves to void', async () => {
      const result = await utils.temporal.sleep(1);
      expect(result).toBeUndefined();
    });

    it('should support multiple concurrent sleep operations', async () => {
      const promises = [utils.temporal.sleep(100), utils.temporal.sleep(150), utils.temporal.sleep(200)];

      await Promise.all(promises);

      expect(setTimeoutSpy).toHaveBeenCalledTimes(3);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 150);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 200);
    });
  });
});
