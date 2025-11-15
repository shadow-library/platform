/**
 * Importing npm packages
 */
import { HttpController, Get, ServerError, ServerErrorCode, Post, Body, HttpStatus, Put, Patch, Delete, RespondFor } from '@shadow-library/fastify';
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
    throw new ServerError(ServerErrorCode.S008);
  }

  @Patch('/error-async')
  async throwErrorAsync() {
    await new Promise(resolve => setTimeout(resolve, 10));
    throw new ServerError(ServerErrorCode.S008);
  }

  @Delete('/custom-error')
  throwCustomError() {
    throw new Error('Custom Error');
  }
}
