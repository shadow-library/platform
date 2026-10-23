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
   * The sharing branch: a member of the owner's organisation holding `novel-forge:curate` there reaches a project its owner opened to the organisation.
   * Only a user qualifies (a bot is granted permissions for its own work), and a null organisation on either side never matches.
   * `/internal/bots/:botId/transfer` deliberately preserves both columns, so the organisation keeps the access it had while the bot existed.
   * `highRisk` because this guard is the only authorization on the destructive project routes: at the default TTL a revoked curator would keep delete rights for 15 minutes.
   */
  private async isOrganisationCurator(project: ProjectOwnership, actor: Actor): Promise<boolean> {
    if (actor.kind !== 'user' || !project.sharedWithOrg) return false;
    if (project.organisationId === null || project.organisationId !== actor.organisationId) return false;

    const principal = this.context.getAuthPrincipal();
    const organisationId = project.organisationId.toString();
    return this.authClient.check({ action: CURATE_PERMISSION, organisationId, principal }, { highRisk: true });
  }
}
