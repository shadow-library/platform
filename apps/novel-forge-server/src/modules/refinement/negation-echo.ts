export interface NegationEcho {
  terms: string[];
  excerpt: string;
}

export interface NegationEchoOptions {
  /** Terms the author negated in their own words: an explicit "say there is no X" makes the negation the requested edit. */
  exempt?: ReadonlySet<string>;
}

const NOUN_CUES = new Set(['no', 'without', 'none', 'nor', 'neither', 'nobody', 'nothing', 'nowhere', 'avoid', 'avoids', 'avoiding', 'omit', 'omits', 'lacks', 'lacking']);
const PAIRED_CUES = new Set(['free of', 'instead of', 'rather than', 'absence of']);
const VERBAL_CUES = new Set(['not', 'never']);
const COPULAS = new Set(['is', 'are', 'was', 'were', 'be']);
const CONTRACTED_COPULAS = new Set(["isn't", "aren't", "wasn't", "weren't"]);
// "not X" and "never X" negate an action, which is plot ("never rejoins the caravan"); only a verb about the text itself makes them a removal.
const META_VERBS = new Set([
  'mention',
  'mentions',
  'mentioned',
  'include',
  'includes',
  'included',
  'reference',
  'references',
  'referenced',
  'feature',
  'features',
  'featured',
  'show',
  'shows',
  'shown',
  'name',
  'names',
  'named',
  'describe',
  'describes',
  'described',
  'depict',
  'depicts',
  'depicted',
  'appear',
  'appears',
  'exist',
  'exists',
]);
// Withholding and change over time: "does not yet learn", "no longer carries", "doesn't distrust him anymore" schedule the plot, they remove nothing.
const TEMPORAL_FOLLOWERS = new Set(['yet', 'longer']);
const TEMPORAL_CLAUSE_MARKER = 'anymore';
const FORWARD_WINDOW = 6;
const BACKWARD_WINDOW = 2;
const MIN_TERM_LENGTH = 4;
const EXCERPT_LENGTH = 160;

const STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'been',
  'before',
  'being',
  'both',
  'chapter',
  'could',
  'does',
  'done',
  'each',
  'even',
  'every',
  'from',
  'have',
  'here',
  'into',
  'just',
  'like',
  'made',
  'make',
  'many',
  'more',
  'most',
  'much',
  'must',
  'only',
  'other',
  'over',
  'same',
  'scene',
  'should',
  'some',
  'such',
  'than',
  'that',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'thing',
  'this',
  'those',
  'through',
  'under',
  'until',
  'very',
  'want',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'will',
  'with',
  'within',
  'would',
  'your',
]);

const CLAUSE_BREAK = /[.!?;:\n]+/;
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

interface Clause {
  text: string;
  tokens: string[];
  negated: boolean[];
}

function isContractedNegation(token: string): boolean {
  return token.endsWith("n't");
}

function isCue(token: string): boolean {
  return NOUN_CUES.has(token) || VERBAL_CUES.has(token) || isContractedNegation(token);
}

function normaliseTerm(token: string): string {
  const bare = token.replace(/'s$/, '');
  if (bare.length > MIN_TERM_LENGTH && bare.endsWith('s') && !bare.endsWith('ss')) return bare.slice(0, -1);
  return bare;
}

function isSalient(term: string): boolean {
  return term.length >= MIN_TERM_LENGTH && !STOPWORDS.has(term) && !isCue(term);
}

function markWindow(negated: boolean[], from: number, to: number, skip: (i: number) => boolean = () => false): void {
  for (let i = Math.max(0, from); i <= Math.min(negated.length - 1, to); i++) if (!skip(i)) negated[i] = true;
}

/** The subject of "X is not …": a couple of words before the copula, never a capitalised name, which a sentence about a character states rather than removes. */
function markCopulaSubject(negated: boolean[], capitalised: boolean[], copulaIndex: number): void {
  markWindow(negated, copulaIndex - BACKWARD_WINDOW, copulaIndex - 1, i => capitalised[i] === true);
}

function parseClauses(text: string): Clause[] {
  return text.split(CLAUSE_BREAK).flatMap(raw => {
    const words = raw.match(WORD) ?? [];
    if (words.length === 0) return [];
    const tokens = words.map(word => word.toLowerCase().replace(/’/g, "'"));
    const capitalised = words.map(word => /^\p{Lu}/u.test(word));
    const negated = tokens.map(() => false);
    const text = raw.trim().replace(/^[-*•]\s*/, '');
    if (tokens.includes(TEMPORAL_CLAUSE_MARKER)) return [{ text, tokens, negated }];

    tokens.forEach((token, i) => {
      const next = tokens[i + 1] ?? '';
      if (PAIRED_CUES.has(`${token} ${next}`)) return markWindow(negated, i + 2, i + 1 + FORWARD_WINDOW);
      if (!isCue(token) || TEMPORAL_FOLLOWERS.has(next)) return;
      if (NOUN_CUES.has(token)) return markWindow(negated, i + 1, i + FORWARD_WINDOW);
      if (META_VERBS.has(next)) markWindow(negated, i + 2, i + 1 + FORWARD_WINDOW);
      if (CONTRACTED_COPULAS.has(token)) markCopulaSubject(negated, capitalised, i);
      else if (COPULAS.has(tokens[i - 1] ?? '')) markCopulaSubject(negated, capitalised, i - 1);
    });
    return [{ text, tokens, negated }];
  });
}

function plainTerms(clauses: Clause[]): Set<string> {
  const terms = new Set<string>();
  for (const clause of clauses) clause.tokens.forEach((token, i) => !clause.negated[i] && terms.add(normaliseTerm(token)));
  return terms;
}

function excerpt(text: string): string {
  return text.length <= EXCERPT_LENGTH ? text : `${text.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`;
}

const STATEMENT_REQUEST = /\b(?:say|says|saying|state|states|stating|rule|spell out|make (?:it )?clear|write that|note that|add a line)\b/i;

/**
 * The terms an author asked to be written as absent ("add a line saying no X appears"): only a message that asks for a
 * statement counts, because "make him a mender instead of the Ashen Hand" asks for a removal, not for a denial.
 */
export function requestedNegations(message: string): Set<string> {
  const terms = new Set<string>();
  if (!STATEMENT_REQUEST.test(message)) return terms;
  for (const clause of parseClauses(message)) clause.tokens.forEach((token, i) => clause.negated[i] && isSalient(normaliseTerm(token)) && terms.add(normaliseTerm(token)));
  return terms;
}

/**
 * A term the old text stated plainly and the new text keeps only under a negation ("no X", "without X", "X is not…")
 * was removed by writing its absence, which re-primes every later reader with the idea the edit meant to drop.
 * A term the new text still states plainly anywhere, or that the old text only ever negated, is never an echo.
 */
export function findNegationEchoes(before: string, after: string, options: NegationEchoOptions = {}): NegationEcho[] {
  const beforePlain = plainTerms(parseClauses(before));
  const afterClauses = parseClauses(after);
  const afterPlain = plainTerms(afterClauses);
  const echoes: NegationEcho[] = [];

  for (const clause of afterClauses) {
    const found = new Map<string, string>();
    clause.tokens.forEach((token, i) => {
      const term = normaliseTerm(token);
      if (!clause.negated[i] || !isSalient(term) || found.has(term)) return;
      if (!beforePlain.has(term) || afterPlain.has(term) || options.exempt?.has(term)) return;
      found.set(term, token);
    });
    if (found.size > 0) echoes.push({ terms: [...found.values()], excerpt: excerpt(clause.text) });
  }
  return echoes;
}
