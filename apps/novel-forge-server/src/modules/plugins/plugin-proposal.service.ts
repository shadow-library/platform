import { and, eq, inArray } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Generation, type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { type ArcUpsertOp, type ChangeOp, PLUGIN_ALLOWED_OPS, validatePluginChangeSet } from '../refinement/change-set';
import { ProposalService } from '../refinement/proposal.service';
import { PluginHost } from './plugin-host.service';
import { type ActivePlugin, PluginPolicyService } from './plugin-policy.service';
import { PluginService } from './plugin.service';
import { type BriefSummary, type DecisionPoint } from './plugin.types';

function toSummary(brief: Generation.Brief): BriefSummary {
  return { chapter: brief.chapter, title: brief.title ?? '', body: brief.body, volumeKey: brief.volumeKey, arcKey: brief.arcKey, writeMode: brief.writeMode };
}

/**
 * The two proposing decision points (plugin-host design §5.1, §5.2). A plugin emits ops; core validates them
 * against the real `OP_SPECS` and stages one author-approved proposal — plugins never write domain tables.
 */
@Injectable()
export class PluginProposalService {
  private readonly logger = Logger.getLogger(APP_NAME, PluginProposalService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly pluginHost: PluginHost,
    private readonly pluginService: PluginService,
    private readonly pluginPolicy: PluginPolicyService,
    private readonly proposalService: ProposalService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async augment(projectId: bigint, pluginId: string): Promise<Refinement.Proposal | undefined> {
    if (!this.pluginHost.get(pluginId)) throw AppErrorCode.PLG_001.create();

    const enabled = await this.pluginService.list(projectId);
    if (!enabled.some(view => view.pluginId === pluginId)) throw AppErrorCode.PLG_002.create();

    const entry = (await this.pluginPolicy.active(projectId)).find(active => active.id === pluginId);
    return entry ? this.augmentWith(projectId, entry) : undefined;
  }

  /** §5.1: every enabled plugin gets its say once a bible run has settled, and one of them failing never fails the run. */
  async augmentEnabled(projectId: bigint): Promise<Refinement.Proposal[]> {
    const staged: Refinement.Proposal[] = [];
    for (const entry of await this.pluginPolicy.active(projectId)) {
      const proposal = await this.augmentWith(projectId, entry).catch(err => this.dropped(entry.id, 'canon.augment', err));
      if (proposal) staged.push(proposal);
    }
    return staged;
  }

  /** §5.2: the planner is nudged, never compelled, so policy runs on what it actually produced and stages the correction. */
  async stageBriefPolicy(projectId: bigint, briefs: Generation.Brief[]): Promise<Refinement.Proposal | undefined> {
    if (briefs.length === 0) return undefined;

    const answering = (await this.pluginPolicy.active(projectId)).filter(entry => entry.plugin.decideBriefPolicy);
    const [owner, ...ignored] = answering;
    if (!owner) return undefined;
    // brief.policy is an exclusive decision point (§4.9), so the first plugin in ordinal order owns it; a second
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

    const changeSet = ops as ChangeOp[];
    await this.assertNoArcReparenting(projectId, changeSet);
    return this.proposalService.create(projectId, { scopeType: 'project', scopeRef, kind: 'plugin', summary, changeSet, allowedOps: PLUGIN_ALLOWED_OPS });
  }

  /** §12: `volumeKey` is required on `arc.upsert`, so only a *change* to an existing arc's volume is the structural move that is refused. */
  private async assertNoArcReparenting(projectId: bigint, changeSet: ChangeOp[]): Promise<void> {
    const upserts = changeSet.filter((op): op is ArcUpsertOp => op.op === 'arc.upsert');
    if (upserts.length === 0) return;

    const existing = await this.db.query.arcs.findMany({
      where: and(
        eq(schema.arcs.projectId, projectId),
        inArray(
          schema.arcs.arcKey,
          upserts.map(op => op.arcKey),
        ),
      ),
      columns: { arcKey: true, volumeKey: true },
    });

    for (const op of upserts) {
      const arc = existing.find(row => row.arcKey === op.arcKey);
      if (arc && arc.volumeKey !== op.volumeKey) throw AppErrorCode.PLG_005.create({ reason: `changeSet: arc '${op.arcKey}' may not be moved to another volume` });
    }
  }

  /** §10: a misbehaving plugin degrades its own decision point and never fails the run it was called from. */
  private dropped(pluginId: string, point: DecisionPoint, err: unknown): undefined {
    this.logger.warn('plugin decision point failed — contribution dropped', { pluginId, point, reason: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}
