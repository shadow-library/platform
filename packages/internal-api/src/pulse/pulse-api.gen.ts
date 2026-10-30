export interface paths {
  '/api/v1/notifications': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Create Notification */
    post: operations['post_api_v1_notifications'];
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
    CreateNotificationBody: {
      templateKey: string;
      recipients: components['schemas']['NotificationRecipients'];
      payload?: Record<string, unknown>;
      locale?: string;
      service?: string;
    };
    CreateNotificationResponse: {
      /** @enum {string} */
      status: 'ACCEPTED' | 'PARTIAL_ACCEPTED' | 'FAILED';
      channelResults: components['schemas']['NotificationChannelResponse'][];
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
    ErrorResponseDto: {
      code: string;
      message: string;
      fields?: components['schemas']['ErrorFieldDto'][];
    };
    /** @enum {string} */
    NotificationChannel: 'EMAIL' | 'SMS' | 'PUSH';
    NotificationChannelResponse: {
      channel: components['schemas']['NotificationChannel'];
      /** @enum {string} */
      status: 'QUEUED' | 'FAILED';
      locale?: string;
      jobId?: string;
      error?: components['schemas']['ErrorResponseDto'];
    };
    NotificationRecipients: {
      email?: string;
      phone?: string;
      push?: string;
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
  post_api_v1_notifications: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateNotificationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CreateNotificationResponse'];
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
export type CreateNotificationBody = components['schemas']['CreateNotificationBody'];
export type CreateNotificationResponse = components['schemas']['CreateNotificationResponse'];
export type DevErrorResponseDto = components['schemas']['DevErrorResponseDto'];
export type ErrorFieldDto = components['schemas']['ErrorFieldDto'];
export type ErrorResponseDto = components['schemas']['ErrorResponseDto'];
export type NotificationChannel = components['schemas']['NotificationChannel'];
export type NotificationChannelResponse = components['schemas']['NotificationChannelResponse'];
export type NotificationRecipients = components['schemas']['NotificationRecipients'];
