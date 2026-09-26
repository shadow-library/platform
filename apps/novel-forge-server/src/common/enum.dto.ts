import { EnumType } from '@shadow-library/class-schema';
import { CONTENT_RATING_LEVELS, NOVEL_GENRES, NOVEL_TAGS } from '@shadow-library/sdk';

import { schema } from '@server/database';

import { CHAPTER_FILTERS } from './chapter-rows';

export const SortByTime = EnumType.create('SortByTime', ['createdAt', 'updatedAt']);
export const OwnerKind = EnumType.create('OwnerKind', schema.ownerKind.enumValues);
export const ProjectKind = EnumType.create('ProjectKind', schema.projectKind.enumValues);
export const ContentMode = EnumType.create('ContentMode', schema.contentMode.enumValues);
export const CostTier = EnumType.create('CostTier', schema.costTier.enumValues);
export const CostSource = EnumType.create('CostSource', schema.costSource.enumValues);
export const VolumeState = EnumType.create('VolumeState', schema.volumeState.enumValues);
export const KnowledgeStatus = EnumType.create('KnowledgeStatus', schema.knowledgeStatus.enumValues);
export const MilestoneKind = EnumType.create('MilestoneKind', schema.milestoneKind.enumValues);
export const MilestoneState = EnumType.create('MilestoneState', schema.milestoneState.enumValues);
export const ChapterStatus = EnumType.create('ChapterStatus', schema.chapterStatus.enumValues);
export const EntityType = EnumType.create('EntityType', schema.entityType.enumValues);
export const EntitySignificance = EnumType.create('EntitySignificance', schema.entitySignificance.enumValues);
export const EntityOrigin = EnumType.create('EntityOrigin', schema.entityOrigin.enumValues);
export const FactSource = EnumType.create('FactSource', schema.factSource.enumValues);
export const ThreadStatus = EnumType.create('ThreadStatus', schema.threadStatus.enumValues);
export const MysteryStatus = EnumType.create('MysteryStatus', schema.mysteryStatus.enumValues);
export const DraftStatus = EnumType.create('DraftStatus', schema.draftStatus.enumValues);
export const JudgeVerdict = EnumType.create('JudgeVerdict', schema.judgeVerdict.enumValues);
export const JobKind = EnumType.create('JobKind', schema.jobKind.enumValues);
export const JobStatus = EnumType.create('JobStatus', schema.jobStatus.enumValues);
export const JobEventType = EnumType.create('JobEventType', schema.jobEventType.enumValues);
export const BibleSection = EnumType.create('BibleSection', schema.bibleSection.enumValues);
export const DraftReviewStatus = EnumType.create('DraftReviewStatus', schema.draftReviewStatus.enumValues);
export const BriefWriteMode = EnumType.create('BriefWriteMode', schema.briefWriteMode.enumValues);
export const ChapterRowFilter = EnumType.create('ChapterRowFilter', [...CHAPTER_FILTERS]);
export const ChapterRowKind = EnumType.create('ChapterRowKind', ['written', 'planned']);
export const WorkflowRunStatus = EnumType.create('WorkflowRunStatus', schema.workflowRunStatus.enumValues);
export const DraftRevisionSource = EnumType.create('DraftRevisionSource', schema.draftRevisionSource.enumValues);
export const UserFeedbackDisposition = EnumType.create('UserFeedbackDisposition', schema.userFeedbackDisposition.enumValues);
export const ChatScope = EnumType.create('ChatScope', schema.chatScope.enumValues);
export const ChatSessionStatus = EnumType.create('ChatSessionStatus', schema.chatSessionStatus.enumValues);
export const ChatMode = EnumType.create('ChatMode', schema.chatMode.enumValues);
export const RefinementKind = EnumType.create('RefinementKind', schema.refinementKind.enumValues);
export const LedgerEntryKind = EnumType.create('LedgerEntryKind', schema.ledgerEntryKind.enumValues);
export const LedgerDecidedBy = EnumType.create('LedgerDecidedBy', schema.ledgerDecidedBy.enumValues);
export const PublicationStatus = EnumType.create('PublicationStatus', schema.publicationStatus.enumValues);
export const ChapterPublicationStatus = EnumType.create('ChapterPublicationStatus', schema.chapterPublicationStatus.enumValues);
export const PublicationVisibility = EnumType.create('PublicationVisibility', schema.publicationVisibility.enumValues);
export const PublicationGrantState = EnumType.create('PublicationGrantState', schema.publicationGrantState.enumValues);
export const RefinementProposalStatus = EnumType.create('RefinementProposalStatus', schema.refinementProposalStatus.enumValues);
export const ChatTurnOutcome = EnumType.create('ChatTurnOutcome', ['failed', 'cancelled']);
export const UndoDependentKind = EnumType.create('UndoDependentKind', ['plan', 'draft', 'knowledge', 'suggestion']);
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
