/** A step that throws must not stop the steps after it, or a failure halfway through a fixture's setup would strand every resource the later steps own. */

export class HarnessTeardownError extends AggregateError {
  override readonly name = 'HarnessTeardownError';
}

export async function runAll(steps: (() => Promise<unknown>)[]): Promise<void> {
  const errors: unknown[] = [];
  for (const step of steps) await step().catch((error: unknown) => errors.push(error));
  if (errors.length > 0) throw new HarnessTeardownError(errors, `harness teardown failed in ${errors.length} step(s)`);
}
