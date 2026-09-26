import { beforeAll, describe, expect, it } from 'bun:test';

import { runSequence } from './integrity-sequence';

/**
 * 200 seeded walks of 40 steps through the chapter lifecycle, one per test so each stays well inside the 50ms budget; a failure names its seed
 * and every step taken, and `runSequence(seed, STEPS)` replays it exactly.
 */
const FIRST_SEED = 1;
const SEQUENCES = 200;
const STEPS = 40;

describe('chapter integrity — seeded lifecycle sequences', () => {
  // The first walk otherwise pays for loading and compiling every service it touches, which is not the sequence's own time.
  beforeAll(() => runSequence(0, STEPS));

  for (let seed = FIRST_SEED; seed < FIRST_SEED + SEQUENCES; seed++) {
    it(`should keep every integrity invariant through sequence ${seed}`, async () => {
      const report = await runSequence(seed, STEPS);

      expect(report.steps.length).toBeGreaterThanOrEqual(STEPS);
    });
  }
});
