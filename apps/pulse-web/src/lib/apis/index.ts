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

// Explicit re-exports win over the ambiguous star exports: studio.types.ts narrows `variableSchema`, which the generated types widen to a loose record.
export type { CreateTemplateBody, ListTemplateResponse, TemplateDetailResponse, TemplateResponse, UpdateTemplateBody } from './studio.types';
