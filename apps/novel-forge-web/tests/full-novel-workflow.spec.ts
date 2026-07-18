/**
 * Full novel-creation workflow — one uninterrupted end-to-end run:
 * create a novel → premise → story bible (coverage + audit-judge loop) → refine bible → 2 volumes
 * (chat-judge loop + approve) → refine volumes → 2 arcs per volume (chat-judge loop + approve) →
 * refine arcs → 20 chapter briefs (chat-judge loop) → refine briefs → generate 20 chapters
 * (continuity-judge + repair loop + approve each) → write 1 manual chapter → judge + approve it.
 *
 * Judging, mapped to what the app actually exposes:
 *   - Chapters have a real judge: the editor's "Verify" button (POST /drafts/:n/judge, verdict
 *     `consistent` | `contradiction`). Failures are repaired through the Forge bar (which stages a
 *     proposal), the proposal is applied, and the chapter is re-judged.
 *   - The bible has a real judge: "Run bible audit" (POST /bible/audit). Findings arrive as a staged
 *     fix proposal; applying it *is* the refinement, and the audit re-runs until clean.
 *   - Volumes / arcs / briefs have no dedicated judge endpoint. For those phases the refinement chat
 *     acts as the judge: a strict review prompt either stages a fix proposal (= changes requested —
 *     we apply it and re-review) or replies without one (= approved). Canonical sign-off then goes
 *     through the app's real gates ("Approve plan", "Approve arcs").
 *
 * Deliberate deviations from a pure-UI run (each mirrors tests/novel-e2e.spec.ts precedent):
 *   - Arc planning calls POST /volumes/:key/arcs/plan directly because the UI's "Generate arcs"
 *     button does not expose an arc count, and this test must produce exactly 2 arcs per volume.
 *     The resulting proposal is still reviewed and applied through the UI.
 *   - Chapter generation enqueues one batch via POST /generate (the UI only offers 1 or 5 at a
 *     time); drafts are then judged, repaired, and approved chapter-by-chapter through the UI.
 *   - Chat sessions are created via the API and then driven through the chat UI, so each phase gets
 *     a deterministically-named session to click on.
 *
 * This exercises the live backend + model stack, so it is slow and opt-in — skipped unless
 * `E2E_FULL=1`. It needs the dev stack running: backend on :8080, the configured models, and the
 * web app on :3000 (the Playwright webServer reuses a running dev server).
 *
 * Tunables (env):
 *   E2E_FULL=1              enable this suite (otherwise skipped)
 *   E2E_CHAPTERS=20         total chapters (split across 2 volumes / 4 arcs)
 *   E2E_JUDGE_ATTEMPTS=3    max judge→refine→re-judge rounds per artifact
 *   E2E_STEP_TIMEOUT_MS     per-async-step budget (default 900000 = 15 min)
 *
 * Example:
 *   E2E_FULL=1 bunx playwright test tests/full-novel-workflow.spec.ts
 */
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

// Playwright specs run under Node; the app tsconfig only ships browser globals, so declare what we use.
declare const process: { env: Record<string, string | undefined> };

const ENABLED = process.env.E2E_FULL === '1';
const CHAPTERS = Math.max(4, Number(process.env.E2E_CHAPTERS ?? 20));
const VOLUME_COUNT = 2;
const ARCS_PER_VOLUME = 2;
const CHAPTERS_PER_VOLUME = Math.ceil(CHAPTERS / VOLUME_COUNT);
const MAX_JUDGE_ATTEMPTS = Math.max(1, Number(process.env.E2E_JUDGE_ATTEMPTS ?? 3));
const STEP_TIMEOUT = Number(process.env.E2E_STEP_TIMEOUT_MS ?? 15 * 60 * 1000);
const NOVEL_NAME = process.env.E2E_NOVEL_NAME ?? `Full Workflow Novel ${Date.now()}`;

const PREMISE =
  `A fantasy adventure planned for exactly ${CHAPTERS} chapters: Wren Calloway, an orphaned mapmaker's apprentice, discovers that the blank margins on every ` +
  'official map conceal the Sundered Vale — a drowned kingdom whose ruin powers the Cartographers Guild that raised her. Armed with a compass that points at lies, ' +
  'she crosses the Vale with a disgraced knight and a smuggler prince to redraw the world before the Guild erases it, and must choose between the family she was ' +
  'promised and the truth only she can chart.';

// Every lore category the Story Bible supports, with the minimum records this run must produce.
const REQUIRED_ENTITIES = { character: 5, faction: 2, location: 2, power_rule: 2, item: 2, concept: 2 } as const;
type EntityKind = keyof typeof REQUIRED_ENTITIES;
const ENTITY_LABEL: Record<EntityKind, string> = {
  character: 'characters',
  faction: 'factions',
  location: 'locations',
  power_rule: 'power rules',
  item: 'items',
  concept: 'concepts',
};

const MANUAL_CHAPTER_BODY = [
  'The map room smelled of cold ink and older dust.',
  '',
  "Wren spread the last sheet across the table and weighted its corners with the compass, the knight's buckle, and two river stones from the Vale. For the first " +
    'time in her life the margins were not blank. Every road she had walked, every lie the needle had caught, every name the Guild had tried to drown — all of it ' +
    'sat on the vellum in her own careful hand.',
  '',
  'She did not draw a border around the Sundered Vale. Borders were how the erasing had started.',
  '',
  'Instead she wrote, in the plain script her master had taught her for legends and keys: *Here is what is true. Check it yourself.* Then she pinned the sheet ' +
    'beside the official map, where every apprentice who came after her would see both, and decide.',
].join('\n');

// ─── API response shapes (only the fields this spec reads) ──────────────────────

interface ProposalLite {
  id: string;
  status: string;
  kind: string;
  scopeType: string;
  summary?: string | null;
}

interface ChatTurn {
  assistantMessage: { content: string };
  proposal?: ProposalLite;
}

interface JudgeVerdict {
  verdict: string;
  findings: { severity: string; text: string }[];
}

interface AuditResult {
  findings: { docRef: string; action: 'add' | 'revise' | 'remove' | 'keep'; finding: string }[];
  proposal?: ProposalLite;
}

interface EntityItem {
  entityKey: string;
  type: EntityKind;
  name: string;
}

interface VolumeItem {
  volumeKey: string;
  ordinal: number;
  title?: string | null;
  status: string;
  startChapter?: number | null;
  endChapter?: number | null;
}

interface ArcItem {
  arcKey: string;
  ordinal: number;
  title?: string | null;
  status: string;
  chapterStart?: number | null;
  chapterEnd?: number | null;
}

interface DraftItem {
  chapter: number;
  title?: string | null;
  body?: string | null;
  status: string;
  reviewStatus: string;
  generator?: string | null;
  judgeNote?: string | null;
}

// ─── Generic plumbing ───────────────────────────────────────────────────────────

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(path);
  expect(res.ok(), `GET ${path} failed with ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** Polls a predicate against the backend until it holds or the budget is exhausted. */
async function pollUntil<T>(request: APIRequestContext, path: string, ready: (body: T) => boolean, label: string, budgetMs = STEP_TIMEOUT): Promise<T> {
  const deadline = Date.now() + budgetMs;
  let last: unknown;
  while (Date.now() < deadline) {
    const res = await request.get(path);
    if (res.ok()) {
      const body = (await res.json()) as T;
      last = body;
      if (ready(body)) return body;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error(`Timed out after ${budgetMs}ms waiting for ${label}. Last response: ${JSON.stringify(last).slice(0, 400)}`);
}

async function entityCounts(request: APIRequestContext, novelId: string): Promise<Map<EntityKind, number>> {
  const body = await getJson<{ items: EntityItem[] }>(request, `/api/v1/projects/${novelId}/entities?limit=500`);
  const counts = new Map<EntityKind, number>();
  for (const entity of body.items) counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
  return counts;
}

// ─── Proposals: the only way chat refinement reaches canon ──────────────────────

/**
 * Applies one staged proposal through the Proposals Center UI. The test keeps a single-pending
 * invariant (every proposal is applied as soon as it is staged), so the auto-selected first row is
 * always the proposal under review — asserted here so a violation fails loudly with the stray ids.
 */
async function applyProposal(page: Page, request: APIRequestContext, novelId: string, proposal: ProposalLite): Promise<void> {
  const pending = await getJson<{ items: ProposalLite[] }>(request, `/api/v1/projects/${novelId}/proposals?status=pending&limit=100`);
  const pendingIds = pending.items.map(p => p.id);
  expect(pendingIds, `expected only proposal ${proposal.id} (${proposal.summary ?? proposal.kind}) to be pending, found [${pendingIds.join(', ')}]`).toEqual([proposal.id]);

  await page.goto(`/novels/${novelId}/proposals`);
  await expect(page.getByText('Proposals Center')).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes(`/proposals/${proposal.id}/apply`) && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
    page.getByRole('button', { name: 'Apply to canon' }).click(),
  ]);
  expect(response.ok(), `applying proposal ${proposal.id} failed with ${response.status()}`).toBeTruthy();
  await expect.poll(async () => (await getJson<ProposalLite>(request, `/api/v1/projects/${novelId}/proposals/${proposal.id}`)).status, { timeout: 30_000 }).toBe('applied');
}

// ─── Refinement chat ────────────────────────────────────────────────────────────

interface SessionSpec {
  scopeType: string;
  scopeRef?: string;
  title: string;
}

/** Creates a scoped chat session via the API so the UI has a deterministically-named thread to drive. */
async function createChatSession(request: APIRequestContext, novelId: string, spec: SessionSpec): Promise<void> {
  const res = await request.post(`/api/v1/projects/${novelId}/chat/sessions`, { data: spec });
  expect(res.ok(), `creating chat session "${spec.title}" failed with ${res.status()}`).toBeTruthy();
}

/** Opens the chat screen and selects the session with the given (unique) title. */
async function openChatSession(page: Page, novelId: string, title: string): Promise<void> {
  await page.goto(`/novels/${novelId}/chat`);
  await page.getByRole('button').filter({ hasText: title }).first().click();
  await expect(page.getByPlaceholder(/Ask for a change to this/)).toBeVisible();
}

/** Sends one message in the open chat thread and returns the turn (assistant reply + optional staged proposal). */
async function sendChatTurn(page: Page, message: string): Promise<ChatTurn> {
  await page.getByPlaceholder(/Ask for a change to this/).fill(message);
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/chat/sessions/') && r.url().endsWith('/messages') && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
    page.getByRole('button', { name: 'Send', exact: true }).click(),
  ]);
  expect(response.ok(), `chat turn failed with ${response.status()}`).toBeTruthy();
  return (await response.json()) as ChatTurn;
}

/** One refinement instruction: send it, and if Forge stages a proposal, apply it to canon. */
async function refineViaChat(page: Page, request: APIRequestContext, novelId: string, sessionTitle: string, instruction: string): Promise<ChatTurn> {
  await openChatSession(page, novelId, sessionTitle);
  const turn = await sendChatTurn(page, instruction);
  if (turn.proposal) await applyProposal(page, request, novelId, turn.proposal);
  return turn;
}

/**
 * Chat-as-judge loop for artifacts without a dedicated judge endpoint (volumes, arcs, briefs):
 * a review prompt either stages a fix proposal (changes requested → apply and re-review) or
 * replies without one (approved). Fails with the judge's last reply if approval is never reached.
 *
 * The prompt states the run's fixed design constraints and restricts rejection to blocking
 * defects: an open-ended "strict judge" ask gives an LLM critic a no-approval bias — it grades a
 * deliberately compact novel against generic serialized-fiction standards and never says done.
 */
async function judgeViaChatUntilApproved(page: Page, request: APIRequestContext, novelId: string, sessionTitle: string, subject: string): Promise<void> {
  const prompt =
    `Review ${subject}. This novel is deliberately compact by design: exactly ${CHAPTERS} chapters total, ${VOLUME_COUNT} volumes of ${CHAPTERS_PER_VOLUME} chapters each, ` +
    `and ${ARCS_PER_VOLUME} arcs per volume — the chapter, volume, and arc counts are fixed constraints, not defects, and requests to expand scope are out of bounds. ` +
    'Reject ONLY for a blocking defect: a direct contradiction with the premise or story bible, a missing objective/conflict/payoff, or broken chapter coverage. ' +
    'Style, depth, and ambition preferences are not defects. If you find a blocking defect, stage exactly one proposal fixing it. ' +
    'Otherwise reply with the single word APPROVED and do not stage any proposal.';
  let lastReply = '';
  for (let attempt = 1; attempt <= MAX_JUDGE_ATTEMPTS; attempt++) {
    await openChatSession(page, novelId, sessionTitle);
    const turn = await sendChatTurn(page, prompt);
    lastReply = turn.assistantMessage.content;
    if (!turn.proposal) return;
    await applyProposal(page, request, novelId, turn.proposal);
  }
  throw new Error(`"${sessionTitle}" judge still requested changes after ${MAX_JUDGE_ATTEMPTS} attempts. Last judge reply: ${lastReply.slice(0, 600)}`);
}

// ─── Story bible ────────────────────────────────────────────────────────────────

/** Tops up the bible via chat until every category meets its minimum, then hard-asserts the counts. */
async function ensureBibleCoverage(page: Page, request: APIRequestContext, novelId: string, sessionTitle: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_JUDGE_ATTEMPTS; attempt++) {
    const counts = await entityCounts(request, novelId);
    const deficits = (Object.keys(REQUIRED_ENTITIES) as EntityKind[])
      .map(kind => ({ kind, missing: REQUIRED_ENTITIES[kind] - (counts.get(kind) ?? 0) }))
      .filter(d => d.missing > 0);
    if (deficits.length === 0) break;
    const ask = deficits.map(d => `${d.missing} more ${ENTITY_LABEL[d.kind]}`).join(', ');
    const turn = await refineViaChat(
      page,
      request,
      novelId,
      sessionTitle,
      `The story bible is missing coverage: add ${ask}. Stage one proposal creating exactly those entries, each with a distinct name, a summary, and a motivation consistent with the existing canon and the ${CHAPTERS}-chapter premise.`,
    );
    expect(turn.proposal, `asked the chat to fill bible gaps (${ask}) but no proposal was staged. Reply: ${turn.assistantMessage.content.slice(0, 400)}`).toBeTruthy();
  }
  const counts = await entityCounts(request, novelId);
  for (const kind of Object.keys(REQUIRED_ENTITIES) as EntityKind[]) {
    expect(counts.get(kind) ?? 0, `bible must contain at least ${REQUIRED_ENTITIES[kind]} ${ENTITY_LABEL[kind]}`).toBeGreaterThanOrEqual(REQUIRED_ENTITIES[kind]);
  }
}

/**
 * The bible's judge: run the audit, apply the staged fix proposal, repeat until it comes back clean.
 * The audit schema mandates one finding per audited document, so `keep` findings are approvals — the
 * audit is clean when nothing needs an add/revise/remove (equivalently, when no fix proposal is staged).
 */
async function runBibleAuditUntilClean(page: Page, request: APIRequestContext, novelId: string): Promise<void> {
  let lastActionable: AuditResult['findings'] = [];
  for (let attempt = 1; attempt <= MAX_JUDGE_ATTEMPTS; attempt++) {
    await page.goto(`/novels/${novelId}/story-bible`);
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/bible/audit') && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
      page.getByRole('button', { name: 'Run bible audit' }).click(),
    ]);
    expect(response.ok(), `bible audit failed with ${response.status()}`).toBeTruthy();
    const audit = (await response.json()) as AuditResult;
    const actionable = audit.findings.filter(f => f.action !== 'keep');
    if (actionable.length === 0 && !audit.proposal) return;
    lastActionable = actionable;
    expect(audit.proposal, `audit reported ${actionable.length} actionable findings but staged no fix proposal: ${JSON.stringify(actionable).slice(0, 400)}`).toBeTruthy();
    await applyProposal(page, request, novelId, audit.proposal as ProposalLite);
  }
  throw new Error(`Bible audit still has actionable findings after ${MAX_JUDGE_ATTEMPTS} attempts: ${JSON.stringify(lastActionable).slice(0, 600)}`);
}

// ─── Story-plan navigation (the volumes screen keeps its drill-down in local state, not the URL) ──

async function openVolume(page: Page, novelId: string, ordinal: number): Promise<void> {
  const roman = ROMAN[ordinal - 1] as string;
  await page.goto(`/novels/${novelId}/volumes`);
  await expect(page.getByRole('heading', { level: 1, name: 'Story Plan' })).toBeVisible();
  // Volume rows carry AI-authored titles, so target the row by its roman ordinal glyph instead.
  await page
    .locator('.nf-selrow')
    .filter({ has: page.getByText(roman, { exact: true }) })
    .click();
  await expect(page.getByText(`VOLUME ${roman}`, { exact: true })).toBeVisible();
}

async function openArc(page: Page, novelId: string, volumeOrdinal: number, arcOrdinal: number): Promise<void> {
  await openVolume(page, novelId, volumeOrdinal);
  await page
    .locator('.nf-selrow')
    .filter({ has: page.getByText(String(arcOrdinal), { exact: true }) })
    .click();
  await expect(page.getByText(`ARC ${arcOrdinal}`, { exact: true })).toBeVisible();
}

// ─── Chapters ───────────────────────────────────────────────────────────────────

async function openChapter(page: Page, novelId: string, chapter: number): Promise<void> {
  await page.goto(`/novels/${novelId}/chapters`);
  await expect(page.getByRole('heading', { level: 1, name: 'Chapters' })).toBeVisible();
  // Chapter rows lead with the zero-padded number; titles are AI-authored so the number is the stable handle.
  await page
    .locator('.nf-selrow')
    .filter({ has: page.getByText(String(chapter).padStart(2, '0'), { exact: true }) })
    .click();
  await expect(page.getByRole('button', { name: 'Approve draft' })).toBeVisible();
}

/**
 * The real judge loop for one chapter: Verify → if the continuity judge finds a contradiction, feed
 * its findings into the Forge bar (staging a repair proposal), apply it, and re-verify — then approve.
 */
async function judgeAndApproveChapter(page: Page, request: APIRequestContext, novelId: string, chapter: number): Promise<void> {
  let lastVerdict: JudgeVerdict | undefined;
  for (let attempt = 1; attempt <= MAX_JUDGE_ATTEMPTS; attempt++) {
    await openChapter(page, novelId, chapter);
    const [judgeResponse] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith(`/drafts/${chapter}/judge`) && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
      page.getByRole('button', { name: 'Verify' }).click(),
    ]);
    expect(judgeResponse.ok(), `judging chapter ${chapter} failed with ${judgeResponse.status()}`).toBeTruthy();
    const verdict = (await judgeResponse.json()) as JudgeVerdict;
    lastVerdict = verdict;

    if (verdict.verdict !== 'contradiction') {
      const [approveResponse] = await Promise.all([
        page.waitForResponse(r => r.url().endsWith(`/drafts/${chapter}/approve`) && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
        page.getByRole('button', { name: 'Approve draft' }).click(),
      ]);
      expect(approveResponse.ok(), `approving chapter ${chapter} failed with ${approveResponse.status()}`).toBeTruthy();
      await expect.poll(async () => (await getJson<DraftItem>(request, `/api/v1/projects/${novelId}/drafts/${chapter}`)).reviewStatus, { timeout: 30_000 }).toBe('approved');
      return;
    }

    // Rejected: route the judge's findings through the on-page Forge bar as the repair instruction.
    const findings = verdict.findings.map(f => `- [${f.severity}] ${f.text}`).join('\n');
    await page.getByRole('button', { name: /Ask Forge to update/ }).click();
    await page
      .getByPlaceholder(/Ask Forge to revise/)
      .fill(
        `The continuity judge rejected this chapter with these findings:\n${findings}\nRevise the chapter prose to resolve every finding while keeping the brief's events intact.`,
      );
    const [turnResponse] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/chat/sessions/') && r.url().endsWith('/messages') && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
      page.getByRole('button', { name: 'Propose', exact: true }).click(),
    ]);
    expect(turnResponse.ok(), `chapter ${chapter} repair turn failed with ${turnResponse.status()}`).toBeTruthy();
    const turn = (await turnResponse.json()) as ChatTurn;
    expect(turn.proposal, `chapter ${chapter} repair ask staged no proposal. Reply: ${turn.assistantMessage.content.slice(0, 400)}`).toBeTruthy();
    await applyProposal(page, request, novelId, turn.proposal as ProposalLite);
  }
  throw new Error(`Chapter ${chapter} still contradicts canon after ${MAX_JUDGE_ATTEMPTS} judge attempts. Last findings: ${JSON.stringify(lastVerdict?.findings).slice(0, 600)}`);
}

// ─── The one long test ──────────────────────────────────────────────────────────

test.describe('Full novel workflow — end to end', () => {
  test.skip(!ENABLED, 'Set E2E_FULL=1 to run the live full-workflow suite.');
  test.describe.configure({ mode: 'serial' });

  test('create, refine, judge, and approve an entire novel in one run', async ({ page, request }) => {
    // Every phase is a live model call; budget generously (generation alone is ~CHAPTERS steps).
    test.setTimeout(STEP_TIMEOUT * (CHAPTERS * 3 + 24));
    let novelId = '';
    let volumes: VolumeItem[] = [];
    const arcsByVolume = new Map<string, ArcItem[]>();

    await test.step('1 · create the novel', async () => {
      // Project names are unique server-side; clear leftovers so fixed-name (E2E_NOVEL_NAME) runs repeat cleanly.
      const existing = await request.get('/api/v1/projects', { params: { limit: 100 } });
      if (existing.ok()) {
        const items = ((await existing.json()).items ?? []) as { id: string; name: string }[];
        for (const project of items.filter(p => p.name === NOVEL_NAME)) await request.delete(`/api/v1/projects/${project.id}`);
      }
      await page.goto('/');
      await page.locator('button[data-variant="primary"]', { hasText: 'New project' }).click();
      await page.getByRole('textbox', { name: 'Working title' }).fill(NOVEL_NAME);
      await page.getByRole('button', { name: 'Create novel' }).click();
      await page.waitForURL(/\/novels\/\d+\/overview/, { timeout: 30_000 });
      novelId = page.url().match(/\/novels\/(\d+)\//)?.[1] ?? '';
      expect(novelId, 'novel id should be present in the overview URL').toBeTruthy();

      await page.goto(`/novels/${novelId}/settings`);
      await page.getByRole('textbox', { name: 'Premise / brief' }).fill(PREMISE);
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect.poll(async () => (await getJson<{ brief?: string }>(request, `/api/v1/projects/${novelId}`)).brief, { timeout: 15_000 }).toContain('Wren Calloway');
    });

    await test.step('2 · generate the story bible and judge it via the bible audit', async () => {
      await page.goto(`/novels/${novelId}/story-bible`);
      const [seedResponse] = await Promise.all([
        page.waitForResponse(r => r.url().endsWith('/seed-from-brief') && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
        page.getByRole('button', { name: 'Generate story bible' }).click(),
      ]);
      expect(seedResponse.ok(), `bible generation failed with ${seedResponse.status()}`).toBeTruthy();
      await pollUntil<{ items: EntityItem[] }>(request, `/api/v1/projects/${novelId}/entities?limit=500`, b => b.items.length > 0, 'bible entities');

      // The bible renders in the UI: the rail lists entities and the overview shows the totals.
      await page.goto(`/novels/${novelId}/story-bible`);
      await expect(page.getByText(/All types · \d+ entities/)).toBeVisible();
      await expect(page.locator('.nf-selrow').first()).toBeVisible();

      // The builder decides its own breadth; the chat tops up any category below the required floor.
      await createChatSession(request, novelId, { scopeType: 'novel', title: 'Bible coverage & refinement' });
      await ensureBibleCoverage(page, request, novelId, 'Bible coverage & refinement');
      await runBibleAuditUntilClean(page, request, novelId);
    });

    await test.step('3 · refine the bible, then re-judge until the audit is clean', async () => {
      await refineViaChat(
        page,
        request,
        novelId,
        'Bible coverage & refinement',
        `Refine the story bible: improve internal consistency, strengthen every major character's motivation, sharpen the central conflict between Wren and the Cartographers Guild, and make sure the canon can sustain a ${CHAPTERS}-chapter novel. Stage one proposal with the improvements.`,
      );
      await runBibleAuditUntilClean(page, request, novelId);
    });

    await test.step('4 · plan 2 volumes, judge via chat, and approve the plan', async () => {
      await page.goto(`/novels/${novelId}/volumes`);
      // The empty state renders a second "Generate volumes" action; both open the same dialog.
      await page.getByRole('button', { name: 'Generate volumes' }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('spinbutton', { name: 'Volumes' }).fill(String(VOLUME_COUNT));
      await dialog.getByRole('spinbutton', { name: 'Chapters per volume' }).fill(String(CHAPTERS_PER_VOLUME));
      const [planResponse] = await Promise.all([
        page.waitForResponse(r => r.url().endsWith('/plan') && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
        dialog.getByRole('button', { name: 'Generate volumes' }).click(),
      ]);
      expect(planResponse.ok(), `volume planning failed with ${planResponse.status()}`).toBeTruthy();

      const planned = await pollUntil<{ items: VolumeItem[] }>(request, `/api/v1/projects/${novelId}/volumes?limit=50`, b => b.items.length >= VOLUME_COUNT, 'planned volumes');
      volumes = [...planned.items].sort((a, b) => a.ordinal - b.ordinal);
      expect(volumes.length, 'exactly 2 volumes must be planned').toBe(VOLUME_COUNT);
      for (const volume of volumes) {
        expect(volume.startChapter, `volume ${volume.ordinal} must have a chapter range`).not.toBeNull();
        expect((volume.endChapter ?? 0) - (volume.startChapter ?? 0) + 1, `volume ${volume.ordinal} must cover half the novel`).toBe(CHAPTERS_PER_VOLUME);
      }

      await createChatSession(request, novelId, { scopeType: 'volume_plan', title: 'Volume plan refinement' });
      await judgeViaChatUntilApproved(
        page,
        request,
        novelId,
        'Volume plan refinement',
        `the ${VOLUME_COUNT}-volume plan (each volume must cover a coherent half of the ${CHAPTERS}-chapter story)`,
      );

      await page.goto(`/novels/${novelId}/volumes`);
      await page.getByRole('button', { name: 'Approve plan' }).click();
      await pollUntil<{ planApproved: boolean }>(request, `/api/v1/projects/${novelId}/status`, b => b.planApproved === true, 'volume plan approval');
    });

    await test.step('5 · refine the volumes, then re-judge via chat', async () => {
      await refineViaChat(
        page,
        request,
        novelId,
        'Volume plan refinement',
        'Refine the volume plan: improve pacing within each volume, sharpen the escalation from volume I into volume II, smooth the transition between them, and raise the narrative stakes of each payoff. Stage one proposal with the improvements.',
      );
      await judgeViaChatUntilApproved(page, request, novelId, 'Volume plan refinement', 'the refined two-volume plan');
    });

    await test.step('6 · plan 2 arcs in each volume, judge via chat, and approve them', async () => {
      for (const volume of volumes) {
        // The UI's "Generate arcs" exposes no arc count; the same endpoint is called directly so this
        // run deterministically yields 2 arcs per volume. The proposal is still applied through the UI.
        const planRes = await request.post(`/api/v1/projects/${novelId}/volumes/${volume.volumeKey}/arcs/plan`, {
          data: { arcCount: ARCS_PER_VOLUME, guidance: 'Two escalating arcs that split this volume evenly.' },
          timeout: STEP_TIMEOUT,
        });
        expect(planRes.ok(), `arc planning for ${volume.volumeKey} failed with ${planRes.status()}`).toBeTruthy();
        const plan = (await planRes.json()) as { proposal: ProposalLite; arcs: unknown[] };
        expect(plan.arcs.length, `volume ${volume.ordinal} must plan exactly ${ARCS_PER_VOLUME} arcs`).toBe(ARCS_PER_VOLUME);
        await applyProposal(page, request, novelId, plan.proposal);

        await createChatSession(request, novelId, { scopeType: 'arc_plan', scopeRef: `volume:${volume.volumeKey}`, title: `Arc plan refinement · Volume ${volume.ordinal}` });
        await judgeViaChatUntilApproved(page, request, novelId, `Arc plan refinement · Volume ${volume.ordinal}`, `the ${ARCS_PER_VOLUME}-arc plan of volume ${volume.ordinal}`);

        await openVolume(page, novelId, volume.ordinal);
        const [approveResponse] = await Promise.all([
          page.waitForResponse(r => r.url().endsWith(`/volumes/${volume.volumeKey}/arcs/approve`) && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
          page.getByRole('button', { name: 'Approve arcs' }).click(),
        ]);
        expect(approveResponse.ok(), `approving arcs of volume ${volume.ordinal} failed with ${approveResponse.status()}`).toBeTruthy();

        const arcsBody = await pollUntil<{ arcs: ArcItem[] }>(
          request,
          `/api/v1/projects/${novelId}/volumes/${volume.volumeKey}/arcs`,
          b => b.arcs.length === ARCS_PER_VOLUME && b.arcs.every(a => a.status === 'approved'),
          `approved arcs of volume ${volume.ordinal}`,
        );
        arcsByVolume.set(
          volume.volumeKey,
          [...arcsBody.arcs].sort((a, b) => a.ordinal - b.ordinal),
        );
      }
    });

    await test.step('7 · refine the arcs, then re-judge via chat', async () => {
      for (const volume of volumes) {
        await refineViaChat(
          page,
          request,
          novelId,
          `Arc plan refinement · Volume ${volume.ordinal}`,
          "Refine both arcs of this volume: sharpen each arc's central conflict, give each a clear midpoint shift and climax, and tie its escalation to the growth of the characters driving it. Stage one proposal with the improvements.",
        );
        await judgeViaChatUntilApproved(page, request, novelId, `Arc plan refinement · Volume ${volume.ordinal}`, `the refined arcs of volume ${volume.ordinal}`);
      }
    });

    await test.step('8 · generate chapter briefs for every arc and judge them via chat', async () => {
      let expected = 0;
      for (const volume of volumes) {
        for (const arc of arcsByVolume.get(volume.volumeKey) ?? []) {
          await openArc(page, novelId, volume.ordinal, arc.ordinal);
          const [outlineResponse] = await Promise.all([
            page.waitForResponse(r => r.url().endsWith(`/arcs/${arc.arcKey}/outline`) && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
            page.getByRole('button', { name: /Generate briefs|Regenerate briefs/ }).click(),
          ]);
          expect(outlineResponse.ok(), `brief generation for ${arc.arcKey} failed with ${outlineResponse.status()}`).toBeTruthy();
          expected += (arc.chapterEnd ?? 0) - (arc.chapterStart ?? 0) + 1;
          await pollUntil<{ items: { chapter: number }[] }>(request, `/api/v1/projects/${novelId}/briefs`, b => b.items.length >= expected, `${expected} chapter briefs`);
        }
      }
      const briefs = await getJson<{ items: { chapter: number }[] }>(request, `/api/v1/projects/${novelId}/briefs`);
      const chapters = briefs.items.map(b => b.chapter).sort((a, b) => a - b);
      expect(chapters, `all ${CHAPTERS} chapter briefs must exist, contiguously`).toEqual(Array.from({ length: CHAPTERS }, (_, i) => i + 1));

      for (const volume of volumes) {
        for (const arc of arcsByVolume.get(volume.volumeKey) ?? []) {
          await createChatSession(request, novelId, { scopeType: 'arc', scopeRef: `arc:${arc.arcKey}`, title: `Brief refinement · ${arc.arcKey}` });
          await judgeViaChatUntilApproved(page, request, novelId, `Brief refinement · ${arc.arcKey}`, `the chapter briefs of arc "${arc.title ?? arc.arcKey}"`);
        }
      }
    });

    await test.step('9 · refine the chapter briefs, then re-judge via chat', async () => {
      for (const volume of volumes) {
        for (const arc of arcsByVolume.get(volume.volumeKey) ?? []) {
          await refineViaChat(
            page,
            request,
            novelId,
            `Brief refinement · ${arc.arcKey}`,
            'Refine the chapter briefs of this arc: make each chapter causally follow from the previous one, build a clear emotional progression across the arc, end each chapter on a hook or cliffhanger, and keep every detail continuous with the story bible. Stage one proposal with the improvements.',
          );
          await judgeViaChatUntilApproved(page, request, novelId, `Brief refinement · ${arc.arcKey}`, `the refined chapter briefs of arc "${arc.title ?? arc.arcKey}"`);
        }
      }
    });

    await test.step(`10 · generate all ${CHAPTERS} chapters, then judge and approve each`, async () => {
      // One batch enqueues the whole run (the UI offers only 1 or 5 at a time); the backend drafts
      // chapters strictly in order, so poll until every draft lands with prose.
      const generateRes = await request.post(`/api/v1/projects/${novelId}/generate`, { data: { limit: CHAPTERS } });
      expect(generateRes.ok(), `enqueueing generation failed with ${generateRes.status()}`).toBeTruthy();
      const drafts = await pollUntil<{ items: DraftItem[] }>(
        request,
        `/api/v1/projects/${novelId}/drafts`,
        b => b.items.length >= CHAPTERS && b.items.every(d => (d.body ?? '').trim().length > 0),
        `${CHAPTERS} generated chapters`,
        STEP_TIMEOUT * CHAPTERS,
      );
      const chapters = drafts.items.map(d => d.chapter).sort((a, b) => a - b);
      expect(chapters.slice(0, CHAPTERS), 'chapters must be drafted contiguously from chapter 1').toEqual(Array.from({ length: CHAPTERS }, (_, i) => i + 1));

      for (let chapter = 1; chapter <= CHAPTERS; chapter++) await judgeAndApproveChapter(page, request, novelId, chapter);
    });

    const manualChapter = CHAPTERS + 1;
    await test.step('11 · write a manual chapter, judge and approve it', async () => {
      await page.goto(`/novels/${novelId}/chapters`);
      await expect(page.getByRole('heading', { level: 1, name: 'Chapters' })).toBeVisible();
      await page.getByRole('button', { name: 'Chapter creation options' }).click();
      await page.getByRole('menuitem', { name: `Write ch ${manualChapter} yourself` }).click();

      // A fresh human draft opens straight in the editor's Write tab. (The editor exposes prose only —
      // chapter titles are not editable in this UI, so the manual chapter keeps its default title.)
      await page.getByLabel('Chapter prose (Markdown)').fill(MANUAL_CHAPTER_BODY);
      const [saveResponse] = await Promise.all([
        page.waitForResponse(r => r.url().endsWith(`/drafts/${manualChapter}`) && r.request().method() === 'PUT', { timeout: 30_000 }),
        page.getByRole('button', { name: 'Save', exact: true }).click(),
      ]);
      expect(saveResponse.ok(), `saving the manual chapter failed with ${saveResponse.status()}`).toBeTruthy();

      // It persists as a human-authored draft and shows up in the chapter list with the "You" tag.
      const saved = await getJson<DraftItem>(request, `/api/v1/projects/${novelId}/drafts/${manualChapter}`);
      expect(saved.generator, 'the manual chapter must be recorded as human-authored').toBe('human');
      expect(saved.body ?? '', 'the manual chapter body must be persisted').toContain('map room');
      await page.goto(`/novels/${novelId}/chapters`);
      const manualRow = page.locator('.nf-selrow').filter({ has: page.getByText(String(manualChapter).padStart(2, '0'), { exact: true }) });
      await expect(manualRow).toBeVisible();
      await expect(manualRow.getByText('You', { exact: true })).toBeVisible();

      await judgeAndApproveChapter(page, request, novelId, manualChapter);
    });

    await test.step('12 · final verification — every artifact exists and is approved', async () => {
      const counts = await entityCounts(request, novelId);
      for (const kind of Object.keys(REQUIRED_ENTITIES) as EntityKind[]) {
        expect(counts.get(kind) ?? 0, `bible: at least ${REQUIRED_ENTITIES[kind]} ${ENTITY_LABEL[kind]}`).toBeGreaterThanOrEqual(REQUIRED_ENTITIES[kind]);
      }

      const volumesBody = await getJson<{ items: VolumeItem[] }>(request, `/api/v1/projects/${novelId}/volumes?limit=50`);
      expect(volumesBody.items.length, 'exactly 2 volumes exist').toBe(VOLUME_COUNT);
      const status = await getJson<{ planApproved: boolean }>(request, `/api/v1/projects/${novelId}/status`);
      expect(status.planApproved, 'the volume plan is approved').toBe(true);

      let totalArcs = 0;
      for (const volume of volumesBody.items) {
        const arcs = await getJson<{ arcs: ArcItem[] }>(request, `/api/v1/projects/${novelId}/volumes/${volume.volumeKey}/arcs`);
        expect(arcs.arcs.length, `volume ${volume.ordinal} has exactly ${ARCS_PER_VOLUME} arcs`).toBe(ARCS_PER_VOLUME);
        for (const arc of arcs.arcs) expect(arc.status, `arc ${arc.arcKey} is approved`).toBe('approved');
        totalArcs += arcs.arcs.length;
      }
      expect(totalArcs, '4 arcs exist in total').toBe(VOLUME_COUNT * ARCS_PER_VOLUME);

      const briefs = await getJson<{ items: { chapter: number }[] }>(request, `/api/v1/projects/${novelId}/briefs`);
      expect(
        briefs.items.map(b => b.chapter).sort((a, b) => a - b),
        `${CHAPTERS} chapter briefs exist`,
      ).toEqual(Array.from({ length: CHAPTERS }, (_, i) => i + 1));

      const drafts = await getJson<{ items: DraftItem[] }>(request, `/api/v1/projects/${novelId}/drafts`);
      expect(drafts.items.length, `${CHAPTERS} generated chapters + 1 manual chapter exist`).toBe(CHAPTERS + 1);
      expect(drafts.items.filter(d => d.generator === 'human').length, 'exactly one chapter is human-authored').toBe(1);
      for (const draft of drafts.items) {
        expect((draft.body ?? '').trim().length, `chapter ${draft.chapter} has prose`).toBeGreaterThan(0);
        expect(draft.reviewStatus === 'approved' || draft.status === 'final', `chapter ${draft.chapter} is approved (got ${draft.reviewStatus}/${draft.status})`).toBe(true);
      }
    });
  });
});
