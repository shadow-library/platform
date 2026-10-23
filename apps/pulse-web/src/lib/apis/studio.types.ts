import {
  type CreateTemplateBody as GeneratedCreateTemplateBody,
  type ListTemplateResponse as GeneratedListTemplateResponse,
  type TemplateDetailResponse as GeneratedTemplateDetailResponse,
  type TemplateResponse as GeneratedTemplateResponse,
  type UpdateTemplateBody as GeneratedUpdateTemplateBody,
  type LayoutResponse,
  type NotificationChannel,
  type PartialResponse,
  type VersionResponse,
} from './api-types.gen';

// The server DTO types `variableSchema` loosely, so the generated types widen it; the editor needs the real structure. Other fields still derive from the generated types.
export type TemplateVariableType = 'string' | 'number' | 'boolean';

interface TemplateVariable {
  type: TemplateVariableType;
  required: boolean;
  description?: string;
  example?: string;
}

export interface TemplateVariableSchema {
  variables: Record<string, TemplateVariable>;
}

export type TemplateResponse = Omit<GeneratedTemplateResponse, 'variableSchema'> & { variableSchema: TemplateVariableSchema };
export type TemplateDetailResponse = Omit<GeneratedTemplateDetailResponse, 'variableSchema'> & { variableSchema: TemplateVariableSchema };
export type ListTemplateResponse = Omit<GeneratedListTemplateResponse, 'items'> & { items: TemplateResponse[] };
export type CreateTemplateBody = Omit<GeneratedCreateTemplateBody, 'variableSchema'> & { variableSchema?: TemplateVariableSchema };
export type UpdateTemplateBody = Omit<GeneratedUpdateTemplateBody, 'variableSchema'> & { variableSchema?: TemplateVariableSchema };

interface UpdateChannelSettingBody {
  isEnabled: boolean;
}

export interface UpdateChannelSettingVariables extends UpdateChannelSettingBody {
  channel: NotificationChannel;
}

export interface DeleteContentVariables {
  channel: NotificationChannel;
  locale: string;
}

export interface RollbackVersionBody {
  notes?: string;
}

export interface UpsertLayoutDraftBody {
  body: string;
  notes?: string;
}

export interface UpsertPartialDraftBody {
  body: string;
  notes?: string;
}

export interface ListVersionResponse {
  items: VersionResponse[];
}

export interface ListLayoutResponse {
  items: LayoutResponse[];
}

export interface ListPartialResponse {
  items: PartialResponse[];
}
