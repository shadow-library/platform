import { EnumType } from '@shadow-library/class-schema';
import { CONTENT_RATING_LEVELS, NOVEL_GENRES, NOVEL_TAGS } from '@shadow-library/sdk';

export const NovelGenre = EnumType.create('NovelGenre', [...NOVEL_GENRES]);
export const NovelTag = EnumType.create('NovelTag', [...NOVEL_TAGS]);
export const SexualContentRating = EnumType.create('SexualContentRating', [...CONTENT_RATING_LEVELS.sexualContent]);
export const ViolenceRating = EnumType.create('ViolenceRating', [...CONTENT_RATING_LEVELS.violence]);
export const DarkContentRating = EnumType.create('DarkContentRating', [...CONTENT_RATING_LEVELS.darkContent]);
