/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DeltaRepository, DeltaSourceRegistry, type KeysetDeltaSource, type SnapshotDeltaSource } from '@modules/sync';
import { type MealPreset, schema } from '@server/database';

import { MealPresetRepository } from './meal-preset.repository';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

function toPresetRow(preset: MealPreset.Row): Record<string, unknown> {
  return { id: String(preset.id), name: preset.name, calories: preset.calories, mealType: preset.mealType, note: preset.note };
}

/**
 * Registers the `journal_entries`/`meals`/`weights`/`side_quests` keyset domains and the `meal_presets`
 * snapshot domain (ARCHITECTURE §12.2) — `meal_presets` carries no `sync_seq`, mirroring
 * `FinanceDeltaSources`'s `expense_categories` snapshot for the same reason: a small, closed per-account
 * set is cheaper synced whole than watermarked.
 */
@Injectable()
export class QuickLogsDeltaSources implements OnModuleInit {
  constructor(
    private readonly registry: DeltaSourceRegistry,
    private readonly deltaRepository: DeltaRepository,
    private readonly mealPresetRepository: MealPresetRepository,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.keysetSource('journal_entries', schema.journalEntries));
    this.registry.register(this.keysetSource('meals', schema.meals));
    this.registry.register(this.keysetSource('weights', schema.weights));
    this.registry.register(this.keysetSource('side_quests', schema.sideQuests));
    this.registry.register(this.presetsSource());
  }

  private keysetSource(domain: string, table: Parameters<DeltaRepository['fetchSince']>[0]): KeysetDeltaSource {
    return { domain, kind: 'keyset', fetch: ({ since, limit }) => this.deltaRepository.fetchSince(table, since, limit) };
  }

  private presetsSource(): SnapshotDeltaSource {
    return { domain: 'meal_presets', kind: 'snapshot', fetch: () => this.mealPresetRepository.list().then(presets => presets.map(toPresetRow)) };
  }
}
