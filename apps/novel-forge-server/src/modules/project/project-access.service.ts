import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { ContextService } from '@shadow-library/fastify';

import { isOwnedBy } from '@server/common';
import { CURATE_PERMISSION } from '@server/constants';
import { type Owner } from '@server/database';

import { type Actor } from '@modules/actor';

export interface ProjectOwnership {
  ownerKind: Owner.Kind;
  ownerId: bigint | null;
  organisationId: bigint | null;
  sharedWithOrg: boolean;
}

/** Who may reach a project: its owner, or an organisation curator on a project its owner shared. A null `owner_id` never matches. */
@Injectable()
export class ProjectAccessService {
  constructor(
    private readonly context: ContextService,
    private readonly authClient: AuthClient,
  ) {}

  async canReach(project: ProjectOwnership, actor: Actor): Promise<boolean> {
    if (isOwnedBy(project, actor)) return true;
    return this.isOrganisationCurator(project, actor);
  }

  /**
   * The sharing branch: a project its owner opened to the organisation is reachable by a member of that same
   * organisation who holds `novel-forge:curate` there. Only a user qualifies — a bot is granted permissions
   * for its own work, never for reading another principal's records — and a null organisation on either side
   * never matches. A user-owned project carries an organisation only when `/internal/bots/:botId/transfer`
   * handed it over from a bot, which deliberately preserves both columns so the organisation keeps the access
   * it had while the bot still existed.
   *
   * `highRisk` because the ownership guard is the only authorization on the destructive project routes, which scope by id
   * alone: at the default TTL a revoked curator would keep delete rights on someone else's project for 15 minutes.
   */
  private async isOrganisationCurator(project: ProjectOwnership, actor: Actor): Promise<boolean> {
    if (actor.kind !== 'user' || !project.sharedWithOrg) return false;
    if (project.organisationId === null || project.organisationId !== actor.organisationId) return false;

    const principal = this.context.getAuthPrincipal();
    const organisationId = project.organisationId.toString();
    return this.authClient.check({ action: CURATE_PERMISSION, organisationId, principal }, { highRisk: true });
  }
}
