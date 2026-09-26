import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { SortByTime, VolumeState } from '@server/common';
import { type Plan } from '@server/database';

@Schema()
export class VolumeProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class VolumeKeyParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  volumeKey: string;
}

@Schema()
export class VolumeResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field()
  volumeKey: string;

  @Field(() => Integer)
  ordinal: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field({ optional: true, nullable: true, description: 'The goal the volume works towards.' })
  objective?: string | null;

  @Field(() => Integer)
  revision: number;

  @Field({ optional: true, nullable: true, description: "The author's notes on the volume." })
  body?: string | null;

  @Field(() => VolumeState, { description: 'Where the story stands against the volume goal.' })
  state: Plan.VolumeState;

  @Field(() => Integer, { description: 'Computed on read from the chapters that carry this volume key — never stored.' })
  chapterCount: number;

  @Field(() => Integer, { optional: true, nullable: true, description: 'Lowest chapter number in the volume; null when it has none.' })
  firstChapter?: number | null;

  @Field(() => Integer, { optional: true, nullable: true, description: 'Highest chapter number in the volume; null when it has none.' })
  lastChapter?: number | null;

  @Field(() => Integer, { description: 'Sum of word counts across the volume’s chapters.' })
  wordCount: number;

  @Field(() => Integer, { description: 'Chapters this volume claims anywhere in the plan — final, drafted, or briefed only — so a not-yet-written chapter still places into it.' })
  planChapterCount: number;

  @Field(() => Integer, { optional: true, nullable: true, description: 'Lowest chapter number claimed anywhere in the plan; null when it has none.' })
  planFirstChapter?: number | null;

  @Field(() => Integer, { optional: true, nullable: true, description: 'Highest chapter number claimed anywhere in the plan; null when it has none.' })
  planLastChapter?: number | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListVolumesQuery extends PaginationQuery(SortByTime) {}

@Schema()
export class ListVolumeResponse extends Paginated(VolumeResponse) {}

@Schema()
export class VolumeAdvanceResponse {
  @Field(() => VolumeResponse, { description: 'The volume just marked goal met.' })
  completed: VolumeResponse;

  @Field(() => VolumeResponse, { optional: true, nullable: true, description: 'The next volume, now active — null if none was waiting to start.' })
  activated?: VolumeResponse | null;
}
