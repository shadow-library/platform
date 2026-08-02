export * from './transport';
export * from './api-types.gen';
export * from './dashboard.api';
export * from './layout.api';
export * from './notification.api';
export * from './partial.api';
export * from './sender-profile.api';
export * from './sender-routing-rule.api';
export * from './session.api';
export * from './studio.types';
export * from './template.api';

/**
 * `studio.types.ts` predates the templates OpenAPI schema and hand-authored its own response/body
 * shapes; now that `api-types.gen.ts` independently exports same-named schemas, the star exports above
 * collide for these five. Explicit re-exports win over an ambiguous star export, so these keep
 * `studio.types.ts`'s versions — the only ones where the two genuinely differ: `variableSchema` is
 * deliberately loosened to `Record<string, unknown>` on the wire (see `studio.types.ts`'s own comment),
 * but `VariableSchemaEditor.tsx` needs the real structured shape. Every other studio-only name that used
 * to duplicate a generated schema 1:1 was deleted from `studio.types.ts` instead — those resolve from
 * `api-types.gen.ts` above with nothing to disambiguate.
 */
export type { CreateTemplateBody, ListTemplateResponse, TemplateDetailResponse, TemplateResponse, UpdateTemplateBody } from './studio.types';
