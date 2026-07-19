/**
 * Importing npm packages
 */
import { Body, Get, HttpController, Patch, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';

import { MeResponse, UpdateProfileBody } from './me.dto';
import { type CurrentUserSummary, UserService } from './user.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/me')
@Auth({ session: true })
export class MeController {
  constructor(private readonly userService: UserService) {}

  private summary(): Promise<CurrentUserSummary> {
    return this.userService.getCurrentUserSummary(Context.getSession(), Context.getAuth().elevated ?? false);
  }

  /** Identifies the signed-in user for first-party surfaces: profile basics plus session assurance. */
  @Get()
  @RespondFor(200, MeResponse)
  getCurrentUser(): Promise<CurrentUserSummary> {
    return this.summary();
  }

  /** Updates the signed-in user's own name; returns the refreshed identity summary. */
  @Patch('/profile')
  @RespondFor(200, MeResponse)
  async updateCurrentUserProfile(@Body() body: UpdateProfileBody): Promise<CurrentUserSummary> {
    await this.userService.updateProfile(Context.getSession().userId, { firstName: body.firstName, lastName: body.lastName });
    return this.summary();
  }
}
