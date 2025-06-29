/**
 * Importing npm packages
 */
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '@lib/constants';

/**
 * Defining types
 */

export interface ChildRouteResult {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, any>;
}

/**
 * Declaring the constants
 */

export class ChildRouteResponse {
  private static readonly logger = Logger.getLogger(NAMESPACE, 'ChildRouteResponse');

  statusCode = 200;
  headers: Record<string, string> = {};
  body: Record<string, any> = {};
  sent = false;

  /* eslint-disable-next-line @typescript-eslint/no-empty-function */
  onFinish: CallableFunction = () => {};

  raw = {
    on: (event: string, callback: () => void): void => {
      if (event === 'finish') this.onFinish = callback;
      else ChildRouteResponse.logger.warn(`Unhandled event: ${event} in ChildRouteResponse.raw.on`);
    },
  };

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  header(key: string, value: string): this {
    this.headers[key] = value;
    return this;
  }

  send(data: object): this {
    this.body = data;
    this.sent = true;
    return this;
  }

  getResult(): ChildRouteResult {
    return { statusCode: this.statusCode, headers: this.headers, body: this.body };
  }
}
