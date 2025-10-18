/**
 * Importing npm packages
 */
import { HttpController, Get, Post, Body, Patch, Delete, Params, RespondFor, ContextService } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { CreateUserBody } from './dtos/create-user-body.dto';
import { UserService } from './user.service';
import { UpdateUserBody } from './dtos/update-user-body.dto';
import { UserParams } from './dtos/user-params.dto';
import { UserResponse } from './dtos/user-response.dto';
import { AuthGuard } from './decorators/auth-guard.decorator';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly contextService: ContextService,
  ) {}

  @Get()
  @AuthGuard({ accessLevel: 1 })
  @RespondFor(200, [UserResponse])
  async listUsers() {
    return this.userService.getAllUsers();
  }

  @Get('/me')
  @AuthGuard({ accessLevel: 0 })
  @RespondFor(200, UserResponse)
  async getMyProfile() {
    return this.contextService.get('CURRENT_USER');
  }

  @Post()
  @AuthGuard({ accessLevel: 10 })
  @RespondFor(201, UserResponse)
  async createUser(@Body() body: CreateUserBody) {
    return this.userService.createUser(body);
  }

  @Patch('/:id')
  @AuthGuard({ accessLevel: 3 })
  @RespondFor(201, UserResponse)
  async updateUser(@Params() params: UserParams, @Body() body: UpdateUserBody) {
    const user = await this.userService.updateUser(params.id, body);
    return user;
  }

  @Delete('/:id')
  @AuthGuard({ accessLevel: 6 })
  @RespondFor(204, {})
  async deleteUser(@Params() params: UserParams) {
    await this.userService.deleteUser(params.id);
  }
}
