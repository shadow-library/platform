/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';
import { Delete, Get, HttpController, Params, Patch, Post, Put, Query, Req, Res } from '@shadow-library/fastify';
import { type FastifyReply, type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { ScimAuthService } from './scim-auth.service';
import { ScimGroupService } from './scim-group.service';
import { ScimUserService } from './scim-user.service';
import { ScimIdParams, ScimListQuery } from './scim.dto';
import { LIST_SCHEMA, SCIM_CONTENT_TYPE, ScimError, ScimListResponse, parseFilter, parseGroupInput, parsePage, parsePatchOperations, parseUserInput } from './scim.types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * SCIM responses are sent manually (`@Res`) rather than through `@RespondFor` DTO serialization —
 * RFC 7644 fixes the wire format, including a distinct error envelope and `application/scim+json`,
 * which must not be reshaped by the platform's error handler. `run` maps `ScimError` to the
 * conformant envelope; anything else falls through to the framework as a genuine server fault.
 */

@HttpController('/scim/v2')
export class ScimController {
  private readonly issuer = Config.get('oauth.issuer');

  constructor(
    private readonly scimAuthService: ScimAuthService,
    private readonly scimUserService: ScimUserService,
    private readonly scimGroupService: ScimGroupService,
  ) {}

  private async run(reply: FastifyReply, status: number, fn: () => Promise<unknown>): Promise<void> {
    try {
      const body = await fn();
      if (body === undefined) reply.status(status).send();
      else reply.status(status).type(SCIM_CONTENT_TYPE).send(JSON.stringify(body));
    } catch (error) {
      if (!(error instanceof ScimError)) throw error;
      reply.status(error.status).type(SCIM_CONTENT_TYPE).send(JSON.stringify(error.toEnvelope()));
    }
  }

  private toList<T>(total: number, resources: T[], startIndex: number): ScimListResponse<T> {
    return { schemas: [LIST_SCHEMA], totalResults: total, startIndex, itemsPerPage: resources.length, Resources: resources };
  }

  /* ----------------------------------------- users ----------------------------------------- */

  @Get('/Users')
  async listUsers(@Query() query: ScimListQuery, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 200, async () => {
      const tenant = await this.scimAuthService.authenticate(request);
      const page = parsePage(query.startIndex, query.count);
      const { total, resources } = await this.scimUserService.list(tenant, parseFilter(query.filter, ['userName', 'externalId']), page);
      return this.toList(total, resources, page.startIndex);
    });
  }

  @Post('/Users')
  async createUser(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 201, async () => {
      const tenant = await this.scimAuthService.authenticate(request);
      return this.scimUserService.create(tenant, parseUserInput(request.body));
    });
  }

  @Get('/Users/:id')
  async getUser(@Params() params: ScimIdParams, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 200, async () => {
      const tenant = await this.scimAuthService.authenticate(request);
      return this.scimUserService.get(tenant, params.id);
    });
  }

  @Put('/Users/:id')
  async replaceUser(@Params() params: ScimIdParams, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 200, async () => {
      const tenant = await this.scimAuthService.authenticate(request);
      return this.scimUserService.replace(tenant, params.id, parseUserInput(request.body));
    });
  }

  @Patch('/Users/:id')
  async patchUser(@Params() params: ScimIdParams, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 200, async () => {
      const tenant = await this.scimAuthService.authenticate(request);
      return this.scimUserService.patch(tenant, params.id, parsePatchOperations(request.body));
    });
  }

  @Delete('/Users/:id')
  async deleteUser(@Params() params: ScimIdParams, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 204, async () => {
      const tenant = await this.scimAuthService.authenticate(request);
      await this.scimUserService.remove(tenant, params.id);
      return undefined;
    });
  }

  /* ----------------------------------------- groups ---------------------------------------- */

  @Get('/Groups')
  async listGroups(@Query() query: ScimListQuery, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 200, async () => {
      const tenant = await this.scimAuthService.authenticate(request);
      const page = parsePage(query.startIndex, query.count);
      const { total, resources } = await this.scimGroupService.list(tenant, parseFilter(query.filter, ['displayName', 'externalId']), page);
      return this.toList(total, resources, page.startIndex);
    });
  }

  @Post('/Groups')
  async createGroup(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 201, async () => {
      const tenant = await this.scimAuthService.authenticate(request);
      return this.scimGroupService.create(tenant, parseGroupInput(request.body));
    });
  }

  @Get('/Groups/:id')
  async getGroup(@Params() params: ScimIdParams, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 200, async () => {
      const tenant = await this.scimAuthService.authenticate(request);
      return this.scimGroupService.get(tenant, params.id);
    });
  }

  @Put('/Groups/:id')
  async replaceGroup(@Params() params: ScimIdParams, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 200, async () => {
      const tenant = await this.scimAuthService.authenticate(request);
      return this.scimGroupService.replace(tenant, params.id, parseGroupInput(request.body));
    });
  }

  @Patch('/Groups/:id')
  async patchGroup(@Params() params: ScimIdParams, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 200, async () => {
      const tenant = await this.scimAuthService.authenticate(request);
      return this.scimGroupService.patch(tenant, params.id, parsePatchOperations(request.body));
    });
  }

  @Delete('/Groups/:id')
  async deleteGroup(@Params() params: ScimIdParams, @Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 204, async () => {
      const tenant = await this.scimAuthService.authenticate(request);
      await this.scimGroupService.remove(tenant, params.id);
      return undefined;
    });
  }

  /* --------------------------------------- discovery --------------------------------------- */

  @Get('/ServiceProviderConfig')
  async serviceProviderConfig(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 200, async () => {
      await this.scimAuthService.authenticate(request);
      return {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
        documentationUri: `${this.issuer}/docs`,
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 500 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [{ type: 'oauthbearertoken', name: 'OAuth Bearer Token', description: 'Client-credentials access token carrying the scim:provision scope' }],
        meta: { resourceType: 'ServiceProviderConfig', location: `${this.issuer}/scim/v2/ServiceProviderConfig` },
      };
    });
  }

  @Get('/ResourceTypes')
  async resourceTypes(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 200, async () => {
      await this.scimAuthService.authenticate(request);
      const resources = [
        { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'User', name: 'User', endpoint: '/Users', schema: 'urn:ietf:params:scim:schemas:core:2.0:User' },
        { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'Group', name: 'Group', endpoint: '/Groups', schema: 'urn:ietf:params:scim:schemas:core:2.0:Group' },
      ];
      return this.toList(resources.length, resources, 1);
    });
  }

  @Get('/Schemas')
  async schemas(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.run(reply, 200, async () => {
      await this.scimAuthService.authenticate(request);
      const resources = [
        { id: 'urn:ietf:params:scim:schemas:core:2.0:User', name: 'User', description: 'User account provisioned into an organisation' },
        { id: 'urn:ietf:params:scim:schemas:core:2.0:Group', name: 'Group', description: 'Tenant-defined group of provisioned users' },
      ];
      return this.toList(resources.length, resources, 1);
    });
  }
}
