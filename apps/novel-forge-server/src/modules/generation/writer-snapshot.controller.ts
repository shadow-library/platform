import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Get, HttpController, Params, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION } from '@server/constants';

import { WriterSnapshotService } from '../ai/writer-snapshot.service';
import { ChapterParams, ListWriterSnapshotResponse, SnapshotParams, WriterSnapshotDetailResponse } from './generation.dto';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/chapters/:n/writer-snapshots')
export class WriterSnapshotController {
  constructor(private readonly writerSnapshots: WriterSnapshotService) {}

  @Get()
  @RespondFor(200, ListWriterSnapshotResponse)
  async list(@Params() params: ChapterParams): Promise<ListWriterSnapshotResponse> {
    return { items: await this.writerSnapshots.list(params.projectId, params.n) };
  }

  @Get('/:snapshotId')
  @RespondFor(200, WriterSnapshotDetailResponse)
  get(@Params() params: SnapshotParams): Promise<WriterSnapshotDetailResponse> {
    return this.writerSnapshots.get(params.projectId, params.n, params.snapshotId);
  }
}
