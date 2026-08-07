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

/**
 * Every shape that's a byte-for-byte match for something `api-types.gen.ts` already exports (the vast
 * majority of what this file used to hand-author) has been deleted — `src/lib/apis/index.ts` now
 * resolves those names straight off the generated file, so they can never drift again (see
 * `bun scripts/gen-api-types.ts --check`). What's left here is real: `variableSchema`.
 *
 * `apps/pulse-server/src/modules/template/template.dto.ts` deliberately declares `variableSchema` with
 * `@Field(() => Object, { additionalProperties: true })` ("loosely typed since it is authored by trusted
 * operators and stored as-is") — `class-schema` can't express the real nested shape through `Object`, so
 * the OpenAPI doc (and therefore `api-types.gen.ts`) widens it to `{ [key: string]: unknown }`. The
 * actual runtime/DB shape, `Template.VariableSchema` in
 * `apps/pulse-server/src/database/schemas/templates.ts`, is the structured type below — verified
 * identical field-for-field. `VariableSchemaEditor.tsx` reads and writes that structure directly
 * (`schema.variables[name].type`/`.required`/`.example`), so `Record<string, unknown>` isn't just looser,
 * it's unusable there without an `any`/`as` escape hatch. These five types re-derive from the generated
 * ones via `Omit<Generated, 'variableSchema'> & { variableSchema: ... }` instead of a hand-copied field
 * list, so every OTHER field still flows straight from the OpenAPI contract and stays drift-checked —
 * only `variableSchema` itself is a deliberate, evidenced override.
 */
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

export type TemplateResponse = Omit<GeneratedTemplateResponse, 'variableSchema'> & { variableSchema: TemplateVariableSchema };
export type TemplateDetailResponse = Omit<GeneratedTemplateDetailResponse, 'variableSchema'> & { variableSchema: TemplateVariableSchema };
export type ListTemplateResponse = Omit<GeneratedListTemplateResponse, 'items'> & { items: TemplateResponse[] };
export type CreateTemplateBody = Omit<GeneratedCreateTemplateBody, 'variableSchema'> & { variableSchema?: TemplateVariableSchema };
export type UpdateTemplateBody = Omit<GeneratedUpdateTemplateBody, 'variableSchema'> & { variableSchema?: TemplateVariableSchema };

/**
 * Front-end-only shapes with no `api-types.gen.ts` equivalent at all — either the server names the
 * generated schema differently (`SetChannelSettingBody`, `VersionListResponse`, `SaveLayoutDraftBody`,
 * `SavePartialDraftBody`, `LayoutListResponse`, `PartialListResponse`) or the endpoint takes path/query
 * variables that were never going to be a `components.schemas` entry (`DeleteContentVariables`,
 * `RollbackVersionBody`'s `{ version }` companion). None of these collide with a star-exported name from
 * `api-types.gen.ts`, so there's nothing to disambiguate for them in `index.ts`.
 */
export interface UpdateChannelSettingBody {
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
