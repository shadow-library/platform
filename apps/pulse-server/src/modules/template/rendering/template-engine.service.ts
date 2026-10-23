import juice from 'juice';
import { type Context, type Emitter, type FilterImplOptions, Liquid, Tag, type TagToken, type TopLevelToken, Value } from 'liquidjs';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { Notification } from '@server/database';

export interface RenderInput {
  channel: Notification.Channel;
  subject: string | null;
  body: string;
  /** EMAIL only: the layout shell with a `{{ content | raw }}` slot; null delivers the fragment unwrapped. */
  layout?: string | null;
  partials?: Record<string, string>;
  data: Record<string, unknown>;
}

export interface RenderOutput {
  subject: string | null;
  body: string;
}

const LOGGER_NAMESPACE = `${APP_NAME}/rendering`;
/** Liquid aborts a render past this so a pathological template cannot hang a worker. */
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
 * LiquidJS drops `outputEscape` whenever the last filter is `raw`, so `{{ payload.field | raw }}` would inject unescaped markup into emails and pulse-web.
 * Overriding `raw` to escape everything except {@link SafeHtml} closes that bypass at render time, including for already-stored templates.
 */
const HTML_RAW_FILTER: FilterImplOptions = {
  raw: true,
  handler: renderSafeHtml,
};

/**
 * `{% echo %}` (and `echo` inside `{% liquid %}`) renders through LiquidJS's `Value`, never `Output`, so neither `outputEscape` nor
 * {@link HTML_RAW_FILTER} applies; this override escapes echo output like `{{ x }}`.
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

/** Sandboxed LiquidJS (no filesystem or network, bounded render time); HTML output escapes every author value path, SMS/PUSH render unescaped. */
@Injectable()
export class TemplateEngineService {
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, TemplateEngineService.name);

  async render(input: RenderInput): Promise<RenderOutput> {
    const partials = input.partials ?? {};
    const isHtml = input.channel === 'EMAIL';
    const engine = this.createEngine(partials, isHtml);

    try {
      // Subject and push title always render unescaped (plain text), whatever the channel.
      const subject = input.subject != null ? await this.textEngine(partials).parseAndRender(input.subject, input.data) : null;
      const content = await engine.parseAndRender(input.body, input.data);

      if (!isHtml) return { subject, body: content };

      const composed = input.layout ? await engine.parseAndRender(input.layout, { ...input.data, content: new SafeHtml(content) }) : content;
      /** Email clients that strip <head> CSS need the layout's styles inlined. */
      const body = juice(composed);
      return { subject, body };
    } catch (error) {
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
