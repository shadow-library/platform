export interface paths {
  '/api/v1/internal/organisations/{organisationId}/members/{userId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Is Organisation Member */
    get: operations['get_api_v1_internal_organisations_organisationId_members_userId'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    DevErrorResponseDto: {
      code: string;
      message: string;
      fields?: components['schemas']['ErrorFieldDto'][];
      stack?: string;
    };
    ErrorFieldDto: {
      field: string;
      msg: string;
    };
    OrganisationMemberResponse: {
      member: boolean;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  get_api_v1_internal_organisations_organisationId_members_userId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationMemberResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
}
export type DevErrorResponseDto = components['schemas']['DevErrorResponseDto'];
export type ErrorFieldDto = components['schemas']['ErrorFieldDto'];
export type OrganisationMemberResponse = components['schemas']['OrganisationMemberResponse'];
export type IsOrganisationMemberPathParams = Exclude<paths['/api/v1/internal/organisations/{organisationId}/members/{userId}']['get']['parameters']['path'], undefined>;
