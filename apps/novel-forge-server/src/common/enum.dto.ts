import { EnumType } from '@shadow-library/class-schema';
import { CONTENT_RATING_LEVELS, NOVEL_GENRES, NOVEL_TAGS } from '@shadow-library/sdk';

import { schema } from '@server/database';

export const SortByTime = EnumType.create('SortByTime', ['createdAt', 'updatedAt']);
export const OwnerKind = EnumType.create('OwnerKind', schema.ownerKind.enumValues);
export const ProjectKind = EnumType.create('ProjectKind', schema.projectKind.enumValues);
export const ProjectStatus = EnumType.create('ProjectStatus', schema.projectStatus.enumValues);
export const ContentMode = EnumType.create('ContentMode', schema.contentMode.enumValues);
export const ChapterStatus = EnumType.create('ChapterStatus', schema.chapterStatus.enumValues);
export const EntityType = EnumType.create('EntityType', schema.entityType.enumValues);
export const EntitySignificance = EnumType.create('EntitySignificance', schema.entitySignificance.enumValues);
export const EntityOrigin = EnumType.create('EntityOrigin', schema.entityOrigin.enumValues);
export const FactSource = EnumType.create('FactSource', schema.factSource.enumValues);
export const PlanStatus = EnumType.create('PlanStatus', schema.planStatus.enumValues);
export const ThreadStatus = EnumType.create('ThreadStatus', schema.threadStatus.enumValues);
export const MysteryStatus = EnumType.create('MysteryStatus', schema.mysteryStatus.enumValues);
export const DraftStatus = EnumType.create('DraftStatus', schema.draftStatus.enumValues);
export const JudgeVerdict = EnumType.create('JudgeVerdict', schema.judgeVerdict.enumValues);
export const JobKind = EnumType.create('JobKind', schema.jobKind.enumValues);
export const JobStatus = EnumType.create('JobStatus', schema.jobStatus.enumValues);
export const BibleSection = EnumType.create('BibleSection', schema.bibleSection.enumValues);
export const DraftReviewStatus = EnumType.create('DraftReviewStatus', schema.draftReviewStatus.enumValues);
export const BriefWriteMode = EnumType.create('BriefWriteMode', schema.briefWriteMode.enumValues);
export const WorkflowRunStatus = EnumType.create('WorkflowRunStatus', schema.workflowRunStatus.enumValues);
export const DraftRevisionSource = EnumType.create('DraftRevisionSource', schema.draftRevisionSource.enumValues);
export const UserFeedbackDisposition = EnumType.create('UserFeedbackDisposition', schema.userFeedbackDisposition.enumValues);
export const ChatScope = EnumType.create('ChatScope', schema.chatScope.enumValues);
export const ChatSessionStatus = EnumType.create('ChatSessionStatus', schema.chatSessionStatus.enumValues);
export const ChatMode = EnumType.create('ChatMode', schema.chatMode.enumValues);
export const RebrandStatus = EnumType.create('RebrandStatus', schema.rebrandStatus.enumValues);
export const RebrandConversionStatus = EnumType.create('RebrandConversionStatus', schema.rebrandConversionStatus.enumValues);
export const RebrandGlossaryCategory = EnumType.create('RebrandGlossaryCategory', schema.rebrandGlossaryCategory.enumValues);
export const ReforgeStatus = EnumType.create('ReforgeStatus', schema.reforgeStatus.enumValues);
export const ReforgeChapterStatus = EnumType.create('ReforgeChapterStatus', schema.reforgeChapterStatus.enumValues);
export const ReforgeFidelity = EnumType.create('ReforgeFidelity', schema.reforgeFidelity.enumValues);
export const ReforgeMode = EnumType.create('ReforgeMode', schema.reforgeMode.enumValues);
export const ReforgeAnalysisStatus = EnumType.create('ReforgeAnalysisStatus', schema.reforgeAnalysisStatus.enumValues);
export const ReforgeFindingType = EnumType.create('ReforgeFindingType', schema.reforgeFindingType.enumValues);
export const ReforgeFindingSource = EnumType.create('ReforgeFindingSource', schema.reforgeFindingSource.enumValues);
export const ReforgeSpanAction = EnumType.create('ReforgeSpanAction', schema.reforgeSpanAction.enumValues);
export const ReforgePlanStatus = EnumType.create('ReforgePlanStatus', schema.reforgePlanStatus.enumValues);
export const ReforgeOutputStatus = EnumType.create('ReforgeOutputStatus', schema.reforgeOutputStatus.enumValues);
export const ReforgeCutKind = EnumType.create('ReforgeCutKind', schema.reforgeCutKind.enumValues);
export const ReforgeCutDisposition = EnumType.create('ReforgeCutDisposition', schema.reforgeCutDisposition.enumValues);
export const TranslationPhase = EnumType.create('TranslationPhase', schema.translationPhase.enumValues);
export const TranslationGlossaryStatus = EnumType.create('TranslationGlossaryStatus', schema.translationGlossaryStatus.enumValues);
export const TranslationTreatment = EnumType.create('TranslationTreatment', schema.translationTreatment.enumValues);
export const TranslationGlossaryCategory = EnumType.create('TranslationGlossaryCategory', schema.translationGlossaryCategory.enumValues);
export const TranslationGlossaryOrigin = EnumType.create('TranslationGlossaryOrigin', schema.translationGlossaryOrigin.enumValues);
export const ChapterTranslationStatus = EnumType.create('ChapterTranslationStatus', schema.chapterTranslationStatus.enumValues);
export const RefinementKind = EnumType.create('RefinementKind', schema.refinementKind.enumValues);
export const PublicationStatus = EnumType.create('PublicationStatus', schema.publicationStatus.enumValues);
export const ChapterPublicationStatus = EnumType.create('ChapterPublicationStatus', schema.chapterPublicationStatus.enumValues);
export const PublicationVisibility = EnumType.create('PublicationVisibility', schema.publicationVisibility.enumValues);
export const PublicationGrantState = EnumType.create('PublicationGrantState', schema.publicationGrantState.enumValues);
export const RefinementProposalStatus = EnumType.create('RefinementProposalStatus', schema.refinementProposalStatus.enumValues);
export const ChatTurnOutcome = EnumType.create('ChatTurnOutcome', ['failed', 'cancelled']);
export const IllustrationSubjectType = EnumType.create('IllustrationSubjectType', schema.illustrationSubjectType.enumValues);
export const IllustrationStatus = EnumType.create('IllustrationStatus', schema.illustrationStatus.enumValues);
export const IllustrationSaveTarget = EnumType.create('IllustrationSaveTarget', ['portrait', 'gallery', 'chapter', 'cover']);
export const IllustrationOrigin = EnumType.create('IllustrationOrigin', ['generated', 'uploaded']);
export const IllustrationReferenceSource = EnumType.create('IllustrationReferenceSource', ['cover', 'portrait', 'gallery', 'chapter-image', 'candidate']);
export const IllustrationReferenceRole = EnumType.create('IllustrationReferenceRole', ['likeness', 'style', 'edit-source']);
export const IllustrationAttachableReferenceRole = EnumType.create('IllustrationAttachableReferenceRole', ['likeness', 'style']);
export const IllustrationReferenceOrigin = EnumType.create('IllustrationReferenceOrigin', ['auto', 'attached']);
export const IllustrationReferenceWarningCode = EnumType.create('IllustrationReferenceWarningCode', [
  'capacity-trimmed',
  'merged-with-edit-source',
  'missing-file',
  'too-large',
  'unsupported-format',
]);
export const AppearanceConfidenceLevel = EnumType.create('AppearanceConfidenceLevel', ['high', 'medium', 'low']);
export const NovelGenre = EnumType.create('NovelGenre', [...NOVEL_GENRES]);
export const NovelTag = EnumType.create('NovelTag', [...NOVEL_TAGS]);
export const SexualContentRating = EnumType.create('SexualContentRating', [...CONTENT_RATING_LEVELS.sexualContent]);
export const ViolenceRating = EnumType.create('ViolenceRating', [...CONTENT_RATING_LEVELS.violence]);
export const DarkContentRating = EnumType.create('DarkContentRating', [...CONTENT_RATING_LEVELS.darkContent]);
