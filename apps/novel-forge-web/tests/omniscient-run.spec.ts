/**
 * "Omniscient Sovereigns" — one full UI-driven novel run, adapted from tests/full-novel-workflow.spec.ts.
 *
 * Differences from the generic full-workflow spec:
 *   - The premise is read VERBATIM from novel-forge-server/NOVEL_DETAILS.md (never edited here).
 *   - Models are configured per-project through the Settings → Models UI:
 *       writing = Claude Code · Sonnet, planning & chat = Claude Code · Opus, review = qwen3:14b.
 *   - 1 volume × 10 chapters × 2 arcs (the run's target is 10 finished chapters).
 *   - Every operation is appended to novel-forge-server/NOVEL_GENERATION_AUDIT.md as it happens.
 *   - RESUMABLE: each phase checks backend state first and skips what a previous attempt already
 *     completed, so a crashed/timed-out run can simply be relaunched. Long multi-model-call steps
 *     (bible seed, volume plan, briefs) poll backend state with an hour-long budget instead of
 *     waiting on a single HTTP response — CLI-subprocess planning calls run for many minutes each.
 *
 * Run with:  E2E_OMNI=1 bunx playwright test tests/omniscient-run.spec.ts
 * Needs the dev stack: backend :8080, web :3000, Ollama, and a logged-in `claude` CLI.
 */
/// <reference types="node" /> — tsconfig pins types to vite/client; node:fs needs @types/node here.
import { appendFileSync, readFileSync } from 'node:fs';

import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> };

const ENABLED = process.env.E2E_OMNI === '1';
const CHAPTERS = 10;
const VOLUME_COUNT = 1;
const ARCS_PER_VOLUME = 2;
const MAX_JUDGE_ATTEMPTS = Math.max(1, Number(process.env.E2E_JUDGE_ATTEMPTS ?? 3));
const STEP_TIMEOUT = Number(process.env.E2E_STEP_TIMEOUT_MS ?? 15 * 60 * 1000);
const LONG_BUDGET = 60 * 60 * 1000; // multi-call AI phases (bible seed / plan / outline)

const NOVEL_NAME = 'Omniscient Sovereigns';
const PREMISE_PATH = '/Users/leander-paul/repositories/shadow-library/novel-forge-server/NOVEL_DETAILS.md';
const AUDIT_PATH = '/Users/leander-paul/repositories/shadow-library/novel-forge-server/NOVEL_GENERATION_AUDIT.md';
// Read the operator's premise only when the suite is actually enabled — otherwise a missing local
// file would crash Playwright at collection time and take the whole test run (and pre-commit) down.
const PREMISE = ENABLED ? readFileSync(PREMISE_PATH, 'utf8') : '';

/** Model assignment per Settings → Models row label, exactly as the operator requested. */
const MODEL_ASSIGNMENT: { row: string; option: string; role: string; provider: string; model: string }[] = [
  { row: 'Writing', option: 'Claude Code · Sonnet', role: 'generation', provider: 'anthropic-claude-code', model: 'sonnet' },
  { row: 'Planning & canon', option: 'Claude Code · Opus', role: 'plan', provider: 'anthropic-claude-code', model: 'opus' },
  { row: 'Review & QA', option: 'qwen3:14b', role: 'judge', provider: 'ollama', model: 'qwen3:14b' },
  { row: 'Refinement chat', option: 'Claude Code · Opus', role: 'chat', provider: 'anthropic-claude-code', model: 'opus' },
];

// Coverage floors the bible must reach before planning starts (topped up via refinement chat).
const REQUIRED_ENTITIES = { character: 5, faction: 1, location: 2, power_rule: 2, item: 1, concept: 2 } as const;
type EntityKind = keyof typeof REQUIRED_ENTITIES;
const ENTITY_LABEL: Record<EntityKind, string> = {
  character: 'characters',
  faction: 'factions',
  location: 'locations',
  power_rule: 'power rules',
  item: 'items',
  concept: 'concepts',
};

function audit(text: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  appendFileSync(AUDIT_PATH, `- ${ts} · ${text}\n`);
}

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
}

interface RunItem {
  id: string;
  graph: string;
  status: string;
}

// ─── Generic plumbing ───────────────────────────────────────────────────────────

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(path);
  expect(res.ok(), `GET ${path} failed with ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

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

/** Blocks until no workflow run is `running` — prevents double-triggering multi-call AI phases on resume. */
async function waitForQuiescence(request: APIRequestContext, novelId: string, label: string, budgetMs = LONG_BUDGET): Promise<void> {
  await pollUntil<{ items: RunItem[] }>(
    request,
    `/api/v1/projects/${novelId}/runs?limit=20`,
    b => b.items.every(r => r.status !== 'running'),
    `${label} (workflow quiescence)`,
    budgetMs,
  );
}

// The shared PaginationQuery caps `limit` at 100 and silently coerces out-of-range values back to the
// default of 20 — `limit=500` returns only the first page. Page through so counts see every entity.
async function entityCounts(request: APIRequestContext, novelId: string): Promise<Map<EntityKind, number>> {
  const counts = new Map<EntityKind, number>();
  for (let offset = 0; ; offset += 100) {
    const body = await getJson<{ total: number; items: EntityItem[] }>(request, `/api/v1/projects/${novelId}/entities?limit=100&offset=${offset}`);
    for (const entity of body.items) counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1);
    if (offset + 100 >= body.total) return counts;
  }
}

// ─── Proposals ──────────────────────────────────────────────────────────────────

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
  audit(`Applied proposal ${proposal.id} (${proposal.kind}/${proposal.scopeType}) to canon via Proposals Center: ${(proposal.summary ?? '').slice(0, 140)}`);
}

/** Resume hygiene: applies (or, on conflict, rejects) proposals left pending by a previous attempt. */
async function drainPendingProposals(page: Page, request: APIRequestContext, novelId: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const pending = await getJson<{ items: ProposalLite[] }>(request, `/api/v1/projects/${novelId}/proposals?status=pending&limit=100`);
    if (pending.items.length === 0) return;
    audit(`Resume: ${pending.items.length} proposal(s) left pending by a previous attempt — draining through the Proposals Center`);
    await page.goto(`/novels/${novelId}/proposals`);
    await expect(page.getByText('Proposals Center')).toBeVisible();
    const [response] = await Promise.all([
      page.waitForResponse(r => /\/proposals\/[^/]+\/apply$/.test(r.url()) && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
      page.getByRole('button', { name: 'Apply to canon' }).click(),
    ]);
    const appliedId = response.url().match(/proposals\/([^/]+)\/apply/)?.[1] ?? 'unknown';
    if (response.ok()) {
      audit(`Resume: applied leftover proposal ${appliedId}`);
    } else if (response.status() === 409) {
      const reject = await request.post(`/api/v1/projects/${novelId}/proposals/${appliedId}/reject`, { data: {} });
      audit(`Resume: leftover proposal ${appliedId} conflicted with canon (409) — rejected (reject ${reject.status()})`);
    } else {
      throw new Error(`Draining leftover proposal ${appliedId} failed with ${response.status()}`);
    }
  }
  throw new Error('Still had pending proposals after 20 drain iterations');
}

// ─── Refinement chat ────────────────────────────────────────────────────────────

interface SessionSpec {
  scopeType: string;
  scopeRef?: string;
  title: string;
}

/** Creates the session only if a previous attempt didn't already (titles are unique per phase). */
async function ensureChatSession(request: APIRequestContext, novelId: string, spec: SessionSpec): Promise<void> {
  const sessions = await getJson<{ items: { title?: string | null }[] }>(request, `/api/v1/projects/${novelId}/chat/sessions?limit=100`);
  if (sessions.items.some(s => s.title === spec.title)) return;
  const res = await request.post(`/api/v1/projects/${novelId}/chat/sessions`, { data: spec });
  expect(res.ok(), `creating chat session "${spec.title}" failed with ${res.status()}`).toBeTruthy();
  audit(`Created chat session "${spec.title}" (scope ${spec.scopeType}${spec.scopeRef ? ` · ${spec.scopeRef}` : ''})`);
}

async function openChatSession(page: Page, novelId: string, title: string): Promise<void> {
  await page.goto(`/novels/${novelId}/chat`);
  await page.getByRole('button').filter({ hasText: title }).first().click();
  await expect(page.getByPlaceholder(/Ask for a change to this/)).toBeVisible();
}

async function sendChatTurn(page: Page, message: string): Promise<ChatTurn> {
  await page.getByPlaceholder(/Ask for a change to this/).fill(message);
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/chat/sessions/') && r.url().endsWith('/messages') && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
    page.getByRole('button', { name: 'Send', exact: true }).click(),
  ]);
  expect(response.ok(), `chat turn failed with ${response.status()}`).toBeTruthy();
  return (await response.json()) as ChatTurn;
}

async function refineViaChat(page: Page, request: APIRequestContext, novelId: string, sessionTitle: string, instruction: string): Promise<ChatTurn> {
  await openChatSession(page, novelId, sessionTitle);
  audit(`Chat turn in "${sessionTitle}": ${instruction.slice(0, 120)}…`);
  const turn = await sendChatTurn(page, instruction);
  if (turn.proposal) await applyProposal(page, request, novelId, turn.proposal);
  else audit(`Chat replied without a proposal: ${turn.assistantMessage.content.slice(0, 120)}`);
  return turn;
}

/** Chat-as-judge loop for artifacts without a dedicated judge endpoint (volumes, arcs, briefs). */
async function judgeViaChatUntilApproved(page: Page, request: APIRequestContext, novelId: string, sessionTitle: string, subject: string): Promise<void> {
  const prompt =
    `Review ${subject}. This run is deliberately compact by design: exactly ${CHAPTERS} chapters in ${VOLUME_COUNT} volume with ${ARCS_PER_VOLUME} arcs — ` +
    'the chapter, volume, and arc counts are fixed constraints, not defects, and requests to expand scope are out of bounds. ' +
    'Reject ONLY for a blocking defect: a direct contradiction with the premise or story bible, a missing objective/conflict/payoff, or broken chapter coverage. ' +
    'Style, depth, and ambition preferences are not defects. If you find a blocking defect, stage exactly one proposal fixing it. ' +
    'Otherwise reply with the single word APPROVED and do not stage any proposal.';
  let lastReply = '';
  for (let attempt = 1; attempt <= MAX_JUDGE_ATTEMPTS; attempt++) {
    await openChatSession(page, novelId, sessionTitle);
    audit(`Chat-as-judge review of ${subject} (attempt ${attempt}/${MAX_JUDGE_ATTEMPTS})`);
    const turn = await sendChatTurn(page, prompt);
    lastReply = turn.assistantMessage.content;
    if (!turn.proposal) {
      audit(`Judge approved ${subject}: ${lastReply.slice(0, 100)}`);
      return;
    }
    await applyProposal(page, request, novelId, turn.proposal);
  }
  throw new Error(`"${sessionTitle}" judge still requested changes after ${MAX_JUDGE_ATTEMPTS} attempts. Last judge reply: ${lastReply.slice(0, 600)}`);
}

// ─── Story bible ────────────────────────────────────────────────────────────────

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
      `The story bible is missing coverage: add ${ask}. Stage one proposal creating exactly those entries, each with a distinct name, a summary, and a motivation consistent with the existing canon and the premise (Lelouch Ashford, Amelia Sterling, the Axiom System, and the Aether-flooded Earth).`,
    );
    expect(turn.proposal, `asked the chat to fill bible gaps (${ask}) but no proposal was staged. Reply: ${turn.assistantMessage.content.slice(0, 400)}`).toBeTruthy();
  }
  const counts = await entityCounts(request, novelId);
  for (const kind of Object.keys(REQUIRED_ENTITIES) as EntityKind[]) {
    expect(counts.get(kind) ?? 0, `bible must contain at least ${REQUIRED_ENTITIES[kind]} ${ENTITY_LABEL[kind]}`).toBeGreaterThanOrEqual(REQUIRED_ENTITIES[kind]);
  }
  audit(`Bible coverage floors met: ${JSON.stringify(Object.fromEntries(counts))}`);
}

async function runBibleAuditUntilClean(page: Page, request: APIRequestContext, novelId: string): Promise<void> {
  let lastActionable: AuditResult['findings'] = [];
  for (let attempt = 1; attempt <= MAX_JUDGE_ATTEMPTS; attempt++) {
    await page.goto(`/novels/${novelId}/story-bible`);
    audit(`Running bible audit (attempt ${attempt}/${MAX_JUDGE_ATTEMPTS})`);
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/bible/audit') && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
      page.getByRole('button', { name: 'Run bible audit' }).click(),
    ]);
    expect(response.ok(), `bible audit failed with ${response.status()}`).toBeTruthy();
    const auditResult = (await response.json()) as AuditResult;
    const actionable = auditResult.findings.filter(f => f.action !== 'keep');
    if (actionable.length === 0 && !auditResult.proposal) {
      audit('Bible audit clean — no actionable findings');
      return;
    }
    lastActionable = actionable;
    audit(`Bible audit found ${actionable.length} actionable findings; applying staged fix proposal`);
    expect(auditResult.proposal, `audit reported ${actionable.length} actionable findings but staged no fix proposal: ${JSON.stringify(actionable).slice(0, 400)}`).toBeTruthy();
    await applyProposal(page, request, novelId, auditResult.proposal as ProposalLite);
  }
  throw new Error(`Bible audit still has actionable findings after ${MAX_JUDGE_ATTEMPTS} attempts: ${JSON.stringify(lastActionable).slice(0, 600)}`);
}

// ─── Story-plan navigation ──────────────────────────────────────────────────────

async function openVolume(page: Page, novelId: string, ordinal: number): Promise<void> {
  const roman = ROMAN[ordinal - 1] as string;
  await page.goto(`/novels/${novelId}/volumes`);
  await expect(page.getByRole('heading', { level: 1, name: 'Story Plan' })).toBeVisible();
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
  await page
    .locator('.nf-selrow')
    .filter({ has: page.getByText(String(chapter).padStart(2, '0'), { exact: true }) })
    .click();
  await expect(page.getByRole('button', { name: 'Approve draft' })).toBeVisible();
}

async function judgeAndApproveChapter(page: Page, request: APIRequestContext, novelId: string, chapter: number): Promise<void> {
  let lastVerdict: JudgeVerdict | undefined;
  for (let attempt = 1; attempt <= MAX_JUDGE_ATTEMPTS; attempt++) {
    await openChapter(page, novelId, chapter);
    audit(`Judging chapter ${chapter} via continuity judge (attempt ${attempt}/${MAX_JUDGE_ATTEMPTS})`);
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
      audit(`Chapter ${chapter}: judge verdict "${verdict.verdict}" → approved`);
      return;
    }

    const findings = verdict.findings.map(f => `- [${f.severity}] ${f.text}`).join('\n');
    audit(`Chapter ${chapter}: judge found contradictions (${verdict.findings.length} findings) — routing to Forge repair`);
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

// ─── The run ────────────────────────────────────────────────────────────────────

test.describe('Omniscient Sovereigns — full UI-driven run', () => {
  test.skip(!ENABLED, 'Set E2E_OMNI=1 to run.');
  test.describe.configure({ mode: 'serial' });

  test('configure models, upload premise, refine, and generate 10 approved chapters', async ({ page, request }) => {
    test.setTimeout(STEP_TIMEOUT * (CHAPTERS * 3 + 24));
    let novelId = '';
    let volumes: VolumeItem[] = [];
    const arcsByVolume = new Map<string, ArcItem[]>();

    await test.step('1 · create (or resume) the novel with the verbatim premise', async () => {
      const existing = await getJson<{ items: { id: string; name: string }[] }>(request, '/api/v1/projects?limit=100');
      const found = (existing.items ?? []).find(p => p.name === NOVEL_NAME);
      if (found) {
        novelId = found.id;
        audit(`Resuming existing project ${novelId} "${NOVEL_NAME}" from a previous attempt`);
      } else {
        await page.goto('/');
        await page.locator('button[data-variant="primary"]', { hasText: 'New project' }).click();
        await page.getByRole('textbox', { name: 'Working title' }).fill(NOVEL_NAME);
        await page.getByRole('button', { name: 'Create novel' }).click();
        await page.waitForURL(/\/novels\/\d+\/overview/, { timeout: 30_000 });
        novelId = page.url().match(/\/novels\/(\d+)\//)?.[1] ?? '';
        expect(novelId, 'novel id should be present in the overview URL').toBeTruthy();
        audit(`Created project ${novelId} "${NOVEL_NAME}" via the New project dialog`);
      }

      const project = await getJson<{ brief?: string | null }>(request, `/api/v1/projects/${novelId}`);
      if (!(project.brief ?? '').includes('Axiom System')) {
        await page.goto(`/novels/${novelId}/settings`);
        await page.getByRole('textbox', { name: 'Premise / brief' }).fill(PREMISE);
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect.poll(async () => (await getJson<{ brief?: string }>(request, `/api/v1/projects/${novelId}`)).brief, { timeout: 15_000 }).toContain('Axiom System');
        audit(`Pasted NOVEL_DETAILS.md verbatim (${PREMISE.length} chars) into Premise / brief and saved`);
      }

      await drainPendingProposals(page, request, novelId);
    });

    await test.step('2 · configure the model groups through Settings → Models', async () => {
      interface ModelRef {
        provider: string;
        model: string;
      }
      const readOverrides = async (): Promise<Record<string, ModelRef>> =>
        (await getJson<{ config?: { models?: Record<string, ModelRef> } }>(request, `/api/v1/projects/${novelId}`)).config?.models ?? {};

      const current = await readOverrides();
      const satisfied = MODEL_ASSIGNMENT.every(a => current[a.role]?.provider === a.provider && current[a.role]?.model === a.model);
      if (!satisfied) {
        await page.goto(`/novels/${novelId}/settings`);
        await page.getByRole('tab', { name: 'Models' }).click();
        for (const { row, option } of MODEL_ASSIGNMENT) {
          const rowLocator = page.locator('[class*="roleRow"]').filter({ hasText: row });
          await rowLocator.locator('[role="combobox"]').click();
          await page.locator('[role="option"]', { hasText: option }).click();
          audit(`Settings → Models: set "${row}" to "${option}"`);
        }
        const [saveResponse] = await Promise.all([
          page.waitForResponse(r => r.url().endsWith(`/projects/${novelId}`) && r.request().method() === 'PATCH', { timeout: 30_000 }),
          page.getByRole('button', { name: 'Save changes' }).filter({ visible: true }).click(),
        ]);
        expect(saveResponse.ok(), `saving models failed with ${saveResponse.status()}`).toBeTruthy();
      }

      const models = await readOverrides();
      for (const a of MODEL_ASSIGNMENT) expect(models[a.role], `${a.row} must route to ${a.option}`).toEqual({ provider: a.provider, model: a.model });
      audit('Verified persisted per-role overrides: generation→sonnet, plan→opus, judge→qwen3:14b, chat→opus');
    });

    await test.step('3 · generate the story bible and audit it until clean', async () => {
      // A previous attempt may have left the seed running — never double-trigger it.
      await waitForQuiescence(request, novelId, 'bible seed');
      const seeded = (await getJson<{ items: EntityItem[] }>(request, `/api/v1/projects/${novelId}/entities?limit=100`)).items.length > 0;
      if (!seeded) {
        await page.goto(`/novels/${novelId}/story-bible`);
        audit('Clicked "Generate story bible" (seed-from-brief; planning role → Claude Code Opus)');
        await page.getByRole('button', { name: 'Generate story bible' }).click();
        await pollUntil<{ items: EntityItem[] }>(request, `/api/v1/projects/${novelId}/entities?limit=100`, b => b.items.length > 0, 'bible entities', LONG_BUDGET);
        await waitForQuiescence(request, novelId, 'bible seed completion');
      }
      audit('Story bible present (seeded from the premise)');

      await ensureChatSession(request, novelId, { scopeType: 'novel', title: 'Bible coverage & refinement' });
      await ensureBibleCoverage(page, request, novelId, 'Bible coverage & refinement');
      await runBibleAuditUntilClean(page, request, novelId);
    });

    await test.step('4 · plan 1 volume of 10 chapters, judge via chat, approve', async () => {
      const existingVolumes = await getJson<{ items: VolumeItem[] }>(request, `/api/v1/projects/${novelId}/volumes?limit=50`);
      if (existingVolumes.items.length === 0) {
        await page.goto(`/novels/${novelId}/volumes`);
        await page.getByRole('button', { name: 'Generate volumes' }).first().click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('spinbutton', { name: 'Volumes' }).fill(String(VOLUME_COUNT));
        await dialog.getByRole('spinbutton', { name: 'Chapters per volume' }).fill(String(CHAPTERS));
        audit(`Volume plan dialog: ${VOLUME_COUNT} volume × ${CHAPTERS} chapters (planning role → Claude Code Opus)`);
        await dialog.getByRole('button', { name: 'Generate volumes' }).click();
        await pollUntil<{ items: VolumeItem[] }>(request, `/api/v1/projects/${novelId}/volumes?limit=50`, b => b.items.length >= VOLUME_COUNT, 'planned volumes', LONG_BUDGET);
        await waitForQuiescence(request, novelId, 'volume plan completion');
      }

      const planned = await getJson<{ items: VolumeItem[] }>(request, `/api/v1/projects/${novelId}/volumes?limit=50`);
      volumes = [...planned.items].sort((a, b) => a.ordinal - b.ordinal);
      expect(volumes.length, 'exactly 1 volume must be planned').toBe(VOLUME_COUNT);
      const volume = volumes[0] as VolumeItem;
      expect(volume.startChapter, 'volume 1 must have a chapter range').not.toBeNull();
      expect((volume.endChapter ?? 0) - (volume.startChapter ?? 0) + 1, `volume 1 must cover all ${CHAPTERS} chapters`).toBe(CHAPTERS);
      audit(`Volume planned: "${volume.title ?? volume.volumeKey}" covering chapters ${volume.startChapter}–${volume.endChapter}`);

      const status = await getJson<{ planApproved: boolean }>(request, `/api/v1/projects/${novelId}/status`);
      if (!status.planApproved) {
        await ensureChatSession(request, novelId, { scopeType: 'volume_plan', title: 'Volume plan refinement' });
        await judgeViaChatUntilApproved(
          page,
          request,
          novelId,
          'Volume plan refinement',
          `the ${VOLUME_COUNT}-volume plan (${CHAPTERS} chapters, faithful to the premise's Volume 1 "The Fourth Dimension")`,
        );

        await page.goto(`/novels/${novelId}/volumes`);
        await page.getByRole('button', { name: 'Approve plan' }).click();
        await pollUntil<{ planApproved: boolean }>(request, `/api/v1/projects/${novelId}/status`, b => b.planApproved === true, 'volume plan approval');
        audit('Volume plan approved via "Approve plan"');
      } else {
        audit('Volume plan already approved — skipping');
      }
    });

    await test.step('5 · plan 2 arcs, judge via chat, approve', async () => {
      for (const volume of volumes) {
        const existingArcs = await getJson<{ arcs: ArcItem[] }>(request, `/api/v1/projects/${novelId}/volumes/${volume.volumeKey}/arcs`);
        const allApproved = existingArcs.arcs.length === ARCS_PER_VOLUME && existingArcs.arcs.every(a => a.status === 'approved');

        if (allApproved) {
          audit(`Arcs of volume ${volume.ordinal} already approved — skipping`);
        } else {
          if (existingArcs.arcs.length === 0) {
            const planRes = await request.post(`/api/v1/projects/${novelId}/volumes/${volume.volumeKey}/arcs/plan`, {
              data: { arcCount: ARCS_PER_VOLUME, guidance: 'Two escalating arcs that split this volume evenly.' },
              timeout: STEP_TIMEOUT,
            });
            expect(planRes.ok(), `arc planning for ${volume.volumeKey} failed with ${planRes.status()}`).toBeTruthy();
            const plan = (await planRes.json()) as { proposal: ProposalLite; arcs: unknown[] };
            expect(plan.arcs.length, `volume ${volume.ordinal} must plan exactly ${ARCS_PER_VOLUME} arcs`).toBe(ARCS_PER_VOLUME);
            audit(`Arc plan requested for volume ${volume.ordinal} (${ARCS_PER_VOLUME} arcs; planning role → Claude Code Opus)`);
            await applyProposal(page, request, novelId, plan.proposal);
          }

          await ensureChatSession(request, novelId, { scopeType: 'arc_plan', scopeRef: `volume:${volume.volumeKey}`, title: `Arc plan refinement · Volume ${volume.ordinal}` });
          await judgeViaChatUntilApproved(page, request, novelId, `Arc plan refinement · Volume ${volume.ordinal}`, `the ${ARCS_PER_VOLUME}-arc plan of volume ${volume.ordinal}`);

          await openVolume(page, novelId, volume.ordinal);
          const [approveResponse] = await Promise.all([
            page.waitForResponse(r => r.url().endsWith(`/volumes/${volume.volumeKey}/arcs/approve`) && r.request().method() === 'POST', { timeout: STEP_TIMEOUT }),
            page.getByRole('button', { name: 'Approve arcs' }).click(),
          ]);
          expect(approveResponse.ok(), `approving arcs of volume ${volume.ordinal} failed with ${approveResponse.status()}`).toBeTruthy();
        }

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
        audit(`Arcs approved for volume ${volume.ordinal}: ${arcsBody.arcs.map(a => `"${a.title ?? a.arcKey}" (ch ${a.chapterStart}–${a.chapterEnd})`).join(', ')}`);
      }
    });

    await test.step('6 · generate chapter briefs for both arcs', async () => {
      const briefChapters = async (): Promise<Set<number>> =>
        new Set((await getJson<{ items: { chapter: number }[] }>(request, `/api/v1/projects/${novelId}/briefs`)).items.map(b => b.chapter));

      for (const volume of volumes) {
        for (const arc of arcsByVolume.get(volume.volumeKey) ?? []) {
          const start = arc.chapterStart ?? 0;
          const end = arc.chapterEnd ?? 0;
          const have = await briefChapters();
          const missing = Array.from({ length: end - start + 1 }, (_, i) => start + i).filter(c => !have.has(c));
          if (missing.length === 0) {
            audit(`Briefs for arc ${arc.ordinal} (ch ${start}–${end}) already exist — skipping`);
            continue;
          }
          await openArc(page, novelId, volume.ordinal, arc.ordinal);
          audit(`Generating briefs for arc ${arc.ordinal} (outline role → Claude Code Opus)`);
          await page.getByRole('button', { name: /Generate briefs|Regenerate briefs/ }).click();
          await pollUntil<{ items: { chapter: number }[] }>(
            request,
            `/api/v1/projects/${novelId}/briefs`,
            b => {
              const chapters = new Set(b.items.map(x => x.chapter));
              return missing.every(c => chapters.has(c));
            },
            `briefs for arc ${arc.ordinal} (ch ${start}–${end})`,
            LONG_BUDGET,
          );
          await waitForQuiescence(request, novelId, `briefs for arc ${arc.ordinal}`);
        }
      }
      const briefs = await getJson<{ items: { chapter: number }[] }>(request, `/api/v1/projects/${novelId}/briefs`);
      const chapters = briefs.items.map(b => b.chapter).sort((a, b) => a - b);
      expect(chapters, `all ${CHAPTERS} chapter briefs must exist, contiguously`).toEqual(Array.from({ length: CHAPTERS }, (_, i) => i + 1));
      audit(`All ${CHAPTERS} chapter briefs exist (1–${CHAPTERS}, contiguous)`);
    });

    await test.step(`7 · generate all ${CHAPTERS} chapters, then judge and approve each`, async () => {
      const existingDrafts = await getJson<{ items: DraftItem[] }>(request, `/api/v1/projects/${novelId}/drafts`);
      const complete = existingDrafts.items.length >= CHAPTERS && existingDrafts.items.every(d => (d.body ?? '').trim().length > 0);
      if (!complete) {
        await waitForQuiescence(request, novelId, 'pre-generation');
        audit(`Enqueued generation of ${CHAPTERS} chapters via POST /generate (writing role → Claude Code Sonnet)`);
        const generateRes = await request.post(`/api/v1/projects/${novelId}/generate`, { data: { limit: CHAPTERS } });
        expect(generateRes.ok(), `enqueueing generation failed with ${generateRes.status()}`).toBeTruthy();
      }
      const drafts = await pollUntil<{ items: DraftItem[] }>(
        request,
        `/api/v1/projects/${novelId}/drafts`,
        b => b.items.length >= CHAPTERS && b.items.every(d => (d.body ?? '').trim().length > 0),
        `${CHAPTERS} generated chapters`,
        STEP_TIMEOUT * CHAPTERS,
      );
      const chapters = drafts.items.map(d => d.chapter).sort((a, b) => a - b);
      expect(chapters.slice(0, CHAPTERS), 'chapters must be drafted contiguously from chapter 1').toEqual(Array.from({ length: CHAPTERS }, (_, i) => i + 1));
      audit(`All ${CHAPTERS} chapter drafts generated with prose`);

      for (let chapter = 1; chapter <= CHAPTERS; chapter++) {
        const draft = await getJson<DraftItem>(request, `/api/v1/projects/${novelId}/drafts/${chapter}`);
        if (draft.reviewStatus === 'approved' || draft.status === 'final') {
          audit(`Chapter ${chapter} already approved — skipping`);
          continue;
        }
        await judgeAndApproveChapter(page, request, novelId, chapter);
      }
    });

    await test.step('8 · final verification', async () => {
      const drafts = await getJson<{ items: DraftItem[] }>(request, `/api/v1/projects/${novelId}/drafts`);
      expect(drafts.items.length, `${CHAPTERS} chapters exist`).toBe(CHAPTERS);
      for (const draft of drafts.items) {
        expect((draft.body ?? '').trim().length, `chapter ${draft.chapter} has prose`).toBeGreaterThan(0);
        expect(draft.reviewStatus === 'approved' || draft.status === 'final', `chapter ${draft.chapter} is approved (got ${draft.reviewStatus}/${draft.status})`).toBe(true);
      }
      audit(`FINAL: ${CHAPTERS}/${CHAPTERS} chapters generated, judged, and approved. Project id ${novelId}.`);
    });
  });
});
