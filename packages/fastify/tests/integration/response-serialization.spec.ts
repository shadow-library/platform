/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Dispatcher, Module, ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { FastifyModule, FastifyRouter, Get, HttpController, HttpStatus, Post, RespondFor } from '@shadow-library/fastify';

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

@Schema()
class ConflictResponse {
  @Field()
  code: string;
}

const goalMet: GoalMetResponse = { completed: { id: 1n }, activated: { id: 2n }, supersedesId: 3n };

@HttpController('/api')
class VolumeController {
  @Post('/goal-met')
  @RespondFor(200, GoalMetResponse)
  @RespondFor(409, ConflictResponse)
  goalMet(): GoalMetResponse {
    return goalMet;
  }

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

  it('should answer a POST that declares one success and one error response with the success status', async () => {
    const response = await router.mockRequest().post('/api/goal-met');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ completed: { id: '1' }, activated: { id: '2' }, supersedesId: '3' });
  });

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

describe('response status declaration', () => {
  const boot = async (Controller: new () => object): Promise<void> => {
    @Module({ imports: [FastifyModule.forRoot({ controllers: [Controller] })] })
    class InvalidModule {}
    const app = await ShadowFactory.create(InvalidModule);
    await app.start().finally(() => app.stop());
  };

  it('should refuse to boot a route whose explicit status has no declared response', async () => {
    @HttpController('/api')
    class InvalidController {
      @Post('/created')
      @HttpStatus(201)
      @RespondFor(200, ConflictResponse)
      created(): ConflictResponse {
        return { code: 'ok' };
      }
    }

    await expect(boot(InvalidController)).rejects.toThrow(/POST \/api\/created answers 201/);
  });

  it('should refuse to boot a POST with several declared successes and no status', async () => {
    @HttpController('/api')
    class InvalidController {
      @Post('/ambiguous')
      @RespondFor(200, ConflictResponse)
      @RespondFor(202, ConflictResponse)
      ambiguous(): ConflictResponse {
        return { code: 'ok' };
      }
    }

    await expect(boot(InvalidController)).rejects.toThrow(/POST \/api\/ambiguous answers 201/);
  });
});
