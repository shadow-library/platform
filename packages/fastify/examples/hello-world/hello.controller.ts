/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Patch, Post, Put, RespondFor, ServerErrorCode } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { HelloBody } from './hello-body.dto';
import { HelloResponse } from './hello-response.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController()
export class HelloController {
  @Get('/hello')
  @RespondFor(200, HelloResponse)
  getHello(): HelloResponse {
    return { message: 'Hello, World!' };
  }

  @Post('/hello')
  @HttpStatus(200)
  @RespondFor(200, HelloResponse)
  async getHelloAsync(@Body() body: HelloBody): Promise<HelloResponse> {
    await new Promise(resolve => setTimeout(resolve, 10));
    return { message: `Hello, ${body.name}!` };
  }

  @Put('/error')
  throwError(): void {
    ServerErrorCode.S008.throw();
  }

  @Patch('/error-async')
  async throwErrorAsync(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 10));
    ServerErrorCode.S008.throw();
  }

  @Delete('/custom-error')
  throwCustomError(): void {
    throw new Error('Custom Error');
  }
}
