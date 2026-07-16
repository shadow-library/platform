/**
 * Importing npm packages
 */
import { HttpController, Get, ServerErrorCode, Post, Body, HttpStatus, Put, Patch, Delete, RespondFor } from '@shadow-library/fastify';
import { HelloBody } from './hello-body.dto';
import { HelloResponse } from './hello-response.dto';

/**
 * Importing user defined packages
 */

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
    const data = { message: `Hello, ${body.name}!`, name: body.name };
    return data;
  }

  @Put('/error')
  throwError() {
    ServerErrorCode.S008.throw();
  }

  @Patch('/error-async')
  async throwErrorAsync() {
    await new Promise(resolve => setTimeout(resolve, 10));
    ServerErrorCode.S008.throw();
  }

  @Delete('/custom-error')
  throwCustomError() {
    throw new Error('Custom Error');
  }
}
