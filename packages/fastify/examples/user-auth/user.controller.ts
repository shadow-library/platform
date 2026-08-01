/**
 * Importing npm packages
 */
import { Body, ContextService, Delete, Get, HttpController, Params, Patch, Post, RespondFor, Version } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuthGuard } from './decorators/auth-guard.decorator';
import { CreateUserBody } from './dtos/create-user-body.dto';
import { UpdateUserBody } from './dtos/update-user-body.dto';
import { UserParams } from './dtos/user-params.dto';
import { UserRawResponse } from './dtos/user-raw-response.dto';
import { UserResponse } from './dtos/user-response.dto';
import { User, UserService } from './user.service';

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
  async listUsers(): Promise<User[]> {
    return this.userService.getAllUsers();
  }

  @Get()
  @Version(2)
  @AuthGuard({ accessLevel: 1 })
  @RespondFor(200, [UserRawResponse])
  async listUsersRaw(): Promise<User[]> {
    return this.userService.getAllUsers();
  }

  @Get('/me')
  @AuthGuard({ accessLevel: 0 })
  @RespondFor(200, UserResponse)
  async getMyProfile(): Promise<User> {
    /* The access guard has already rejected anonymous requests, so the user is guaranteed to be in the context. */
    return this.contextService.get<User>('CURRENT_USER', true);
  }

  @Post()
  @AuthGuard({ accessLevel: 10 })
  @RespondFor(201, UserResponse)
  async createUser(@Body() body: CreateUserBody): Promise<User> {
    return this.userService.createUser(body);
  }

  @Patch('/:id')
  @AuthGuard({ accessLevel: 3 })
  @RespondFor(201, UserResponse)
  async updateUser(@Params() params: UserParams, @Body() body: UpdateUserBody): Promise<User> {
    const user = await this.userService.updateUser(params.id, body);
    return user;
  }

  @Delete('/:id')
  @AuthGuard({ accessLevel: 6 })
  @RespondFor(204, {})
  async deleteUser(@Params() params: UserParams): Promise<void> {
    await this.userService.deleteUser(params.id);
  }
}
