import juice from 'juice';
import { type Context, type Emitter, type FilterImplOptions, Liquid, Tag, type TagToken, type TopLevelToken, Value } from 'liquidjs';
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

/** The framework's pre-rendered content fragment; the only value the HTML engine emits unescaped. Unforgeable from author data, which is never a class instance. */
class SafeHtml {
  constructor(readonly value: string) {}

  toString(): string {
    return this.value;
  }
}

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' } as const;
const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, char => HTML_ESCAPE[char as keyof typeof HTML_ESCAPE]);
const renderSafeHtml = (value: unknown): string => (value instanceof SafeHtml ? value.value : escapeHtml(value));

/**
 * LiquidJS drops `outputEscape` whenever the last filter is `raw`, so any body/partial author writing
 * `{{ payload.field | raw }}` injects unescaped markup into transactional/OTP emails and into pulse-web.
 * Overriding `raw` to escape everything except the framework's {@link SafeHtml} `content` slot closes that
 * bypass at render time — covering already-stored templates — while `{{ content | raw }}` keeps working.
 */
const HTML_RAW_FILTER: FilterImplOptions = {
  raw: true,
  handler: renderSafeHtml,
};

/**
 * `{% echo %}` — and `{% liquid %}`, whose `echo` statements dispatch through this same registered tag —
 * renders through LiquidJS's `Value`, never `Output`, so `outputEscape` never runs and {@link HTML_RAW_FILTER}
 * never sees it. This HTML-engine override escapes echo output like `{{ x }}`, emitting only {@link SafeHtml}
 * unescaped, so the emit path cannot inject markup; `{% assign %}`/`{% if %}`/`{% for %}` control flow is untouched.
 */
class HtmlEchoTag extends Tag {
  private readonly value: Value | null;

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid);
    this.tokenizer.skipBlank();
    this.value = this.tokenizer.end() ? null : new Value(this.tokenizer.readFilteredValue(), liquid);
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    if (!this.value) return;
    emitter.write(renderSafeHtml(yield this.value.value(ctx, false)));
  }
}

/**
 * The template rendering engine. Renders CMS-authored content (and, for email, composes it into a
 * layout with reusable partials) using a **sandboxed** LiquidJS: no code execution, no filesystem or
 * network access, bounded render time, and — for HTML — **auto-escaped** variables so recipient data
 * can never inject markup. Every author value path is escaped: `{{ x }}` via LiquidJS's `outputEscape`,
 * the `| raw` filter via {@link HTML_RAW_FILTER}, and `{% echo %}` / `{% liquid %}` via {@link HtmlEchoTag};
 * only the framework's pre-rendered {@link SafeHtml} `content` slot is emitted unescaped. SMS/PUSH render in
 * a plain-text engine (no HTML escaping). Email output is CSS-inlined with juice for client compatibility.
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

      const composed = input.layout ? await engine.parseAndRender(input.layout, { ...input.data, content: new SafeHtml(content) }) : content;
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
    const engine = new Liquid({
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
    if (isHtml) {
      engine.registerFilter('raw', HTML_RAW_FILTER);
      engine.registerTag('echo', HtmlEchoTag);
    }
    return engine;
  }
}
