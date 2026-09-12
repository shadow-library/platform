export type WriterClass = 'standard' | 'permissive';

export type DecisionPoint = 'canon.augment' | 'brief.policy' | 'call.route' | 'context.contribute' | 'prompt.contribute';

export interface PluginFormField {
  name: string;
  type: 'string' | 'number' | 'boolean';
  title: string;
  description?: string;
  enum?: string[];
  widget?: 'input' | 'textarea' | 'checkbox' | 'select';
  default?: string | number | boolean;
}

export interface PluginForm {
  fields: PluginFormField[];
  required?: string[];
}

export interface PluginManifest {
  id: string;
  version: string;
  title: string;
  description: string;
  decisionPoints: DecisionPoint[];
  /** Subset of decisionPoints this plugin claims exclusively; only 'brief.policy' and 'call.route' are claimable. */
  exclusive?: DecisionPoint[];
  forms: Record<string, PluginForm>;
  actions?: PluginAction[];
}

export interface PluginAction {
  id: string;
  op: string;
  label: string;
  surface: 'settings' | 'chapter' | 'volume' | 'novel';
  form?: string;
}

export interface CallContext {
  role: string;
  promptKey: string;
  chapter?: number;
  writerClass: WriterClass;
  config: unknown;
}

export interface BriefSummary {
  chapter: number;
  title: string;
  body: string;
  volumeKey: string | null;
  arcKey: string | null;
  writeMode: 'standard' | 'external';
}

export interface PluginContextSection {
  key: string;
  title: string;
  rendered: string;
  segment: 'stable' | 'volatile';
  minWriterClass: WriterClass;
  required?: boolean;
}

export interface WritingKnobs {
  instructions?: string;
  targetWords?: { min: number; max: number };
}

/**
 * The ops a plugin may emit, structurally mirroring the `ChangeOp` members the proposal allowlist permits.
 * Declared here rather than imported so a plugin never depends on `@modules/refinement`; the host validates
 * every emitted op against the real `OP_SPECS` before a proposal is staged.
 */
export type PluginChangeOp = (
  | {
      op: 'entity.upsert';
      entityKey: string;
      type: 'character' | 'faction' | 'location' | 'power_rule' | 'item' | 'concept';
      name?: string;
      status?: string;
      motivation?: string;
      notes?: string;
      body?: string;
    }
  | { op: 'entity.remove'; entityKey: string }
  | { op: 'fact.upsert'; factKey: string; body?: string; subjects?: string[]; constraintNote?: string; terms?: string[]; revealChapter?: number }
  | { op: 'fact.remove'; factKey: string }
  | { op: 'bible_document.upsert'; section: string; slug: string; frontmatter?: Record<string, unknown>; body?: string }
  | { op: 'bible_document.remove'; section: string; slug: string }
  | { op: 'brief.update'; chapter: number; title?: string; body?: string; writeMode?: 'standard' | 'external' }
  | { op: 'arc.upsert'; arcKey: string; volumeKey: string; title?: string; objective?: string; escalation?: string; payoff?: string; hook?: string; body?: string }
) & {
  /** One sentence on why this change is being made; shown to the author beside the op and never stored with the artifact. */
  rationale?: string;
};

export interface PluginEvent {
  type: string;
  payload: unknown;
}

export interface ForgePlugin {
  id: string;
  manifest(): PluginManifest;
  onLoad?(): void | Promise<void>;
  onEnable?(ctx: ProjectContext): void | Promise<void>;
  onDisable?(ctx: ProjectContext): void | Promise<void>;

  augmentCanon?(ctx: ProjectContext): Promise<PluginChangeOp[]> | PluginChangeOp[];
  decideBriefPolicy?(ctx: ProjectContext & { briefs: BriefSummary[] }): Promise<PluginChangeOp[]> | PluginChangeOp[];
  decideWriterClass?(ctx: ProjectContext & CallContext): WriterClass | undefined;
  contributeContextSections?(ctx: ProjectContext & CallContext): PluginContextSection[];
  contributeSystemMessages?(ctx: ProjectContext & CallContext): { role: 'system'; content: string }[];

  contributeWritingKnobs?(ctx: ProjectContext & CallContext): WritingKnobs;
  registerPrompts?(): unknown[];
  invoke?(ctx: ProjectContext & { op: string; payload: unknown }): Promise<unknown>;
  onEvent?(ctx: ProjectContext & { event: PluginEvent }): void | Promise<void>;
}

export interface ProjectContext {
  config: unknown;
  host: ScopedPluginHost;
}

export interface ScopedPluginHost {
  log: {
    debug(msg: string, meta?: Record<string, unknown>): void;
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
  };
  kv: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
  read: {
    brief(chapter: number): Promise<unknown>;
    draft(chapter: number): Promise<unknown>;
    entities(): Promise<unknown[]>;
    facts(): Promise<unknown[]>;
  };
}

/** What `createPlugin` receives at load time — not project-scoped, because no project is in scope during boot. */
export interface PluginHostApi {
  log: ScopedPluginHost['log'];
}

export type PluginFactory = (host: PluginHostApi) => ForgePlugin;
