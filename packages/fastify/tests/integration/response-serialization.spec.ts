/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Dispatcher, Module, ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { FastifyModule, FastifyRouter, Get, HttpController, RespondFor } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
class VolumeResponse {
  @Field(() => String)
  id: bigint;
}

@Schema()
class GoalMetResponse {
  @Field(() => VolumeResponse)
  completed: VolumeResponse;

  @Field(() => VolumeResponse, { nullable: true })
  activated: VolumeResponse | null;

  @Field(() => String, { nullable: true })
  supersedesId: bigint | null;
}

const goalMet: GoalMetResponse = { completed: { id: 1n }, activated: { id: 2n }, supersedesId: 3n };

@HttpController('/api')
class VolumeController {
  @Get('/volume')
  @RespondFor(200, GoalMetResponse)
  volume(): GoalMetResponse {
    return goalMet;
  }

  @Get('/untyped')
  untyped(): object {
    return { ids: [4n, 5n], nested: { id: 6n } };
  }
}

@Module({ imports: [FastifyModule.forRoot({ controllers: [VolumeController] })] })
class VolumeModule {}

describe('response serialization', () => {
  let app: ShadowApplication;
  let router: FastifyRouter;

  beforeAll(async () => {
    app = await ShadowFactory.create(VolumeModule).then(app => app.start());
    router = app.get(Dispatcher) as FastifyRouter;
  });

  afterAll(() => app.stop());

  it('should serialize bigints held by nullable object and nullable string fields', async () => {
    const response = await router.mockRequest().get('/api/volume');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ completed: { id: '1' }, activated: { id: '2' }, supersedesId: '3' });
  });

  it('should serialize bigints in a response that declares no schema', async () => {
    const response = await router.mockRequest().get('/api/untyped');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ ids: ['4', '5'], nested: { id: '6' } });
  });
});
