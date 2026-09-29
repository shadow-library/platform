import { type Refinement } from '@server/database';

import { isWriterExcludedBibleDoc } from '../ai/context/bible-docs';
import { requiredEntityTypesForSlug } from '../bible/bible-manifest';
import { type RecordFields } from './artifact-state';
import { ACTION_TYPES, type ActionType, type ChangeOp, changeSetRefs, declaredOpFields, type EntityUpsertOp, isActionOp, type OpType } from './change-set';

export type OpSide = 'direct' | 'card';
export type CardReason =
  | 'just_discussing'
  | 'manual_mode'
  | 'held_for_review'
  | 'always_card'
  | 'not_allowlisted'
  | 'no_quote'
  | 'quote_not_found'
  | 'tentative'
  | 'removal'
  | 'novel_content'
  | 'depends_on_card';
export type AlwaysCardRule =
  | 'removal'
  | 'action'
  | 'plan'
  | 'prose'
  | 'planner_only_page'
  | 'replaces_story'
  | 'secret_truth'
  | 'secret_gating'
  | 'volume_structure'
  | 'promise_disposition'
  | 'promise_progress'
  | 'promise_reuse'
  | 'planner_only_field'
  | 'notebook_direction';

export const OP_SOURCES = ['quoted', 'idea'] as const;
/** `quoted` when the quote rule backs an applied op with the author's words, `idea` for one Edit freely applied without them. */
export type OpSource = (typeof OP_SOURCES)[number];

export interface DirectDisposition {
  index: number;
  side: 'direct';
  source: OpSource;
}

export interface CardDisposition {
  index: number;
  side: 'card';
  reason: CardReason;
  rule?: AlwaysCardRule;
}

export type OpDisposition = DirectDisposition | CardDisposition;

export interface WritePolicyState {
  /** Every ref the change-set writes that exists, with its current fields (`loadCurrentRecords`); `premise` holds the story fields. */
  current: ReadonlyMap<string, RecordFields>;
}

export interface WritePolicyInput {
  ops: readonly ChangeOp[];
  /** The author's message in this turn — the only text a quote may be found in. */
  authorMessage: string;
  /** Where an applied op's words must come from; the author's message unless a pass also hands over the notes it organises. */
  vocabulary?: string;
  mode: Refinement.ChatMode;
  /** What an auto-mode pass does with an op the quote rule does not back and `IDEA_POLICY` lets through: only a chat turn applies it as an idea. */
  ideas?: 'apply' | 'card';
  justDiscussing?: boolean;
  /** A warning on the turn (negation echo, planner-only read) holds every op for review. */
  held: boolean;
  state: WritePolicyState;
}

export interface ChangeSetSplit {
  ops: ChangeOp[];
  direct: ChangeOp[];
  cards: ChangeOp[];
  /** Each direct op's provenance, aligned with `direct`. */
  sources: OpSource[];
  dispositions: OpDisposition[];
  /** True when the hold turned at least one op that would have applied into a card. */
  held: boolean;
}

export const DIRECT_OP_KINDS: ReadonlySet<OpType> = new Set([
  'premise.update',
  'bible_document.upsert',
  'entity.upsert',
  'fact.upsert',
  'volume.upsert',
  'promise.create',
  'promise.update',
]);

export const ALWAYS_CARD: Readonly<Partial<Record<OpType, AlwaysCardRule>>> = {
  'bible_document.remove': 'removal',
  'volume.remove': 'removal',
  'brief.remove': 'removal',
  'draft.remove': 'removal',
  'entity.remove': 'removal',
  'fact.remove': 'removal',
  'milestone.remove': 'removal',
  'promise.drop': 'removal',
  'brief.update': 'plan',
  'draft.update': 'prose',
  'promise.set_payoff': 'promise_disposition',
  ...(Object.fromEntries(ACTION_TYPES.map(action => [action, 'action'])) as Record<ActionType, AlwaysCardRule>),
};

/**
 * What Edit freely does with an op the author's words do not back: apply it as an `idea`, or keep it a card under the named rule. Keyed by
 * every kind, so a new kind does not compile until it is classified here. A secret's truth, tells and scope are never the model's to settle.
 */
export const IDEA_POLICY: Readonly<Record<OpType, 'idea' | AlwaysCardRule>> = {
  'premise.update': 'idea',
  'bible_document.upsert': 'idea',
  'bible_document.remove': 'removal',
  'volume.upsert': 'idea',
  'volume.remove': 'removal',
  'brief.update': 'plan',
  'brief.remove': 'removal',
  'draft.update': 'prose',
  'draft.remove': 'removal',
  'entity.upsert': 'idea',
  'entity.remove': 'removal',
  'fact.upsert': 'secret_truth',
  'fact.remove': 'removal',
  'milestone.upsert': 'idea',
  'milestone.remove': 'removal',
  'promise.create': 'idea',
  'promise.update': 'idea',
  'promise.set_payoff': 'promise_disposition',
  'promise.drop': 'removal',
  'organise.rule': 'notebook_direction',
  ...(Object.fromEntries(ACTION_TYPES.map(action => [action, 'action'])) as Record<ActionType, AlwaysCardRule>),
};

const MIN_QUOTE_WORDS = 3;
const NOVELTY_FLOOR = 4;
const REMOVAL_FLOOR = 4;
const BUDGET_SHARE = 0.25;
const STORY_FIELDS = declaredOpFields('premise.update');
const PAYOFF_FIELDS = ['payoffMilestoneKey', 'payoffVolumeKey', 'payoffWindow'] as const;
const FACT_DIRECT_FIELDS: ReadonlySet<string> = new Set(['factKey', 'body', 'subjects', 'constraintNote', 'terms']);
// A record's identifying key is exempt from the novelty budget once the record exists — but on the op that creates it (P4-41), the key
// is itself unreviewed written content: a model or author could smuggle a secret into a fresh key and repeat it verbatim in a text field
// for free. `DISPLAY_KEY_FIELDS` (a page's own ref, an entity's display name) stay exempt either way.
const IDENTIFIER_KEY_FIELDS = ['entityKey', 'factKey', 'volumeKey', 'milestoneKey', 'key'] as const;
const DISPLAY_KEY_FIELDS = ['section', 'slug', 'name'] as const;
const TEXT_FIELDS: Readonly<Partial<Record<OpType, readonly string[]>>> = {
  'premise.update': STORY_FIELDS,
  'bible_document.upsert': ['body', 'frontmatter'],
  'volume.upsert': ['title', 'objective', 'body'],
  'entity.upsert': ['status', 'motivation', 'notes', 'body'],
  'fact.upsert': ['body', 'constraintNote', 'terms'],
  'promise.create': ['label'],
  'promise.update': ['label'],
  'milestone.upsert': ['label'],
};

const HEDGE_CUE =
  /\b(if|maybe|perhaps|might|could|probably|possibly|wonder|whether|suppose|imagine|not sure|or should)\b|也许|或许|可能|大概|如果|要是|もし|かもしれ|たぶん|多分|아마|만약/;
const NEGATION_CUE = /\b(not|no|never|without|nor|cannot)\b|n't\b|不是|没有|沒有|并非|ではない|じゃない|아니/;
const REJECTION_CUE = /\b(bad idea|terrible idea|no way|scrap|drop that|instead)\b/;
const CLAUSE_BREAK = /[,;:()、]|\s-\s/;
const TRAILING_CLOSERS = /["'”’)\]」』\s]+$/;
// Latin sentences end at a terminator (and any closing quote or bracket) followed by space; CJK ones need no space after it.
const SENTENCE_BREAK = /(?<=[.!?]["'”’)\]]*)\s+|(?<=[。！？][」』"'”’)]*)(?![」』"'”’)])|\n+/;
const SPACELESS_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu;
const STOPWORDS: ReadonlySet<string> = new Set(
  (
    'a an the and or but if then than so as at by for from in into of off on onto out over to up with about after before under again ' +
    'is are was were be been being am do does did done have has had having will would shall should can could may might must ' +
    'i me my we our you your he him his she her it it its they them their this that these those who whom whose which what where when why how ' +
    'not no nor all any both each few more most other some such only own same too very just also there here now one'
  ).split(' '),
);

export function normaliseForQuote(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛ʼ]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimQuoteMarks(quote: string): string {
  return quote.replace(/^["'\s]+|["'\s]+$/g, '');
}

function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Scripts written without spaces count in character bigrams: single characters recur in unrelated words, so they would read nothing as new. */
function bigrams(run: string): string[] {
  if (run.length < 2) return [run];
  return Array.from({ length: run.length - 1 }, (_, i) => run.slice(i, i + 2));
}

export function contentTokens(text: string): string[] {
  const normalised = normaliseForQuote(text);
  const spaceless = (normalised.match(SPACELESS_SCRIPT) ?? []).flatMap(bigrams);
  const words = normalised.replace(SPACELESS_SCRIPT, ' ').match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) ?? [];
  const spaced = words
    .map(word => word.replace(/'s$/, ''))
    .filter(word => word.length > 1 && !STOPWORDS.has(word))
    .map(stem);
  return [...spaced, ...spaceless];
}

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_BREAK)
    .map(normaliseForQuote)
    .filter(sentence => sentence !== '');
}

/** A sentence the author asked, hedged or turned down, whose words therefore never count as said. */
export function sentenceIsTentative(sentence: string): boolean {
  return sentence.replace(TRAILING_CLOSERS, '').endsWith('?') || HEDGE_CUE.test(sentence) || REJECTION_CUE.test(sentence);
}

/** Whitespace-, case- and typography-normalised containment of a quote of at least three content words. */
export function quoteFoundIn(quote: string, text: string): boolean {
  const needle = normaliseForQuote(trimQuoteMarks(quote));
  if (contentTokens(needle).length < MIN_QUOTE_WORDS) return false;
  return normaliseForQuote(text).includes(needle);
}

/**
 * The author asked, wondered or denied rather than stated: the quote's sentence is a question or hedged, its clause negates before the
 * quote, or the sentence turns the idea down after it. Rejection cues only count after the quote — "instead, X" states X.
 */
export function quoteIsTentative(quote: string, text: string): boolean {
  const needle = normaliseForQuote(trimQuoteMarks(quote));
  const sentence = [...splitSentences(text), normaliseForQuote(text)].find(candidate => candidate.includes(needle));
  if (!sentence) return false;
  const at = sentence.indexOf(needle);
  const clause = sentence.slice(0, at).split(CLAUSE_BREAK).pop() ?? '';
  const after = sentence.slice(at + needle.length);
  const asked = sentence.replace(TRAILING_CLOSERS, '').endsWith('?') || HEDGE_CUE.test(sentence);
  return asked || NEGATION_CUE.test(clause) || REJECTION_CUE.test(after);
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  if (value !== null && typeof value === 'object') return Object.values(value).map(textOf).join(' ');
  return '';
}

interface AuthorWords {
  /** Words of the sentences the author stated. */
  stated: ReadonlySet<string>;
  /** Words found only in sentences the author asked, hedged or turned down. */
  hedged: ReadonlySet<string>;
}

export function authorWords(vocabulary: string): AuthorWords {
  const sentences = splitSentences(vocabulary);
  const stated = new Set(sentences.filter(sentence => !sentenceIsTentative(sentence)).flatMap(contentTokens));
  const hedged = new Set(
    sentences
      .filter(sentenceIsTentative)
      .flatMap(contentTokens)
      .filter(token => !stated.has(token)),
  );
  return { stated, hedged };
}

interface FieldTokens {
  written: ReadonlySet<string>;
  before: ReadonlySet<string>;
}

function fieldTokens(op: ChangeOp, current: RecordFields | undefined): FieldTokens[] {
  const fields = op as unknown as Record<string, unknown>;
  const own = new Set([
    ...DISPLAY_KEY_FIELDS.flatMap(field => contentTokens(textOf(fields[field] ?? current?.[field]))),
    ...IDENTIFIER_KEY_FIELDS.flatMap(field => contentTokens(textOf(current?.[field]))),
  ]);
  return (TEXT_FIELDS[op.op] ?? [])
    .filter(field => fields[field] !== undefined)
    .map(field => ({
      written: new Set(contentTokens(textOf(fields[field])).filter(token => !own.has(token))),
      before: new Set(contentTokens(textOf(current?.[field])).filter(token => !own.has(token))),
    }));
}

function novelTokens(tokens: readonly FieldTokens[], words: AuthorWords): string[] {
  return [...new Set(tokens.flatMap(field => [...field.written].filter(token => !words.stated.has(token) && !field.before.has(token))))];
}

/** Words the op writes that the author only asked or hedged about — what a quote from a neighbouring stated sentence would launder. */
export function launders(op: ChangeOp, current: RecordFields | undefined, vocabulary: string): boolean {
  const words = authorWords(vocabulary);
  return novelTokens(fieldTokens(op, current), words).some(token => words.hedged.has(token));
}

/**
 * The novelty budget, over the whole op: across its text fields it may carry at most max(4, 25%) distinct content words found neither in
 * the author's stated sentences nor in the field's current value — the record's own key and name never count.
 */
export function exceedsNoveltyBudget(op: ChangeOp, current: RecordFields | undefined, vocabulary: string): boolean {
  const tokens = fieldTokens(op, current);
  const written = new Set(tokens.flatMap(field => [...field.written]));
  return novelTokens(tokens, authorWords(vocabulary)).length > Math.max(NOVELTY_FLOOR, written.size * BUDGET_SHARE);
}

/** The removal budget, per field: a rewrite may drop at most max(4, 25%) of a filled field's distinct content words, so a truncation is reviewed. */
export function exceedsRemovalBudget(op: ChangeOp, current: RecordFields | undefined): boolean {
  return fieldTokens(op, current).some(({ written, before }) => [...before].filter(token => !written.has(token)).length > Math.max(REMOVAL_FLOOR, before.size * BUDGET_SHARE));
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function clearsField(op: ChangeOp, current: RecordFields | undefined): boolean {
  if (!current) return false;
  const fields = op as unknown as Record<string, unknown>;
  return declaredOpFields(op.op).some(field => fields[field] !== undefined && !isFilled(fields[field]) && isFilled(current[field]));
}

/** `someday: true` clears every payoff target at once without naming one, so `clearsField` alone would miss it. */
function clearsPayoff(op: ChangeOp, current: RecordFields | undefined): boolean {
  return op.op === 'promise.set_payoff' && op.someday === true && PAYOFF_FIELDS.some(field => isFilled(current?.[field]));
}

/** The rule that keeps an op a card whatever its quote, from the op and what it would overwrite. */
export function alwaysCardRule(op: ChangeOp, state: WritePolicyState): AlwaysCardRule | undefined {
  const [ref] = changeSetRefs([op]);
  const current = ref === undefined ? undefined : state.current.get(ref);
  if (op.op === 'promise.set_payoff' && (clearsPayoff(op, current) || clearsField(op, current))) return 'removal';
  const kindRule = ALWAYS_CARD[op.op];
  if (kindRule) return kindRule;
  if (clearsField(op, current)) return 'removal';
  const fields = op as unknown as Record<string, unknown>;

  if (op.op === 'premise.update') return STORY_FIELDS.some(field => fields[field] !== undefined && isFilled(current?.[field])) ? 'replaces_story' : undefined;
  if (op.op === 'bible_document.upsert') return isWriterExcludedBibleDoc({ section: op.section, slug: op.slug }) ? 'planner_only_page' : undefined;
  if (op.op === 'volume.upsert') return op.body !== undefined || (current && op.ordinal !== undefined) ? 'volume_structure' : undefined;
  if (op.op === 'promise.create') return current && current['status'] !== 'open' ? 'promise_reuse' : undefined;
  if (op.op === 'promise.update') return op.status !== undefined ? 'promise_disposition' : op.lastAdvancedChapter !== undefined ? 'promise_progress' : undefined;
  if (op.op !== 'fact.upsert') return undefined;
  if (current && op.body !== undefined) return 'secret_truth';
  const gates = Object.keys(fields).some(field => declaredOpFields(op.op).includes(field) && !FACT_DIRECT_FIELDS.has(field));
  return gates || (current && op.terms !== undefined) ? 'secret_gating' : undefined;
}

/** Plans cite Story Bible pages as `bible_doc:`, change-sets name them `doc:`. */
function asChangeSetRef(ref: string): string {
  return ref.startsWith('bible_doc:') ? `doc:${ref.slice('bible_doc:'.length)}` : ref;
}

/** The records an op names without writing them: the dependency edges of the split and of an undo's impact. */
export function opReferences(op: ChangeOp): string[] {
  if (isActionOp(op)) {
    const chapterRefs = 'chapter' in op && typeof op.chapter === 'number' ? [`chapter:${op.chapter}`, `draft:${op.chapter}`] : [];
    const volumeRefs = 'volumeKey' in op && typeof op.volumeKey === 'string' ? [`volume:${op.volumeKey}`] : [];
    return [...chapterRefs, ...volumeRefs];
  }
  if (op.op === 'fact.upsert') {
    const subjects = (op.subjects ?? []).map(key => `entity:${key}`);
    const unlock = (op.unlock?.all ?? []).flatMap(term => {
      if ('milestone' in term) return [`milestone:${term.milestone}`];
      if ('volume' in term) return [`volume:${term.volume}`];
      return [];
    });
    return [...subjects, ...unlock];
  }
  if (op.op === 'milestone.upsert') return op.subjectEntityKey ? [`entity:${op.subjectEntityKey}`] : [];
  if (op.op === 'promise.set_payoff')
    return [...(op.payoffMilestoneKey ? [`milestone:${op.payoffMilestoneKey}`] : []), ...(op.payoffVolumeKey ? [`volume:${op.payoffVolumeKey}`] : [])];
  if (op.op !== 'brief.update') return [];

  const entities = [
    op.pov,
    ...(op.scenes ?? []).map(scene => scene.pov),
    ...(op.knowledgeContract?.pov ?? []),
    ...(op.knowledgeContract?.learns ?? []).map(learn => learn.entityKey),
  ];
  return [
    ...(op.volumeKey ? [`volume:${op.volumeKey}`] : []),
    ...entities.flatMap(key => (key ? [`entity:${key}`] : [])),
    ...(op.knowledgeContract?.learns ?? []).map(learn => `fact:${learn.factKey}`),
    ...(op.claimedMilestones ?? []).map(key => `milestone:${key}`),
    ...(op.contextRefs ?? []).map(asChangeSetRef),
  ];
}

/** Why the quote rule alone would keep an op off the direct side, or nothing when the author's words back it. */
function quoteVerdict(op: ChangeOp, current: RecordFields | undefined, input: WritePolicyInput): CardReason | undefined {
  if (!DIRECT_OP_KINDS.has(op.op)) return 'not_allowlisted';
  if (typeof op.quote !== 'string' || op.quote.trim() === '') return 'no_quote';
  if (!quoteFoundIn(op.quote, input.authorMessage)) return 'quote_not_found';
  const vocabulary = input.vocabulary ?? input.authorMessage;
  if (quoteIsTentative(op.quote, input.authorMessage) || launders(op, current, vocabulary)) return 'tentative';
  if (exceedsRemovalBudget(op, current)) return 'removal';
  if (exceedsNoveltyBudget(op, current, vocabulary)) return 'novel_content';
  return undefined;
}

/** Why Edit freely keeps an unbacked op a card: its kind's `IDEA_POLICY`, or a volume's goal, which is planner-only until the writer reaches that volume. */
export function ideaCardRule(op: ChangeOp): AlwaysCardRule | undefined {
  const policy = IDEA_POLICY[op.op];
  if (policy !== 'idea') return policy;
  return op.op === 'volume.upsert' && op.objective !== undefined ? 'planner_only_field' : undefined;
}

interface Judged {
  disposition: OpDisposition;
  /** The quote rule's reason for an op applied as an idea: where it lands if it has to wait on a card after all. */
  verdict?: CardReason;
}

/** An idea kept a card keeps the quote rule's reason, so a turned-down one is still filtered; a truncation drops the author's words, so it is reviewed. */
function intrinsicDisposition(op: ChangeOp, index: number, input: WritePolicyInput, appliesIdeas: boolean): Judged {
  const rule = alwaysCardRule(op, input.state);
  if (rule) return { disposition: { index, side: 'card', reason: 'always_card', rule } };
  const [ref] = changeSetRefs([op]);
  const current = ref === undefined ? undefined : input.state.current.get(ref);
  const verdict = quoteVerdict(op, current, input);
  if (!verdict) return { disposition: { index, side: 'direct', source: 'quoted' } };
  if (!appliesIdeas) return { disposition: { index, side: 'card', reason: verdict } };
  const ideaRule = ideaCardRule(op);
  if (ideaRule) return { disposition: { index, side: 'card', reason: verdict, rule: ideaRule } };
  if (exceedsRemovalBudget(op, current)) return { disposition: { index, side: 'card', reason: 'removal' } };
  return { disposition: { index, side: 'direct', source: 'idea' }, verdict };
}

/** A page body in an entity-bearing section is valid only beside records of the types it owes (`validateChangeSet`), so it follows them to the cards. */
function awaitsCardEntities(op: ChangeOp, directTypes: ReadonlySet<string>, cardTypes: ReadonlySet<string>): boolean {
  if (op.op !== 'bible_document.upsert' || typeof op.body !== 'string' || op.body.trim() === '') return false;
  const required = requiredEntityTypesForSlug(op.section, op.slug);
  return required.length > 0 && !required.some(type => directTypes.has(type)) && required.some(type => cardTypes.has(type));
}

/**
 * An op that writes or names a record only a card op would create cannot apply before that card is accepted, so it joins the card —
 * transitively, since the op it joins may create records of its own. A card that names a record a direct op creates stays a card: the
 * direct side applies first and the cards are staged after it, so their baseline already holds the record.
 */
function moveDependentsToCards(ops: readonly ChangeOp[], judged: Judged[], current: ReadonlyMap<string, RecordFields>): void {
  const created = (op: ChangeOp) => changeSetRefs([op]).filter(ref => !current.has(ref));
  const opOf = ({ disposition }: Judged) => ops[disposition.index] as ChangeOp;
  const entityTypes = (side: OpSide) =>
    new Set(judged.filter(j => j.disposition.side === side).flatMap(j => (opOf(j).op === 'entity.upsert' ? [(opOf(j) as EntityUpsertOp).type] : [])));
  const createdByCards = new Set(judged.filter(j => j.disposition.side === 'card').flatMap(j => created(opOf(j))));

  let moved = true;
  while (moved) {
    moved = false;
    for (const entry of judged) {
      if (entry.disposition.side !== 'direct') continue;
      const op = opOf(entry);
      const namesCardRecord = [...changeSetRefs([op]), ...opReferences(op)].some(ref => createdByCards.has(ref));
      if (!namesCardRecord && !awaitsCardEntities(op, entityTypes('direct'), entityTypes('card'))) continue;
      entry.disposition = { index: entry.disposition.index, side: 'card', reason: entry.verdict ?? 'depends_on_card' };
      for (const ref of created(op)) createdByCards.add(ref);
      moved = true;
    }
  }
}

/**
 * The write policy: an op applies without review only when no always-card rule holds, it depends on no card, the author is not just
 * discussing, the session lands changes on its own and nothing on the turn asks for review. There it applies as `quoted` when its kind is
 * allowlisted, its quote is found in the author's message this turn and stated rather than asked, and it adds little the author did not
 * say; a chat turn applies anything else `IDEA_POLICY` admits as an `idea` the author can undo, unless it truncates what a field held.
 * Everything else is a card. An idea that has to wait on a card keeps the quote rule's reason, so a turned-down idea can still be filtered out.
 */
export function splitChangeSet(input: WritePolicyInput): ChangeSetSplit {
  const ops = [...input.ops];
  const override = overrideReason(input);
  const judge = (appliesIdeas: boolean) => {
    const judged = ops.map((op, index) => intrinsicDisposition(op, index, input, appliesIdeas));
    moveDependentsToCards(ops, judged, input.state.current);
    return judged;
  };
  const judged = judge(override === null && input.ideas === 'apply');
  const heldJudged = override === 'held_for_review' && input.ideas === 'apply' ? judge(true) : judged;

  const dispositions = judged.map(({ disposition }): OpDisposition =>
    override && disposition.side === 'direct' ? { index: disposition.index, side: 'card', reason: override } : disposition,
  );
  const eligible = heldJudged.filter(({ disposition }) => disposition.side === 'direct').length;
  const direct = dispositions.filter(d => d.side === 'direct');
  return {
    ops,
    direct: direct.map(d => ops[d.index] as ChangeOp),
    cards: dispositions.filter(d => d.side === 'card').map(d => ops[d.index] as ChangeOp),
    sources: direct.map(d => d.source),
    dispositions,
    held: override === 'held_for_review' && eligible > 0,
  };
}

function overrideReason(input: WritePolicyInput): CardReason | null {
  if (input.justDiscussing) return 'just_discussing';
  if (input.mode !== 'auto') return 'manual_mode';
  return input.held ? 'held_for_review' : null;
}
