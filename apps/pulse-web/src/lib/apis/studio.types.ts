/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type MessageType, type NotificationChannel, type Priority, type SortByTime, type SortOrder } from './api-types.gen';

/**
 * Defining types
 */
export type VersionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type TemplateVariableType = 'string' | 'number' | 'boolean';

export interface TemplateVariable {
  type: TemplateVariableType;
  required: boolean;
  description?: string;
  example?: string;
}

export interface TemplateVariableSchema {
  variables: Record<string, TemplateVariable>;
}

export interface TemplateResponse {
  id: string;
  templateKey: string;
  name: string;
  messageType: MessageType;
  priority: Priority;
  description?: string;
  category?: string;
  variableSchema: TemplateVariableSchema;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelSettingResponse {
  templateId: string;
  channel: NotificationChannel;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateDetailResponse extends TemplateResponse {
  channels: ChannelSettingResponse[];
}

export interface ListTemplateResponse {
  items: TemplateResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListTemplatesQueryParams {
  key?: string;
  messageType?: MessageType;
  limit?: number | string;
  offset?: number | string;
  sortBy?: SortByTime;
  sortOrder?: SortOrder;
}

export interface CreateTemplateBody {
  templateKey: string;
  name: string;
  messageType: MessageType;
  priority?: Priority;
  description?: string;
  category?: string;
  variableSchema?: TemplateVariableSchema;
  isActive?: boolean;
}

export interface UpdateTemplateBody {
  name?: string;
  description?: string;
  messageType?: MessageType;
  priority?: Priority;
  category?: string;
  variableSchema?: TemplateVariableSchema;
  isActive?: boolean;
}

export interface UpdateChannelSettingBody {
  isEnabled: boolean;
}

export interface UpdateChannelSettingVariables extends UpdateChannelSettingBody {
  channel: NotificationChannel;
}

export interface VersionResponse {
  version: number;
  status: VersionStatus;
  notes?: string;
  editedBy?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentResponse {
  channel: NotificationChannel;
  locale: string;
  subject?: string;
  body: string;
  layoutKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VersionDetailResponse extends VersionResponse {
  contents: ContentResponse[];
}

export interface ListVersionResponse {
  items: VersionResponse[];
}

export interface UpsertContentBody {
  channel: NotificationChannel;
  locale?: string;
  subject?: string;
  body: string;
  layoutKey?: string;
}

export interface DeleteContentVariables {
  channel: NotificationChannel;
  locale: string;
}

export interface PublishVersionBody {
  notes?: string;
}

export interface RollbackVersionBody {
  notes?: string;
}

export interface PreviewBody {
  channel: NotificationChannel;
  locale?: string;
  data?: Record<string, unknown>;
}

export interface PreviewResponse {
  subject?: string | null;
  body: string;
}

export interface LayoutResponse {
  id: string;
  layoutKey: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutVersionResponse {
  version: number;
  status: VersionStatus;
  body: string;
  notes?: string;
  editedBy?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutDetailResponse extends LayoutResponse {
  versions: LayoutVersionResponse[];
}

export interface ListLayoutResponse {
  items: LayoutResponse[];
}

export interface CreateLayoutBody {
  layoutKey: string;
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateLayoutBody {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface UpsertLayoutDraftBody {
  body: string;
  notes?: string;
}

export interface PublishLayoutBody {
  notes?: string;
}

export interface PartialResponse {
  id: string;
  partialKey: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PartialVersionResponse {
  version: number;
  status: VersionStatus;
  body: string;
  notes?: string;
  editedBy?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartialDetailResponse extends PartialResponse {
  versions: PartialVersionResponse[];
}

export interface ListPartialResponse {
  items: PartialResponse[];
}

export interface CreatePartialBody {
  partialKey: string;
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdatePartialBody {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface UpsertPartialDraftBody {
  body: string;
  notes?: string;
}

export interface PublishPartialBody {
  notes?: string;
}

/**
 * Declaring the constants
 */
