import { EnumType, Field, Schema } from '@shadow-library/class-schema';

import { BibleSection, EntityType } from '@server/common';
import { type Bible, type Knowledge } from '@server/database';

import { TIDY_KINDS, type TidyKind } from './bible-tidy';

const BibleTidyKind = EnumType.create('BibleTidyKind', [...TIDY_KINDS]);

@Schema()
export class BibleTidyItem {
  @Field({ description: 'Pins the content the change was computed from; send it back to apply the change.' })
  id: string;

  @Field(() => BibleTidyKind)
  kind: TidyKind;

  @Field(() => BibleSection, { description: 'Section of the document the change comes from.' })
  section: Bible.Section;

  @Field()
  slug: string;

  @Field({ description: 'The document title as the Story Bible shows it now.' })
  docTitle: string;

  @Field({ optional: true, description: 'retitle: the stored title being replaced.' })
  currentTitle?: string;

  @Field({ optional: true, description: 'retitle: the title the document would get.' })
  proposedTitle?: string;

  @Field({ optional: true, description: 'split: key of the entity record that would be created.' })
  entityKey?: string;

  @Field({ optional: true, description: 'split: name of the entity record that would be created.' })
  entityName?: string;

  @Field(() => EntityType, { optional: true, description: 'split: the suggested entity type; the author may pick another when applying.' })
  entityType?: Knowledge.EntityType;

  @Field({ optional: true, description: 'split: the entity body; move_ai_notes: the note being moved.' })
  text?: string;

  @Field({ optional: true, description: 'move_ai_notes: slug of the notes-for-the-AI document the note moves into.' })
  targetSlug?: string;
}

@Schema()
export class BibleTidyPreviewResponse {
  @Field(() => [BibleTidyItem])
  items: BibleTidyItem[];
}

@Schema()
export class BibleTidySelection {
  @Field()
  id: string;

  @Field(() => EntityType, { optional: true, description: 'split only: overrides the suggested entity type.' })
  entityType?: Knowledge.EntityType;
}

@Schema()
export class ApplyBibleTidyBody {
  @Field(() => [BibleTidySelection], { minItems: 1, description: 'The preview items to apply; everything left out stays as it is.' })
  items: BibleTidySelection[];
}
