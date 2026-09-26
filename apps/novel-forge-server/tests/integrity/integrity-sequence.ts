import { IntegrityWorld, OPERATION_WEIGHTS } from './integrity-world';
import { SeededRandom } from './seeded-random';

export interface SequenceReport {
  seed: number;
  steps: string[];
}

/** Thrown with everything needed to replay a failure: `runSequence(seed, steps)` walks the same steps again. */
export class SequenceFailure extends Error {}

/** One seeded walk through the chapter lifecycle, every invariant checked after every step and after each late model answer. */
export async function runSequence(seed: number, steps: number): Promise<SequenceReport> {
  const world = new IntegrityWorld(new SeededRandom(seed));
  try {
    await world.checkInvariants();
    for (let step = 1; step <= steps; step++) {
      const operation = world.rng.weighted(OPERATION_WEIGHTS);
      world.log.push(`${step}. ${operation}: …`);
      world.log[world.log.length - 1] = `${step}. ${operation}: ${await world[operation]()}`;
      await world.checkInvariants();
    }
    await world.drain();
  } catch (error) {
    const reason = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    throw new SequenceFailure(`integrity sequence failed — replay with runSequence(${seed}, ${steps})\n${world.log.join('\n')}\n✗ ${reason}`);
  }
  return { seed, steps: world.log };
}
