/**
 * Importing npm packages
 */
import { and, eq } from 'drizzle-orm';
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { ValidationError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { CommandBus, type CommandContext, type CommandResult } from '@modules/commands';
import { AppErrorCode } from '@server/classes';
import { type Metric, type MetricEntry, schema } from '@server/database';
import { pseudoAccountId, TelemetryService } from '@server/telemetry';

import { MetricEntryRepository } from './metric-entry.repository';
import { MetricRepository } from './metric.repository';
import { findThresholdOffers, serializeOffer } from './threshold-offer';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const METRIC_CREATE = 'metric.create';
const METRIC_UPDATE = 'metric.update';
const METRIC_DELETE = 'metric.delete';
const METRIC_REGISTER = 'metric.register';

const VALUE_TYPES: readonly Metric.ValueType[] = ['number', 'duration', 'count', 'currency', 'boolean', 'text'];
const DIRECTIONS: readonly Metric.Direction[] = ['higher', 'lower', 'range', 'neutral'];
const ENTRY_SOURCES: readonly MetricEntry.Source[] = ['quest_log', 'manual', 'food'];

function requireString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || value.length === 0) throw new ValidationError(field, `'${field}' is required`);
  return value;
}

function optionalString(payload: Record<string, unknown>, field: string): string | undefined {
  const value = payload[field];
  return typeof value === 'string' ? value : undefined;
}

function requireEnum<T extends string>(payload: Record<string, unknown>, field: string, allowed: readonly T[]): T {
  const value = requireString(payload, field);
  if (!(allowed as readonly string[]).includes(value)) throw new ValidationError(field, `'${field}' must be one of ${allowed.join(', ')}`);
  return value as T;
}

function requireNumberString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ValidationError(field, `'${field}' must be a finite number`);
  return String(value);
}

/**
 * Registers the metric CRUD + `RegisterMetricEntry` command handlers (ARCHITECTURE §18, §10.3) and the
 * threshold-offer computation that rides along with a health entry's registration — never a separate
 * command, since an offer is a read derived from the write that just happened, not a mutation of its own.
 */
@Injectable()
export class MetricsCommandsService implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly metricRepository: MetricRepository,
    private readonly metricEntryRepository: MetricEntryRepository,
    private readonly telemetry: TelemetryService,
  ) {}

  onModuleInit(): void {
    this.commandBus.registerHandler(METRIC_CREATE, context => this.createMetric(context));
    this.commandBus.registerHandler(METRIC_UPDATE, context => this.updateMetric(context));
    this.commandBus.registerHandler(METRIC_DELETE, context => this.deleteMetric(context));
    this.commandBus.registerHandler(METRIC_REGISTER, context => this.registerEntry(context));
  }

  private async createMetric({ accountId, envelope, tx }: CommandContext): Promise<CommandResult> {
    const payload = envelope.payload;
    const name = requireString(payload, 'name');
    const valueType = requireEnum(payload, 'valueType', VALUE_TYPES);
    const direction = requireEnum(payload, 'direction', DIRECTIONS);
    const unit = optionalString(payload, 'unit') ?? null;
    const glyph = optionalString(payload, 'glyph') ?? null;
    const defaultValue = 'defaultValue' in payload ? requireNumberString(payload, 'defaultValue') : null;

    await this.metricRepository.ensureBuiltinsSeeded(tx, accountId);
    const metric = await this.metricRepository.create(tx, { accountId, name, unit, valueType, direction, defaultValue, glyph });
    return { status: 'applied', result: { id: String(metric.id) } };
  }

  private async updateMetric({ envelope, tx }: CommandContext): Promise<CommandResult> {
    const payload = envelope.payload;
    const id = BigInt(requireString(payload, 'id'));
    const existing = await this.metricRepository.findByIdInTx(tx, id);
    if (!existing) throw AppErrorCode.MET_002.create();
    if (existing.builtin) throw AppErrorCode.MET_003.create();

    const values: Record<string, unknown> = {};
    if ('name' in payload) values['name'] = requireString(payload, 'name');
    if ('unit' in payload) values['unit'] = optionalString(payload, 'unit') ?? null;
    if ('glyph' in payload) values['glyph'] = optionalString(payload, 'glyph') ?? null;
    if ('valueType' in payload) values['valueType'] = requireEnum(payload, 'valueType', VALUE_TYPES);
    if ('direction' in payload) values['direction'] = requireEnum(payload, 'direction', DIRECTIONS);
    if ('defaultValue' in payload) values['defaultValue'] = payload['defaultValue'] === null ? null : requireNumberString(payload, 'defaultValue');

    const updated = await this.metricRepository.update(tx, id, values);
    if (!updated) throw AppErrorCode.MET_002.create();
    return { status: 'applied', result: { id: String(updated.id) } };
  }

  /**
   * Delete warns/detaches per PRD S6: a metric still declared on some quest's `quest_consequences` is
   * not silently deactivated — the caller must pass `detach: true` to acknowledge unlinking those
   * quests. Detaching removes the consequence rows (the quest no longer writes this metric on
   * completion) and then deactivates the metric; `metric_entries` history is never touched either way.
   */
  private async deleteMetric({ accountId, envelope, tx }: CommandContext): Promise<CommandResult> {
    const payload = envelope.payload;
    const id = BigInt(requireString(payload, 'id'));
    const detach = payload['detach'] === true;

    const existing = await this.metricRepository.findByIdInTx(tx, id);
    if (!existing) throw AppErrorCode.MET_002.create();
    if (existing.builtin) throw AppErrorCode.MET_003.create();

    const consequences = await tx
      .select({ id: schema.questConsequences.id })
      .from(schema.questConsequences)
      .where(and(eq(schema.questConsequences.accountId, accountId), eq(schema.questConsequences.metricId, id)));

    if (consequences.length > 0 && !detach) throw AppErrorCode.MET_004.create({ questCount: consequences.length });
    if (consequences.length > 0) {
      await tx.delete(schema.questConsequences).where(and(eq(schema.questConsequences.accountId, accountId), eq(schema.questConsequences.metricId, id)));
    }

    const deactivated = await this.metricRepository.deactivate(tx, id);
    if (!deactivated) throw AppErrorCode.MET_002.create();
    return { status: 'applied', result: { id: String(deactivated.id), detachedQuestCount: consequences.length } };
  }

  private async registerEntry({ accountId, envelope, tx }: CommandContext): Promise<CommandResult> {
    const payload = envelope.payload;
    const metricId = BigInt(requireString(payload, 'metricId'));
    const date = requireString(payload, 'date');
    const value = requireNumberString(payload, 'value');
    const source: MetricEntry.Source = 'source' in payload ? requireEnum(payload, 'source', ENTRY_SOURCES) : 'manual';
    const questLogId = 'questLogId' in payload ? BigInt(requireString(payload, 'questLogId')) : null;

    await this.metricRepository.ensureBuiltinsSeeded(tx, accountId);
    const metric = await this.metricRepository.findByIdInTx(tx, metricId);
    if (!metric) throw AppErrorCode.MET_002.create();

    const entry = await this.metricEntryRepository.register(tx, accountId, { metricId, date, value, source, questLogId });

    if (metric.isHealth) {
      const offers = await findThresholdOffers(tx, accountId, metric, entry);
      return { status: 'applied', result: { id: String(entry.id), offers: offers.map(serializeOffer) } };
    }

    this.telemetry.emit({ name: 'metric_entry_recorded', pseudoId: pseudoAccountId(accountId), occurredAtMs: Date.now(), valueType: metric.valueType, source: entry.source });
    return { status: 'applied', result: { id: String(entry.id), offers: [] } };
  }
}
