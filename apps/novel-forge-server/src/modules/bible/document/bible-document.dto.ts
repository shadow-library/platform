import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { BibleSection } from '@server/common';
import { type Bible } from '@server/database';

@Schema()
export class BibleDocProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class BibleDocParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => BibleSection)
  section: Bible.Section;

  @Field()
  slug: string;
}

@Schema()
export class UpsertBibleDocBody {
  @Field(() => Object, { optional: true, additionalProperties: true, description: 'Author-authored YAML frontmatter with document-specific keys.' })
  frontmatter?: Record<string, unknown>;

  @Field({ optional: true })
  body?: string;
}

@Schema()
export class BibleDocListItem {
  @Field(() => BibleSection)
  section: Bible.Section;

  @Field()
  slug: string;

  @Field({ description: 'frontmatter.title, else the first "# " heading, else the slug read as words.' })
  title: string;

  @Field(() => Integer)
  wordCount: number;

  @Field()
  isEmpty: boolean;

  @Field({ optional: true, description: 'First prose sentence or two, omitted for an empty document.' })
  excerpt?: string;

  @Field({ description: 'The chapter writer never reads this page: a ref to it resolves to nothing in a writer pack. True of every planner-only page.' })
  writerExcluded: boolean;

  @Field({
    description:
      'Only planners read this page: it says what happens later in the book, and a chat turn that looks it up holds for review every change the chapter writer would read.',
  })
  plannerOnly: boolean;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListBibleDocResponse {
  @Field(() => [BibleDocListItem])
  docs: BibleDocListItem[];
}

@Schema()
export class BibleDocResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => BibleSection)
  section: Bible.Section;

  @Field()
  slug: string;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Author-authored YAML frontmatter with document-specific keys.' })
  frontmatter?: Record<string, unknown> | null;

  @Field({ optional: true, nullable: true })
  body?: string | null;

  @Field({ description: 'The chapter writer never reads this page: a ref to it resolves to nothing in a writer pack. True of every planner-only page.' })
  writerExcluded: boolean;

  @Field({
    description:
      'Only planners read this page: it says what happens later in the book, and a chat turn that looks it up holds for review every change the chapter writer would read.',
  })
  plannerOnly: boolean;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}
