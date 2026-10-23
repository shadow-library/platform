import { HttpRequest, HttpResponse } from './route-handler.interface';

export interface ErrorHandler {
  handle(err: Error, req: HttpRequest, res: HttpResponse): any | Promise<any>;
}
