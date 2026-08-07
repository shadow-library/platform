/* eslint-disable perfectionist/sort-imports -- Preserve the established import order. */
import juice from 'juice';
import { Liquid } from 'liquidjs';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { Notification } from '@server/database';

export interface RenderInput {
  channel: Notification.Channel;
  /** Plain-text subject line (EMAIL) / notification title (PUSH); null for SMS. */
  subject: string | null;
  /** The content fragment — Liquid source authored in the CMS. */
  body: string;
  /** EMAIL only: the layout shell (Liquid) with a `{{ content | raw }}` slot. Null → deliver the fragment unwrapped. */
  layout?: string | null;
  /** Published partials available to `{% render 'key' %}`, keyed by partialKey. */
  partials?: Record<string, string>;
  /** The complete, schema-validated variable set (optionals pre-filled) rendered into the templates. */
  data: Record<string, unknown>;
}

export interface RenderOutput {
  subject: string | null;
  body: string;
}

const LOGGER_NAMESPACE = `${APP_NAME}/rendering`;
/** Hard ceiling so a pathological template can never hang a worker; Liquid aborts a render past this. */
const RENDER_LIMIT_MS = 1000;

/**
 * The template rendering engine. Renders CMS-authored content (and, for email, composes it into a
 * layout with reusable partials) using a **sandboxed** LiquidJS: no code execution, no filesystem or
 * network access, bounded render time, and — for HTML — **auto-escaped** variables so recipient data
 * can never inject markup ({{ x }} escapes; an author must opt out with `| raw`). SMS/PUSH render in a
 * plain-text engine (no HTML escaping). Email output is CSS-inlined with juice for client compatibility.
 *
 * The service is pure: it takes content/layout/partials as strings (loaded from the datastore by the
 * caller) and returns the rendered `{ subject, body }` — so it is trivially unit-testable and holds no
 * per-tenant state.
 */
@Injectable()
export class TemplateEngineService {
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, TemplateEngineService.name);

  async render(input: RenderInput): Promise<RenderOutput> {
    const partials = input.partials ?? {};
    const isHtml = input.channel === 'EMAIL';
    const engine = this.createEngine(partials, isHtml);

    try {
      /** Subject / push title are always plain text — render them un-escaped regardless of channel. */
      const subject = input.subject != null ? await this.textEngine(partials).parseAndRender(input.subject, input.data) : null;
      const content = await engine.parseAndRender(input.body, input.data);

      if (!isHtml) return { subject, body: content };

      const composed = input.layout ? await engine.parseAndRender(input.layout, { ...input.data, content }) : content;
      /** Inline the layout's <style> onto elements so email clients that strip <head> CSS still render the brand. */
      const body = juice(composed);
      return { subject, body };
    } catch (error) {
      /** A render failure is a template/data defect, not an infra fault — surface it as a domain-level internal error with context. */
      this.logger.error('template render failed', { channel: input.channel, error });
      throw AppError.internal('Template render failed', error instanceof Error ? error : undefined);
    }
  }

  private textEngine(partials: Record<string, string>): Liquid {
    return this.createEngine(partials, false);
  }

  private createEngine(partials: Record<string, string>, isHtml: boolean): Liquid {
    const read = (file: string): string => {
      const value = partials[file];
      /** Thrown inside Liquid's render; caught + re-wrapped by {@link render}'s try/catch. */
      if (value == null) throw new Error(`Unknown partial '${file}'`);
      return value;
    };
    return new Liquid({
      strictVariables: true,
      strictFilters: true,
      relativeReference: false,
      renderLimit: RENDER_LIMIT_MS,
      ...(isHtml ? { outputEscape: 'escape' as const } : {}),
      fs: {
        sep: '/',
        dirname: (path: string) => path,
        resolve: (_root: string, file: string) => file,
        readFileSync: read,
        readFile: (file: string) => Promise.resolve(read(file)),
        existsSync: (file: string) => partials[file] != null,
        exists: (file: string) => Promise.resolve(partials[file] != null),
        contains: () => Promise.resolve(true),
        containsSync: () => true,
      },
    });
  }
}
