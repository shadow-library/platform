import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { utils } from '@shadow-library/common';
import { Get, HttpController, Params, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION } from '@server/constants';

import { AdminAccessService } from '@modules/actor';

import { WriterSnapshotService } from '../ai/writer-snapshot.service';
import { ChapterParams } from './generation.dto';
import { ListWriterSnapshotResponse, SnapshotParams, WriterSnapshotDetailResponse } from './writer-snapshot.dto';

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/chapters/:n/writer-snapshots')
export class WriterSnapshotController {
  constructor(
    private readonly writerSnapshots: WriterSnapshotService,
    private readonly adminAccess: AdminAccessService,
  ) {}

  @Get()
  @RespondFor(200, ListWriterSnapshotResponse)
  async list(@Params() params: ChapterParams): Promise<ListWriterSnapshotResponse> {
    const [items, showModels] = await Promise.all([this.writerSnapshots.list(params.projectId, params.n), this.adminAccess.canSeeModels()]);
    return { items: showModels ? items : items.map(item => utils.object.omitKeys(item, ['modelRoute'])) };
  }

  @Get('/:snapshotId')
  @RespondFor(200, WriterSnapshotDetailResponse)
  async get(@Params() params: SnapshotParams): Promise<WriterSnapshotDetailResponse> {
    const [snapshot, showModels] = await Promise.all([this.writerSnapshots.get(params.projectId, params.n, params.snapshotId), this.adminAccess.canSeeModels()]);
    return showModels ? snapshot : utils.object.omitKeys(snapshot, ['modelRoute']);
  }
}
