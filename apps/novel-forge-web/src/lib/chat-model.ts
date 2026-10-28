import { type ContentMode, type CostTier } from './apis/api-types.gen';
import { contentModeLabel, formatUsd, tierLabel } from './usage';

export const UNRESTRICTED_UNAVAILABLE = 'AI_024';

export interface ModelTagInput {
  /** The model's name, which the server sends to admins only. */
  model?: string;
  contentMode?: ContentMode | null;
  /** The pace the reply ran at, a Think deeper reply's included. */
  costTier?: CostTier | null;
  costUsd?: number | null;
}

export function modelTagParts({ model, contentMode, costTier, costUsd }: ModelTagInput): string[] {
  const parts: string[] = [];
  if (model) parts.push(model);
  if (costTier) parts.push(tierLabel(costTier));
  if (contentMode === 'unrestricted') parts.push(contentModeLabel(contentMode));
  if (typeof costUsd === 'number') parts.push(formatUsd(costUsd));
  return parts;
}

export interface ReplyOptions {
  thinkDeeper: boolean;
  unrestricted: boolean;
}

export const NO_REPLY_OPTIONS: ReplyOptions = { thinkDeeper: false, unrestricted: false };

export interface NovelAiSettings {
  costTier: CostTier;
  contentMode: ContentMode;
  unrestrictedAvailable: boolean;
}

export type ReplyOptionOffer = ReplyOptions;

/** Which one-shot options a reply can take: none until the novel and the catalog are known. */
export function replyOptionOffer(novel: NovelAiSettings | undefined): ReplyOptionOffer {
  if (!novel) return NO_REPLY_OPTIONS;
  return { thinkDeeper: novel.costTier !== 'performant', unrestricted: novel.unrestrictedAvailable && novel.contentMode === 'standard' };
}

export interface ReplyOptionsBody {
  costTier?: CostTier;
  contentMode?: ContentMode;
}

/** What the turn body carries for the options: only those still on offer when the reply is sent, so a queued message never asks for one that has gone. */
export function replyOptionsBody(options: ReplyOptions | undefined, offer: ReplyOptionOffer): ReplyOptionsBody {
  const body: ReplyOptionsBody = {};
  if (options?.thinkDeeper && offer.thinkDeeper) body.costTier = 'performant';
  if (options?.unrestricted && offer.unrestricted) body.contentMode = 'unrestricted';
  return body;
}

export function replyOptionsLabel(options: ReplyOptions, offer: ReplyOptionOffer): string {
  const on = [options.thinkDeeper && offer.thinkDeeper && 'Think deeper', options.unrestricted && offer.unrestricted && 'Unrestricted'].filter(Boolean);
  return on.length > 0 ? on.join(' · ') : 'Reply options';
}

/** A send the server refused for Unrestricted hands its options back without it, since asking again would be refused again. */
export function restoredReplyOptions(options: ReplyOptions | undefined, errorCode: string | undefined): ReplyOptions {
  if (!options) return NO_REPLY_OPTIONS;
  return errorCode === UNRESTRICTED_UNAVAILABLE ? { ...options, unrestricted: false } : options;
}
