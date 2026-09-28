import { eq } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';
import { buildRenderGlobals } from '@modules/template/render-context';
import { type TemplateEngineService } from '@modules/template/rendering/template-engine.service';
import { buildSampleData } from '@modules/template/variable-schema.util';

import { BASELINE_LAYOUTS, BASELINE_PARTIALS, BASELINE_TEMPLATES, type LayoutFixture, type PartialFixture, type TemplateFixture } from './baseline.data';

export interface DesignSystem {
  layouts: Record<string, string>;
  partials: Record<string, string>;
}

export interface BaselineCatalogue {
  layouts: LayoutFixture[];
  partials: PartialFixture[];
  templates: TemplateFixture[];
}

/** The same content the layout publish path wraps to prove a shell renders. */
const LAYOUT_PROBE_CONTENT = '<p>preview</p>';

const logger = Logger.getLogger(APP_NAME, 'BaselineRenderGate');

export function fixtureDesignSystem(catalogue: BaselineCatalogue): DesignSystem {
  return {
    layouts: Object.fromEntries(catalogue.layouts.map(layout => [layout.layoutKey, layout.body])),
    partials: Object.fromEntries(catalogue.partials.map(partial => [partial.partialKey, partial.body])),
  };
}

export async function loadPublishedDesignSystem(db: PrimaryDatabase): Promise<DesignSystem> {
  const layouts = await db
    .select({ key: schema.layouts.layoutKey, body: schema.layoutVersions.body })
    .from(schema.layoutVersions)
    .innerJoin(schema.layouts, eq(schema.layouts.id, schema.layoutVersions.layoutId))
    .where(eq(schema.layoutVersions.status, 'PUBLISHED'));
  const partials = await db
    .select({ key: schema.partials.partialKey, body: schema.partialVersions.body })
    .from(schema.partialVersions)
    .innerJoin(schema.partials, eq(schema.partials.id, schema.partialVersions.partialId))
    .where(eq(schema.partialVersions.status, 'PUBLISHED'));
  return { layouts: Object.fromEntries(layouts.map(row => [row.key, row.body])), partials: Object.fromEntries(partials.map(row => [row.key, row.body])) };
}

/**
 * The seed's stand-in for the publish path's render gate: nothing it writes goes live without first rendering against sample data.
 * Layouts and templates render against the design system already live in the datastore, exactly as their publish does. Partial publish has
 * no gate of its own, so a partial is admitted only while the whole fixture catalogue renders against the fixture design system.
 */
export class BaselineRenderGate {
  constructor(
    private readonly engine: TemplateEngineService,
    private readonly liveDesignSystem: () => Promise<DesignSystem>,
    private readonly catalogue: BaselineCatalogue = { layouts: BASELINE_LAYOUTS, partials: BASELINE_PARTIALS, templates: BASELINE_TEMPLATES },
  ) {}

  async catalogueRenders(): Promise<boolean> {
    const design = fixtureDesignSystem(this.catalogue);
    for (const layout of this.catalogue.layouts) {
      if (!(await this.passes(`layout ${layout.layoutKey}`, () => renderLayout(this.engine, layout.body, design)))) return false;
    }
    for (const fixture of this.catalogue.templates) {
      if (!(await this.passes(`template ${fixture.templateKey}`, () => renderTemplate(this.engine, fixture, design)))) return false;
    }
    return true;
  }

  async layoutRenders(fixture: LayoutFixture): Promise<boolean> {
    const design = await this.liveDesignSystem();
    return this.passes(`layout ${fixture.layoutKey}`, () => renderLayout(this.engine, fixture.body, design));
  }

  async templateRenders(fixture: TemplateFixture): Promise<boolean> {
    const design = await this.liveDesignSystem();
    return this.passes(`template ${fixture.templateKey}`, () => renderTemplate(this.engine, fixture, design));
  }

  private async passes(subject: string, render: () => Promise<unknown>): Promise<boolean> {
    try {
      await render();
      return true;
    } catch (error) {
      logger.warn('baseline fixture failed its render gate', { subject, error });
      return false;
    }
  }
}

export async function renderLayout(engine: TemplateEngineService, body: string, design: DesignSystem): Promise<void> {
  const data = { ...buildRenderGlobals(), ...buildSampleData({ variables: {} }) };
  await engine.render({ channel: 'EMAIL', subject: null, body: LAYOUT_PROBE_CONTENT, layout: body, partials: design.partials, data });
}

/** Renders every channel of the fixture as its template publish would: its own sample data, the design system's partials, its layout if live. */
export async function renderTemplate(engine: TemplateEngineService, fixture: TemplateFixture, design: DesignSystem): Promise<void> {
  const data = { ...buildRenderGlobals(), ...buildSampleData({ variables: fixture.variables }) };
  for (const content of fixture.channels) {
    const layout = content.channel === 'EMAIL' && content.layoutKey ? (design.layouts[content.layoutKey] ?? null) : null;
    await engine.render({ channel: content.channel, subject: content.subject ?? null, body: content.body, layout, partials: design.partials, data });
  }
}
