export interface paths {
  '/internal/bots/{botId}/ownership': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Ownership */
    get: operations['get_internal_bots_botId_ownership'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/bots/{botId}/transfer': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Transfer Ownership */
    post: operations['post_internal_bots_botId_transfer'];
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
    BotOwnershipResponse: {
      projects: number;
      illustrations: number;
    };
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
    TransferOwnershipBody: {
      /** @description Identity user id the bot-owned rows are reassigned to. */
      toUserId: string;
    };
    TransferOwnershipResponse: {
      /** @description Projects this call reassigned; a retry of an applied transfer reports zero. */
      projects: number;
      /** @description Illustrations this call reassigned; a retry of an applied transfer reports zero. */
      illustrations: number;
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
  get_internal_bots_botId_ownership: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        botId: string;
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
          'application/json': components['schemas']['BotOwnershipResponse'];
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
  post_internal_bots_botId_transfer: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        botId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TransferOwnershipBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TransferOwnershipResponse'];
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
export type BotOwnershipResponse = components['schemas']['BotOwnershipResponse'];
export type DevErrorResponseDto = components['schemas']['DevErrorResponseDto'];
export type ErrorFieldDto = components['schemas']['ErrorFieldDto'];
export type TransferOwnershipBody = components['schemas']['TransferOwnershipBody'];
export type TransferOwnershipResponse = components['schemas']['TransferOwnershipResponse'];
export type GetOwnershipPathParams = Exclude<paths['/internal/bots/{botId}/ownership']['get']['parameters']['path'], undefined>;
