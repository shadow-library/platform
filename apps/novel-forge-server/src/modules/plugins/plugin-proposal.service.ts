import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Generation, type Refinement } from '@server/database';

import { type ChangeOp, PLUGIN_ALLOWED_OPS, validatePluginChangeSet } from '../refinement/change-set';
import { ProposalService } from '../refinement/proposal.service';
import { PluginHost } from './plugin-host.service';
import { type ActivePlugin, PluginPolicyService } from './plugin-policy.service';
import { PluginService } from './plugin.service';
import { type BriefSummary, type DecisionPoint } from './plugin.types';

function toSummary(brief: Generation.Brief): BriefSummary {
  return { chapter: brief.chapter, title: brief.title ?? '', body: brief.body, volumeKey: brief.volumeKey, writeMode: brief.writeMode };
}

/**
 * The two proposing decision points. A plugin emits ops; core validates them
 * against the real `OP_SPECS` and stages one author-approved proposal — plugins never write domain tables.
 */
@Injectable()
export class PluginProposalService {
  private readonly logger = Logger.getLogger(APP_NAME, PluginProposalService.name);

  constructor(
    private readonly pluginHost: PluginHost,
    private readonly pluginService: PluginService,
    private readonly pluginPolicy: PluginPolicyService,
    private readonly proposalService: ProposalService,
  ) {}

  async augment(projectId: bigint, pluginId: string): Promise<Refinement.Proposal | undefined> {
    if (!this.pluginHost.get(pluginId)) throw AppErrorCode.PLG_001.create();

    const enabled = await this.pluginService.list(projectId);
    if (!enabled.some(view => view.pluginId === pluginId)) throw AppErrorCode.PLG_002.create();

    const entry = (await this.pluginPolicy.active(projectId)).find(active => active.id === pluginId);
    return entry ? this.augmentWith(projectId, entry) : undefined;
  }

  /** Every enabled plugin gets its say once a bible run has settled, and one of them failing never fails the run. */
  async augmentEnabled(projectId: bigint): Promise<Refinement.Proposal[]> {
    const staged: Refinement.Proposal[] = [];
    for (const entry of await this.pluginPolicy.active(projectId)) {
      const proposal = await this.augmentWith(projectId, entry).catch(err => this.dropped(entry.id, 'canon.augment', err));
      if (proposal) staged.push(proposal);
    }
    return staged;
  }

  /** The planner is nudged, never compelled, so policy runs on what it actually produced and stages the correction. */
  async stageBriefPolicy(projectId: bigint, briefs: Generation.Brief[]): Promise<Refinement.Proposal | undefined> {
    if (briefs.length === 0) return undefined;

    const answering = (await this.pluginPolicy.active(projectId)).filter(entry => entry.plugin.decideBriefPolicy);
    const [owner, ...ignored] = answering;
    if (!owner) return undefined;
    // brief.policy is an exclusive decision point, so the first plugin in ordinal order owns it; a second
    // one answering without claiming exclusivity is a misconfiguration PLG_004 cannot catch at enable time.
    if (ignored.length > 0)
      this.logger.warn('more than one plugin answers brief.policy — ignoring all but the first', { owner: owner.id, ignored: ignored.map(entry => entry.id) });

    const summaries = briefs.map(toSummary);
    const ops = await this.collect(owner, 'brief.policy', () => owner.plugin.decideBriefPolicy?.({ config: owner.config, host: owner.host, briefs: summaries }));
    if (ops.length === 0) return undefined;
    return this.stage(projectId, owner.id, `Brief policy from ${owner.id}`, ops);
  }

  private async augmentWith(projectId: bigint, entry: ActivePlugin): Promise<Refinement.Proposal | undefined> {
    if (!entry.plugin.augmentCanon) return undefined;

    const ops = await this.collect(entry, 'canon.augment', () => entry.plugin.augmentCanon?.({ config: entry.config, host: entry.host }));
    if (ops.length === 0) return undefined;
    return this.stage(projectId, entry.id, `Canon augmentation from ${this.pluginHost.get(entry.id)?.manifest.title ?? entry.id}`, ops);
  }

  private async collect(entry: ActivePlugin, point: DecisionPoint, hook: () => unknown): Promise<unknown[]> {
    try {
      const emitted = await hook();
      return Array.isArray(emitted) ? emitted : [];
    } catch (err) {
      this.dropped(entry.id, point, err);
      return [];
    }
  }

  private async stage(projectId: bigint, scopeRef: string, summary: string, ops: unknown[]): Promise<Refinement.Proposal> {
    const errors = validatePluginChangeSet(ops);
    if (errors[0]) throw AppErrorCode.PLG_005.create({ reason: errors[0] });

    return this.proposalService.create(projectId, { scopeType: 'project', scopeRef, kind: 'plugin', summary, changeSet: ops as ChangeOp[], allowedOps: PLUGIN_ALLOWED_OPS });
  }

  /** A misbehaving plugin degrades its own decision point and never fails the run it was called from. */
  private dropped(pluginId: string, point: DecisionPoint, err: unknown): undefined {
    this.logger.warn('plugin decision point failed — contribution dropped', { pluginId, point, reason: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}
