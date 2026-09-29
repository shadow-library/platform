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

@Schema()
class ChapterResponse {
  @Field(() => String, { format: 'date-time' })
  draftedAt: Date;
}

@Schema()
class DatedVolumeResponse {
  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => [String])
  revisedAt: Date[];

  @Field(() => [ChapterResponse])
  chapters: ChapterResponse[];

  @Field(() => ChapterResponse)
  latest: ChapterResponse;
}

@Schema()
class DatedGoalMetResponse {
  @Field(() => DatedVolumeResponse, { nullable: true })
  activated: DatedVolumeResponse | null;

  @Field(() => String, { format: 'date-time', nullable: true })
  archivedAt: Date | null;
}

const goalMet: GoalMetResponse = { completed: { id: 1n }, activated: { id: 2n }, supersedesId: 3n };

const CREATED_AT = new Date('2026-09-01T10:00:00.000Z');
const REVISED_AT = new Date('2026-09-02T11:30:00.500Z');
const DRAFTED_AT = new Date('2026-09-03T12:45:00.000Z');
const ARCHIVED_AT = new Date('2026-09-04T08:15:00.000Z');
const datedGoalMet: DatedGoalMetResponse = {
  activated: { createdAt: CREATED_AT, revisedAt: [REVISED_AT], chapters: [{ draftedAt: DRAFTED_AT }], latest: { draftedAt: DRAFTED_AT } },
  archivedAt: ARCHIVED_AT,
};

const volumeRow = { completed: { id: 1n, contentHash: 'a1' }, activated: { id: 2n, contentHash: 'b2' }, supersedesId: null };
const datedVolumeRow = {
  activated: {
    createdAt: CREATED_AT,
    revisedAt: [REVISED_AT],
    chapters: [{ draftedAt: DRAFTED_AT, wordCount: 1200 }],
    latest: { draftedAt: DRAFTED_AT, wordCount: 1200 },
    contentHash: 'c3',
  },
  archivedAt: null,
};

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

  @Get('/dated-volume')
  @RespondFor(200, DatedGoalMetResponse)
  datedVolume(): DatedGoalMetResponse {
    return datedGoalMet;
  }

  @Get('/volume-row')
  @RespondFor(200, GoalMetResponse)
  volumeRow(): GoalMetResponse {
    return volumeRow;
  }

  @Get('/dated-volume-row')
  @RespondFor(200, DatedGoalMetResponse)
  datedVolumeRow(): DatedGoalMetResponse {
    return datedVolumeRow;
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

  it('should serialize dates held by a nullable object field, in its arrays and in its nested objects', async () => {
    const response = await router.mockRequest().get('/api/dated-volume');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      activated: {
        createdAt: CREATED_AT.toISOString(),
        revisedAt: [REVISED_AT.toISOString()],
        chapters: [{ draftedAt: DRAFTED_AT.toISOString() }],
        latest: { draftedAt: DRAFTED_AT.toISOString() },
      },
      archivedAt: ARCHIVED_AT.toISOString(),
    });
  });

  it('should drop the undeclared properties of an object held by a nullable object field', async () => {
    const response = await router.mockRequest().get('/api/volume-row');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ completed: { id: '1' }, activated: { id: '2' }, supersedesId: null });
  });

  it('should drop undeclared properties nested in the arrays and objects of a nullable object field', async () => {
    const response = await router.mockRequest().get('/api/dated-volume-row');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      activated: {
        createdAt: CREATED_AT.toISOString(),
        revisedAt: [REVISED_AT.toISOString()],
        chapters: [{ draftedAt: DRAFTED_AT.toISOString() }],
        latest: { draftedAt: DRAFTED_AT.toISOString() },
      },
      archivedAt: null,
    });
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
