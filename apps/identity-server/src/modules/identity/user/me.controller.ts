/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { type FastifyRequest } from 'fastify';
import { Body, Get, HttpController, Patch, Req, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { SessionAuthService, SessionService } from '@server/modules/auth/session';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

import { MeResponse, UpdateProfileBody } from './me.dto';
import { UserEmailService } from './user-email.service';
import { UserService } from './user.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/me')
export class MeController {
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly sessionAuthService: SessionAuthService,
    private readonly sessionService: SessionService,
    private readonly userEmailService: UserEmailService,
    private readonly userService: UserService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  /** Identifies the signed-in user for first-party surfaces: profile basics plus session assurance. */
  @Get()
  @RespondFor(200, MeResponse)
  async me(@Req() request: FastifyRequest): Promise<MeResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    const profile = await this.db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, session.userId) });
    const email = await this.userEmailService.getPrimaryEmail(session.userId);

    return {
      userId: session.userId.toString(),
      firstName: profile?.firstName ?? undefined,
      lastName: profile?.lastName ?? undefined,
      email: email ?? undefined,
      aal: session.aal,
      elevated: this.sessionService.isElevated(session),
      elevatedUntil: session.elevatedUntil ? new Date(session.elevatedUntil).toISOString() : undefined,
    };
  }

  /** Updates the signed-in user's own name; returns the refreshed identity summary. */
  @Patch('/profile')
  @RespondFor(200, MeResponse)
  async updateProfile(@Body() body: UpdateProfileBody, @Req() request: FastifyRequest): Promise<MeResponse> {
    const session = await this.sessionAuthService.authenticate(request);
    await this.userService.updateProfile(session.userId, { firstName: body.firstName, lastName: body.lastName });
    return this.me(request);
  }
}
