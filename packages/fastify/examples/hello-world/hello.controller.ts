/**
 * Importing npm packages
 */
import { HttpController, Get, ServerError, ServerErrorCode, Post, Body, HttpStatus, Put, Patch, Delete } from '@shadow-library/fastify';
import { HelloBody } from './hello-body.dto';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api')
export class HelloController {
  @Get('/hello')
  getHello() {
    return { message: 'Hello, World!' };
  }

  @Post('/hello')
  @HttpStatus(200)
  async getHelloAsync(@Body() body: HelloBody) {
    await new Promise(resolve => setTimeout(resolve, 10));
    return { message: `Hello, ${body.name}!` };
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
