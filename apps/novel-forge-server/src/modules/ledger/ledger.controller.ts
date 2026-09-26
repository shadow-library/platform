import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, Query, RespondFor } from '@shadow-library/fastify';

import { PROGRESS_TOPIC_PREFIX } from '@server/common';
import { PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';
import { type Ledger } from '@server/database';

import {
  CreateLedgerEntryBody,
  LedgerEntryParams,
  LedgerEntryResponse,
  LedgerProjectParams,
  LedgerTopicParams,
  ListLedgerEntriesResponse,
  ListLedgerQuery,
  SupersedeLedgerEntryBody,
  WithdrawLedgerEntryBody,
} from './ledger.dto';
import { AUTHOR_BRIEF_TOPIC } from './ledger-sections';
import { ledgerEntryStatus, LedgerService } from './ledger.service';

function toResponse(entry: Ledger.Entry): LedgerEntryResponse {
  return { ...entry, status: ledgerEntryStatus(entry) };
}

/** The Notebook view; an explicit `topics` filter opts back into these (the notes brief, the checklist's server-owned overrides). */
function isNotebookVisible(entry: Ledger.Entry): boolean {
  return entry.topic !== AUTHOR_BRIEF_TOPIC && !entry.topic.startsWith(PROGRESS_TOPIC_PREFIX);
}

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get()
  @RespondFor(200, ListLedgerEntriesResponse)
  async listActive(@Params() params: LedgerProjectParams, @Query() query: ListLedgerQuery): Promise<ListLedgerEntriesResponse> {
    const entries = await this.ledgerService.listActive(params.projectId, query);
    const visible = query.topics ? entries : entries.filter(isNotebookVisible);
    return { entries: visible.map(toResponse) };
  }

  @Get('/topics/:topic')
  @RespondFor(200, ListLedgerEntriesResponse)
  async history(@Params() params: LedgerTopicParams): Promise<ListLedgerEntriesResponse> {
    const entries = await this.ledgerService.history(params.projectId, params.topic);
    return { entries: entries.map(toResponse) };
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post()
  @RespondFor(201, LedgerEntryResponse)
  create(@Params() params: LedgerProjectParams, @Body() body: CreateLedgerEntryBody): Promise<LedgerEntryResponse> {
    return this.ledgerService.appendByAuthor(params.projectId, body).then(toResponse);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:entryId/supersede')
  @RespondFor(201, LedgerEntryResponse)
  supersede(@Params() params: LedgerEntryParams, @Body() body: SupersedeLedgerEntryBody): Promise<LedgerEntryResponse> {
    return this.ledgerService.supersedeByAuthor(params.projectId, params.entryId, body).then(toResponse);
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post('/:entryId/withdraw')
  @RespondFor(200, LedgerEntryResponse)
  withdraw(@Params() params: LedgerEntryParams, @Body() body: WithdrawLedgerEntryBody): Promise<LedgerEntryResponse> {
    return this.ledgerService.withdraw(params.projectId, params.entryId, body.reason).then(toResponse);
  }
}
