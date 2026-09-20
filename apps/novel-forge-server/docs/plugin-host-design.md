# Plugin Host Design — per-novel policy without forking core

Novel Forge is one authoring server and one web app. Every novel on the deployment shares the same prompt
modules, the same model map, the same context assembler, and the same planning pipeline. Some novels need
that pipeline to behave differently: a dark-crime novel whose explicit chapters must be written by a
permissive model while every other chapter is written by a model that would refuse them; a novel written in
Shakespearean register; a fair-play mystery that wants clue contracts enforced.

None of that belongs in core. Core is a generic authoring engine and must stay one.

This document specifies a **plugin host**. A plugin is not a prompt decorator and not a second pipeline. It is
a **policy provider at named decision points that core already owns**. Core runs the pipeline and, at five
fixed places, asks the plugins enabled on this novel a question. The plugin answers. Core decides what to do
with the answer.

The only plugin that ships in this tree is a **test fixture** under `tests/`. Real plugins live on disk,
outside the repository. Public CI and public images load none.

Follows the conventions of `ai-system-design.md`. §3 lists amendments. Drives checklist tasks **PG1–PG7**.

---

## 1. Why a decision-point host, and not a prompt hook

The obvious design — let a plugin prepend a system message — cannot express the motivating case. Deciding
that chapter 41 must be written by a permissive model happens in `resolveModel`. Deciding that its brief is
`external` happens on the outline path. Enriching the bible happens after the bible-builder graph. Injecting
material that only a permissive model may see happens in `ContextAssembler`. A prompt hook touches none of
those.

The opposite design — let a plugin change anything — leaves core with no invariants, and every core change
becomes a potential silent plugin break.

So: a **closed set of five decision points**. Each one is a place core already branches. Each has one
question, one answer type, and one rule for what core does with the answer. Adding the fifth plugin adds no
new concepts, which is the property that makes this scale.

| Decision point       | Core asks                               | Answer                        | Arity     |
| -------------------- | --------------------------------------- | ----------------------------- | --------- |
| `canon.augment`      | Anything to add to this novel's canon?  | `PluginChangeOp[]` → proposal | additive  |
| `brief.policy`       | How should these chapters be written?   | `PluginChangeOp[]` → proposal | exclusive |
| `call.route`         | Does this call need a different writer? | `WriterClass`                 | exclusive |
| `context.contribute` | Anything to add to this context pack?   | `PluginContextSection[]`      | additive  |
| `prompt.contribute`  | Anything to add to this prompt?         | system messages + knobs       | additive  |

---

## 2. What core already provides — do not rebuild any of it

The motivating case is mostly already implemented. A plugin supplies the _policy_; core supplies every
mechanism below. An implementing agent that adds a parallel version of any of these has misread this
document.

| Need                                                        | Core mechanism                                                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A chapter the primary writer must skip                      | `briefs.writeMode = 'external'` (`database/schemas/generation.ts`)                                       |
| Writing one chapter with a permissive model                 | `GenerationService.generateUnrestricted` + `UNRESTRICTED_GROUP_DEFAULTS` / `UNRESTRICTED_LLM_ALLOWLIST`  |
| Firewalling that chapter's prose from everything downstream | `chapters.isolated` / `drafts.isolated`; Appendix A rule 8                                               |
| Letting later chapters know it happened without seeing it   | `ContextAssembler` renders summary + continuation state for an isolated predecessor, never the prose     |
| Canon the drafter must act on but never be shown            | `canon_facts.body` hidden; `constraintNote` shown in its place; `terms` drive the leak scan              |
| Deciding which chapter learns which hidden fact             | `briefs.knowledgeContract` + `KnowledgeView { known, reveals, hidden }` (`bible/fact/knowledge-view.ts`) |
| Proposing canon changes for author approval, with revert    | `refinement_proposals` + `ChangeOp[]` + `allowedOps` + `inverseOps` (`refinement/`)                      |
| Per-role model selection and reasoning policy               | `ModelRouterService.resolveModel` + `ROLE_GROUP` + `REASONING_POLICY`                                    |

Core hides a fact along a **narrative reveal** axis. This document adds a second axis — **writer class** —
using the same partition and the same rendering.

---

## 3. Amendments to earlier documents

- **Adds `ai-system-design.md` Appendix A rule 19.** _A plugin influences the pipeline only through the five
  decision points in `plugin-host-design.md` §5. It never registers an HTTP route, never holds the database
  client, and never writes a domain table directly — durable changes are emitted as `ChangeOp[]` and land as
  an author-approved proposal. Plugin-contributed context carries a minimum writer class and is dropped
  before assembly when the resolved class does not satisfy it._
- **Amends Appendix A rule 8 (containment).** A call whose writer class is raised to `permissive` by a plugin
  produces an isolated draft, exactly as `generateUnrestricted` does today. Raising the class and setting
  `isolated` are the same act; neither happens without the other.
- **Amends Appendix A rule 10 (`promptKey@promptVersion` on every call).** When plugins contribute to a call,
  `model_calls` additionally records the resolved policy's plugin stamps (`id`, `version`, `configHash`) and
  the policy digest, so the exact message list stays reconstructable.
- **Rule 18** (added when this document was first drafted, and already live at `ai-system-design.md` §Appendix A)
  stands, with its HTTP and no-database-client clauses unchanged.

No other numbered hard rule is affected.

---

## 4. Locked decisions

1. **Plugins are policy providers, not pipeline implementers.** The five decision points of §5 are the entire
   surface. A capability core does not already have is a core change, not a plugin change.
2. **Deployment is single-tenant self-host.** The same person operates the deployment and authors the novels,
   and writes the plugins. There is no sandbox, no capability enforcement beyond §12's op allowlist, and no
   operator-versus-author distinction. `GET /api/v1/plugins` needs no scoping beyond authentication.
3. **Two layers stay.** Code on disk (`plugins.dir`) and per-novel enable (`project_plugins`) are both
   required — not for permissions, but because different novels want different behaviour.
4. **In-process, filesystem only.** `import()` of `index.js` / `index.ts` under `plugins.dir/<id>/`. That is
   RCE by construction; only that path is trusted. Only direct children load; reject traversal; never fetch
   plugin code over the network.
5. **Generic HTTP and generic web only.** No plugin-specific paths, DTO names, or compiled-in UI. CI runs
   with `plugins.dir` unset, so OpenAPI and `api-types.gen.ts` describe only the generic surface.
6. **Core canon stays sanitized (§5.3.1).** Material a safe model must never see lives in plugin storage
   (`project_plugins.config` / `plugin_kv`) and reaches a call only as a context section gated by writer
   class. It is never written into `canon_facts`, a brief body, an arc, or an entity — all three reach a
   standard-class model by paths §5.3.1 enumerates — is never indexed, and never reaches a reader payload.
7. **Durable changes go through the existing proposal flow.** A plugin emits `ChangeOp[]`; core wraps it in a
   `refinement_proposals` row; the author approves. Plugins never write domain tables.
8. **Plugins name a writer class, never a model.** `call.route` returns `'standard' | 'permissive'`; core maps
   the class through the existing group defaults and allowlist. No vendor identifier appears in plugin code.
9. **Additive hooks compose; exclusive decisions have one owner.** A manifest declares which exclusive
   decision points it claims. Enabling a second plugin that claims a claimed point is refused (`PLG_004`).
   Additive contributions apply in `project_plugins.ordinal` order.
10. **Narrow host, no `db`, project-scoped.** Per-project hooks receive a host already bound to the project.
    `projectId` never appears in the plugin-facing API. Plugins must not import `@modules/*` or `@server/*`.
11. **Storage split.** Settings → `project_plugins.config`. Working state → `plugin_kv`. No core column is
    ever named for a domain concept a plugin might want.
12. **Disable does not delete prose.** `onDisable` must not touch drafts, chapters, or approved canon. KV may
    remain; the plugin decides whether the next enable starts clean.
13. **Stage 1 is the decision-point host plus the hooks the worked example of §16 needs.** Writing knobs,
    plugin-registered prompt modules, `invoke` ops, background jobs, and lifecycle events are stage 2. They
    appear on the interface as optional members so stage 2 adds no redesign.

---

## 5. The decision points

### 5.1 `canon.augment` — additive

Called after a bible seed or build run reaches a terminal state, and on demand from the plugins settings tab.

Core asks for canon additions. The plugin returns `PluginChangeOp[]` (§8 — a structural mirror of the
`ChangeOp` members §12 allows, declared in `plugin.types.ts` so a plugin never imports `@modules/refinement`).
Core validates each op against the real `OP_SPECS` and creates a `refinement_proposals` row with
`kind: 'plugin'` and `allowedOps` restricted per §12. The author reviews and applies it through the existing
proposal UI; the applied ops become ordinary entity, fact, and bible-document rows carrying plugin provenance,
editable by hand and visible in the bible.

A plugin that wants a truth the drafter must never read emits `fact.upsert` with the truth in `body`, the
POV-safe behaviour in `constraintNote`, and the give-away strings in `terms`. That is core's existing hiding
mechanism; the plugin does not need one of its own.

`canon.augment` is also how a plugin **places a beat at a chapter**, which is what makes §5.2 tractable. Two
levers reach the planner, and they are the only two:

- `fact.upsert` with `revealChapter: N` — the outline prompt already instructs the planner to read the
  catalog's CANON FACTS section to decide when a hidden truth comes out and to stage the matching
  `knowledgeContract.learns`.
- `arc.upsert` narrative fields — `arc.body` is injected verbatim into the planner's human message as
  `## Arc material` (`GenerationService.outlineArc`), the most direct influence available.

Neither is a guarantee. The planner also cannot skip or invent a chapter: `buildOutlinePrompt(start, end)`
runs `validateOutlineCoverage`, so exactly one brief per chapter in the span comes back or the repair ladder
rejects the response. The slot always exists; §5.2 is what guarantees its content.

### 5.2 `brief.policy` — exclusive

Called **after** `outline` or `outlineArc` returns, with every brief in the span.

Firing after the planner rather than steering it from inside is deliberate. The planner is an LLM: it can be
nudged (§5.1) but never compelled. `brief.policy` is where deterministic, non-model code inspects what the
planner actually produced and either corrects it or surfaces the miss. Design for drift, not for compliance.

Core passes `BriefSummary[]`. The plugin returns `PluginChangeOp[]` — the same shape as `canon.augment`, so it
can mark a chapter `external`, attach guidance, **and rewrite a brief's title and body** when the planner put
the beat somewhere else or missed it entirely. Core stages one proposal; nothing is applied without approval,
and each op's `rationale` is rendered beside it.

```
did any brief in the span cover the beat this plugin owns?
  ├─ the expected chapter does → brief.update { writeMode: 'external' }
  ├─ a different chapter does  → brief.update on that chapter instead — follow the planner
  └─ none does                 → brief.update rewriting title/body to cover it, plus writeMode
```

Two mechanics this depends on:

- **`BriefUpdateOp` gains a `writeMode` field** (§18) — it does not carry one today, and `OutlineSchema` has
  none either, so post-hoc marking is the only way a brief ever becomes `external`.
- **An applied plugin `brief.update` always sets `handEdited: true`.** `outlineArc` writes `handEdited: false`
  on every brief it touches, and reconciliation re-outlines automatically every
  `generation.reconciliation.cadence` finalized chapters (default 5). Without the flag, an auto-reconciliation
  weeks later silently strips the `external` marking and the primary writer walks straight into the chapter.

### 5.3 `call.route` — exclusive

Called in `ModelRouterService.resolveModel`, and — critically — **before context assembly**, because the
resolved class is what §5.4 gates on.

```ts
type WriterClass = 'standard' | 'permissive';
```

The plugin returns a class or `undefined` (no opinion). Core resolves it:

- `standard` → `PRODUCTION_GROUP_DEFAULTS` / `PRODUCTION_DEFAULTS`, exactly as today.
- `permissive` → `UNRESTRICTED_GROUP_DEFAULTS`, clamped by `isUnrestrictedAllowed`.

**`call.route` reaches every role, not only `generation`.** It lives in `resolveModel`, so `outline`, `plan`,
`arc`, `bible`, `judge` and the rest all pass through it — and every call that reads a plugin-gated pack is
handed the **same** policy object that gated it, so the class the pack was assembled at and the class the
model is routed at cannot drift apart. That matters as the last fallback when a planning
model balks at plotting a novel's darker material: the plugin routes the _planning_ call to the permissive
class too, and the briefs are written there. There is no call in the pipeline a plugin cannot move, so the
design never depends on a standard-class model agreeing to a task.

In practice that fallback is rarely reached. A brief states what happens at plot level — the register of a
jacket blurb or a plot synopsis — and a planning model writes that readily; what it declines is depiction,
which a brief never contains. The escalation order when a brief comes back too soft is §5.2's rewrite first,
arc material phrasing second, and routing the planner permissive only third.

A project already in `contentMode: 'unrestricted'` starts at `permissive`. A plugin may **raise** a call to
`permissive` on any project — matching `interstitial-chapter-design.md` decision 7, which already allows an
unrestricted write on a standard-mode novel. A plugin may not lower a `permissive` project to `standard`;
that is the author's setting, not a plugin's.

**Raising the class and isolating the output are one act.** A generation whose class was raised by a plugin
writes its draft with `generator: 'unrestricted'` and `isolated: true`, exactly as `generateUnrestricted`
does. There is no path that produces permissive prose outside the containment firewall. Containment keys on
`policy.raised`, never on the resulting class: an unrestricted-mode novel already starts permissive, and its
own generations stay uncontained exactly as they are today.

The raise is **sticky for the whole run**, not per node. A run resolves a policy per role — `generation`,
`title`, `judge`, `fix` — and any one of them may be the raised one, so a raise anywhere in the run isolates
the draft that run persists. `chapter-generation.graph.ts` carries this as the `writerClassRaised` reducer:
it ORs rather than replaces, so a later unraised node cannot un-contain prose an earlier raised call shaped.
Over-containment is the safe direction, matching §4 decision 12.

### 5.3.1 The sanitization rule — what may go in a core artifact

**Anything a plugin writes into a core artifact — a brief, a canon fact, an entity, an arc — must survive
being read by the safe planner and the chat model. Anything a safe model would refuse lives in plugin storage
and reaches a model only through a §5.4 section gated on `minWriterClass: 'permissive'`.**

This is not tidiness. A brief body looks safe because it normally reaches only its own chapter's writer, and
that reasoning is wrong — there are three paths by which core artifacts reach a standard-class model:

| Path                                                                                                                                                       | Where                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `canon_facts.text` renders into the planner's catalog (first 160 chars) on every outline call                                                              | `catalog.service.ts` canon-facts block        |
| A `brief:N` ref renders `brief.body` **in full** into any pack that requests it — including a chat-hub declared lookup, which runs on the chat-group model | `context-assembler.service.ts` `case 'brief'` |
| `briefs_list` renders `Ch N: <title>` for the whole arc into the stable segment                                                                            | `context-assembler.service.ts`                |

The first is the worst: an unsafe fact body poisons **every subsequent outline and reconciliation pass**, so
the planner begins refusing and does not recover until the fact is edited.

The split a plugin must therefore keep:

| Channel                 | Carries                             | Stored in                | Reaches               |
| ----------------------- | ----------------------------------- | ------------------------ | --------------------- |
| The beat (**what**)     | plot-level events, sanitized        | `briefs.body`, canon     | everything            |
| Register (**how far**)  | standing permission and style rules | `project_plugins.config` | permissive calls only |
| Staging (**specifics**) | per-chapter detail, optional        | `plugin_kv`              | permissive calls only |

The beat is writable by the safe planner — plotting a violent event is not the same act as depicting one, and
the planning model declines the second, not the first. The practical test for whether a line belongs in a core
artifact is whether it would read as normal jacket copy or a plot synopsis; if it would, the planner writes it,
and if it would not, it is depiction and belongs in the register or staging channel. Register is authored once for the whole novel, which is
what makes the arrangement scale across many flagged chapters rather than requiring per-chapter authoring.

### 5.4 `context.contribute` — additive

Called inside `ContextAssembler.forChapter` (and the other purposes) with the already-resolved writer class.

```ts
interface PluginContextSection {
  key: string;
  title: string;
  rendered: string;
  segment: 'stable' | 'volatile';
  minWriterClass: WriterClass;
  required?: boolean;
}
```

**`minWriterClass` is the leak guard, and it is structural.** The assembler drops any section whose
`minWriterClass` exceeds the call's resolved class before the pack is built. A section marked `permissive`
cannot enter a pack destined for a standard model, because the class is known before assembly begins — there
is no ordering in which the check can be skipped.

**The class the guard reads is the lowest among the roles that will consume the pack.** Rule 6 assembles the
pack once per run while §5.3 routes per role, so one pack can outlive the call that built it: chapter
generation assembles under `generation` and the `judge` and `fix` nodes reload the same `context_packs` row.
`ScopedPolicyResolver.forPack(call, consumers)` therefore resolves every consuming role off the one scope and
guards against the minimum, so a plugin that raises `generation` alone cannot bake a permissive section into a
pack a standard-class judge reads. The cost is accepted: that writer loses its permissive section for as long
as it shares a pack with a standard consumer. §16's real path is `generateUnrestricted`, whose pack has one
consumer, so it is unaffected. A purpose consumed by a single call passes that call's own policy, and passes that same object on to
`structured()`/`chatFor()`. Where a pack has several consumers the two differ on purpose: the **pack** is
clamped to the minimum, while each **call** routes at its own role's class — the clamp decides what may be
written into a shared artifact, not what a given model is allowed to be.

Plugin sections are rendered into the pack, counted against the token budget like every other section, and
persisted with the `context_packs` row for reproducibility. They are **never** indexed, never retrievable,
and never reach a publish payload — they are not prose.

Section keys are namespaced `plugin:<pluginId>:<key>` and cannot collide with a core `SECTION_LABELS` entry.

### 5.5 `prompt.contribute` — additive

Called in `ModelRouterService.buildMessages`, after the module's messages are formatted and before
cache-control.

Stage 1: extra system messages, appended after the module's own system message.

Stage 2 (interface reserved, not wired): writing knobs.

```ts
interface WritingKnobs {
  instructions?: string;
  targetWords?: { min: number; max: number };
}
```

`instructions` replaces the project's editable instructions for this call — the `writing_style` context
section. `targetWords` requires making `generation.prompt.ts`'s hardcoded "1,800–2,600 words" a template
variable, which is why it is stage 2.

---

## 6. The call policy — one resolution per generation

Every decision point needs the same inputs, and three of them need an answer that is already fixed by the
time a later one runs. So the policy is resolved **once** and threaded, rather than each hook querying on its
own.

```ts
interface PluginStamp {
  id: string;
  version: string;
  configHash: string;
}

interface ForgeCallPolicy {
  writerClass: WriterClass;
  /** True only when a plugin lifted this call above the project's own class. */
  raised: boolean;
  plugins: PluginStamp[];
  systemMessages: Array<{ role: 'system'; content: string }>;
  contextSections: PluginContextSection[];
  knobs: WritingKnobs;
  digest: string;
}
```

`PluginPolicyService.resolve(projectId, { role, chapter })` builds it, memoized per project for the life of a
workflow run or HTTP request. It is passed to `ContextAssembler.forChapter` and to
`ModelRouterService.structured`.

This single object closes four defects that a per-hook design would otherwise ship with:

1. **Cache correctness.** `ModelRouterService.hashRequest` currently hashes `{ provider, model, promptKey,
promptVersion, input }`, and `llm_cache.requestHash` is globally unique — not scoped by project. Without
   the policy in the key, a plugin-shaped result for one novel is served verbatim to another novel's
   plugin-free call on any cacheable role (`judge`, `validation`, `continuity`, `extraction`, `review`,
   `audit`, `compact` — several of which reach `structured()` today). **`policy.digest` is folded into
   `hashRequest`.**
2. **Reproducibility.** `policy.plugins` and `policy.digest` are written to the `model_calls` row, satisfying
   the amended rule 10.
3. **Query load.** One `project_plugins` read per run, not one per model call — graphs make dozens.
4. **Ordering.** The writer class is fixed before assembly, which is what makes §5.4's guard structural.

`ScopedPolicyResolver` exposes both `for(call)` — the policy of one model call — and `forPack(call, consumers)`,
which returns the same shape with `writerClass` (and therefore `raised` and `digest`) resolved at the lowest
class among `consumers`, and the additive hooks run at that class. Both answer off the one `project_plugins`
read, so §5.4's rule costs no extra query.

### 6.1 Coverage limit — state it, do not paper over it

`call.route` and `context.contribute` reach **every** wired purpose: each pack-assembling call site resolves a
policy, gates its pack with it, and hands the same object to the model call, so both points are honoured at
generation, outline, revision, validation, chat, ideation, arc planning, premise, audit, rebrand, reforge,
transform, analysis, illustration and the extraction/continuity/review passes over a chapter pack.

`prompt.contribute` reaches only what `structured()`'s `buildMessages` covers, so it stops at the three raw
`chatFor()` clients that format their own messages — `chapter-generation.graph.ts` (judge),
`novel-validation.graph.ts`, and `generation.service.ts` (`judgeDraft`).

A second set of calls is left **unrouted** as well, and deliberately: every model call that reads no
plugin-gated pack. Those are the graders reading prose the pipeline already produced (`chapter-rebrand.graph.ts`
audit, `chapter-reforge.graph.ts` judge, `span-transform.graph.ts` judge) and the chains that build their own
inputs (`plan`, `skeleton`, `epitome`, `chapter-summarize`, `recombine`, `bible-builder`, `source-extraction`,
`chat-compact`, the whole-book `outline`, and `chapter-finalization`'s continuity pass). Nothing a plugin
contributed reaches any of them, so there is no class to keep in step. `illustration.service.ts`'s image call
is the one call reading downstream of a gated pack that stays unrouted: the compose call ahead of it is gated
and routed, and what it hands on is a persisted prompt spec — a core artifact, and therefore §5.3.1's
sanitization rule, not the router's problem. Routing an image model is a separate decision from routing a
text one and is not taken here.

**There is no loader warning for the gap, because none can be written.** A manifest declares decision points,
never roles, and `contributeSystemMessages` chooses its roles at call time from `ctx.role` — the loader has
nothing to inspect. A runtime check cannot stand in either: `judge` reaches `structured()` at one call site and
`chatFor()` at another, so the role does not discriminate. The limit is stated here and nowhere else; a
warning that cannot fire would be worse than none.

---

## 7. Shape

```
plugins.dir/
  <plugin-id>/
    manifest.json
    index.js          # default export: createPlugin(host): ForgePlugin

boot   → PluginHost reads each direct child, validates id === dirname, import()s the entry
web    → GET /api/v1/plugins   (empty array when dir unset or empty)
author → PUT /api/v1/projects/:id/plugins/<id>  { config }
plan   → outline → brief.policy → proposal → author approves
write  → PluginPolicyService.resolve → call.route → context.contribute → prompt.contribute
```

`plugins.dir` is optional config (`Config.load('plugins.dir', { defaultValue: '' })` in `src/bootstrap.ts`).
Empty or unset ⇒ no plugins, `GET /plugins` returns `[]`, every pipeline stage behaves exactly as today.

| File                     | Role                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `manifest.json`          | Identity, decision points claimed, forms. `id` must equal the directory name (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) |
| `index.js` or `index.ts` | Default export `createPlugin(host)`. `.ts` loads because the runtime is Bun                                 |

A load failure (missing entry, thrown factory, id mismatch, manifest that fails validation) logs and **skips
that plugin**. Boot never crashes. The skipped id is absent from `GET /plugins`.

`manifest.json` is canonical and is validated before the entry is imported; the loader then validates what
`manifest()` returns and skips the plugin when the two disagree in any field, so one manifest steers both the
recorded contract and the plugin's own behaviour.

Plugins resolve npm imports against their own directory, not the server's `node_modules`, and the backend
ships as a single-file `Bun.build` bundle. **Plugins must be dependency-free or pre-bundled.** The build emits
`dist/plugin.types.d.ts` so a plugin can be authored against the real contract.

---

## 8. Types (public contract)

`src/modules/plugins/plugin.types.ts`. This file is what a plugin is authored against. Keep it free of
domain-specific names.

```ts
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
 * The ops a plugin may emit, structurally mirroring the `ChangeOp` members §12 allows. Declared here
 * rather than imported so a plugin never depends on `@modules/refinement`; the loader validates every
 * emitted op against the real `OP_SPECS` before a proposal is staged.
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
  /** Why this change is being made, shown to the author beside the op (§5.2). Every op accepts one; apply strips it, so it never reaches the artifact. */
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
  contributeSystemMessages?(ctx: ProjectContext & CallContext): Array<{ role: 'system'; content: string }>;

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
    get(key: string): Promise<unknown | undefined>;
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
```

`ScopedPluginHost` is bound to one project. **`projectId` appears nowhere in the plugin-facing API**, so a
plugin cannot address another novel even by mistake — object-level authorization stops being a convention the
plugin has to honour and becomes a property of the type.

`host.read.*` is read-only. There is no write API: durable change is `ChangeOp[]` through a proposal, and
working state is `host.kv`.

Stage 2 adds `host.jobs.enqueue` and `host.modelRouter.structured`. Stage 1 does not expose them — an
`invoke` op is the only thing that would need them, and `invoke` is stage 2.

### 8.1 Config validation

The host validates `config` against `forms.settings` before storing: declared field types, `required`, and
`enum` membership. Unknown keys are rejected. `onEnable` then runs and may throw for semantic rules a form
cannot express. Either failure is `PLG_003`; a plugin throw is never surfaced as an internal error.

`project_plugins.plugin_version` records the manifest version the config was validated against. When a
plugin on disk reports a different version, the row is re-validated on read; a row that no longer validates
is reported as `needsReview` on the list route and contributes nothing to any decision point until the author
re-saves it. This is the entire config-migration story, and it is deliberate: stale config silently steering
generation is the failure worth preventing.

---

## 9. Schema

`src/database/schemas/plugins.ts`, re-exported from `schemas/index.ts`. Note the `jsonb` import — this
repository uses a local `customType` wrapper, because Drizzle's built-in helper double-encodes under the
bun-sql driver and every value lands as a jsonb string scalar.

```ts
import { bigint, bigserial, integer, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';
import { projects } from './projects';

export const projectPlugins = pgTable(
  'project_plugins',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    pluginId: varchar('plugin_id', { length: 64 }).notNull(),
    pluginVersion: varchar('plugin_version', { length: 32 }).notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    ordinal: integer('ordinal').notNull().default(0),
    enabledAt: timestamp('enabled_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique().on(t.projectId, t.pluginId)],
);

export const pluginKv = pgTable(
  'plugin_kv',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    projectId: bigint('project_id', { mode: 'bigint' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    pluginId: varchar('plugin_id', { length: 64 }).notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  t => [unique().on(t.projectId, t.pluginId, t.key)],
);
```

`ordinal` orders additive contributions. `plugin_kv.value` is rejected above 256 KB serialized — without a
bound it becomes an unbounded per-project blob store.

No enum of plugin ids — the disk is the catalog. `refinement_kind` gains the value `'plugin'`.

---

## 10. Error codes

Add to `AppErrorCode` (`src/classes/app-error-code.ts`):

| Code      | HTTP | When                                                                                            |
| --------- | ---- | ----------------------------------------------------------------------------------------------- |
| `PLG_001` | 404  | Plugin id is not loaded on this deploy                                                          |
| `PLG_002` | 404  | Plugin is not enabled on this novel. Same 404 as missing, so a probe cannot distinguish the two |
| `PLG_003` | 400  | Config fails the manifest form validation or the plugin's `onEnable`                            |
| `PLG_004` | 409  | Another enabled plugin already claims an exclusive decision point this plugin claims            |
| `PLG_005` | 400  | A plugin emitted a `ChangeOp` outside the allowlist of §12                                      |

An unknown throw from any decision-point hook is logged with the plugin id, and the hook is treated as having
returned nothing. **A misbehaving plugin degrades that decision point; it never fails the generation.** The
single exception is `onEnable`, whose throw is the author-visible `PLG_003`.

---

## 11. Model routing

`resolveModel(role, project, policy)`:

1. If `policy.writerClass === 'permissive'`, resolve against `UNRESTRICTED_DEFAULTS`, honouring a per-project
   override only when `isUnrestrictedAllowed(role, override)` — unchanged behaviour, reached by a new route.
2. Otherwise resolve exactly as today.

`project.contentMode` continues to select the baseline map. The plugin raises a single call; it never widens
`UNRESTRICTED_LLM_ALLOWLIST`, and it never names a model.

A generation whose class was raised writes `generator: 'unrestricted'`, `isolated: true` (§5.3).

---

## 12. What a plugin may propose

`ProposalService.create` is called with an explicit `allowedOps`:

**Allowed:** `entity.upsert`, `entity.remove`, `fact.upsert`, `fact.remove`, `bible_document.upsert`,
`bible_document.remove`, `brief.update` **restricted to its own content** — `title`, `body`, `writeMode`,
`contextRefs`, `endingContract`, `knowledgeContract` — and `arc.upsert` **restricted to its narrative
fields** — `title`, `objective`, `escalation`, `payoff`, `hook`, `body`.

**Refused (`PLG_005`):** every `action.*` op, `draft.update`, `draft.remove`, `brief.remove`, `arc.remove`,
`premise.update`, `seed.update`, all volume ops, `arc.upsert` carrying `chapterStart`, `chapterEnd`, or
`ordinal`, `brief.update` carrying `arcKey` or `volumeKey`, and an `arc.upsert` that names a different
`volumeKey` than the arc already sits in.

The arc split is the load-bearing one. An arc's narrative fields are how a beat gets placed at a chapter
(§5.1), so a plugin needs them. An arc's chapter range and ordinal are the book's skeleton — moving them
renumbers chapters and invalidates briefs. That is `ChapterInsertService`'s job under an explicit author
action, never a background policy hook's.

The parenting refusals are the same split one level up: which arc a chapter belongs to, and which volume an
arc belongs to, are structure, and a plugin proposes what the novel _contains_, never how it is arranged.
`volumeKey` is required on `arc.upsert` (§8), so it is a _change_ to an existing arc's volume that is
refused, not its presence — a check the pure validator cannot make, so it runs in `PluginProposalService`
against the arc rows before the proposal is staged.

The refusals are the point. `action.*` would let a plugin enqueue generation, approve a draft, or finalize a
chapter — a plugin proposes what a novel _contains_, never what the pipeline _does next_. `draft.*` would let a
plugin rewrite prose behind the author; that is the author's or an explicit `invoke` op's job, not a
background policy hook's.

---

## 13. HTTP

All routes `@Authenticated()`. Project-scoped routes carry `:projectId`, so `ProjectOwnershipGuard`
(`src/modules/project/project-ownership.middleware.ts`) generates a handler for them automatically — no
per-route check to add.

| Method   | Path                                                    | Behaviour                                                                                                         |
| -------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/plugins`                                       | Manifests loaded on this deploy. `[]` when none                                                                   |
| `GET`    | `/api/v1/projects/:projectId/plugins`                   | Enabled plugins + stored `config` + `installed` + `needsReview`                                                   |
| `PUT`    | `/api/v1/projects/:projectId/plugins/:pluginId`         | Enable or update config. `PLG_001` if not on disk, `PLG_003` on invalid config, `PLG_004` on exclusivity conflict |
| `DELETE` | `/api/v1/projects/:projectId/plugins/:pluginId`         | Disable. Idempotent 204. Calls `onDisable` when a row existed                                                     |
| `POST`   | `/api/v1/projects/:projectId/plugins/:pluginId/augment` | Run `canon.augment` on demand; returns the created proposal id, or 204 when the plugin proposes nothing           |

A row whose plugin is no longer on disk is returned with `installed: false`, contributes to no decision point,
and renders as unavailable. It is never silently deleted — the author's enablement is not the loader's to
discard.

`POST .../invoke` is stage 2, with the action surfaces in the manifest.

Controllers live in `src/modules/plugins/` (`plugin.controller.ts`, `plugin.dto.ts`, `plugin.service.ts`,
`plugin-policy.service.ts`, `plugin-host.service.ts`, `plugin-loader.ts`, `plugin.types.ts`,
`plugins.module.ts`, barrel). Register `PluginsModule` in `dynamic.modules.ts` `HttpRouteModule` imports.

DTOs are `@Schema` / `@Field` classes; `config` is `Record<string, unknown>`, matching the existing free-form
jsonb fields across `generation.dto.ts` and `refinement.dto.ts`.

---

## 14. Web (`novel-forge-web`)

No plugin-specific strings in production source.

1. **Settings → Plugins tab** (a fourth tab on `settings.tsx`, which today has general / models / danger).
   Hidden when `GET /plugins` is empty. Per plugin: enable/disable, ordinal, the `forms.settings` form
   rendered with `@shadow-library/ui` (`FormField` + `Input` / `Textarea` / `Checkbox` / `Select` per
   `widget`), and a "Suggest canon additions" button when the manifest declares `canon.augment`.
2. **Proposal surfacing.** A plugin proposal is an ordinary refinement proposal and appears in the existing
   proposal UI. It needs only a badge identifying the plugin as its source, and `rationale` rendered per op.
3. **Unavailable and needs-review states.** A row with `installed: false` or `needsReview: true` renders
   disabled with the reason.
4. API wrappers next to the other `src/lib/apis/*.api.ts` files.

Form renderer: only the field types in §8. No general JSON Schema engine.

---

## 15. Conventions

- `AGENTS.md` and `.claude/skills/shadow-library-ecosystem/`.
- DTOs `@Schema` / `@Field`; errors from the catalog; `Config.load` never `process.env`; `Logger.getLogger`;
  `@Injectable` / `@Module`.
- Verify from repo root: `bun scripts/verify.ts apps/novel-forge-server`, `… apps/novel-forge-web`.
- Schema: `bun scripts/check-migrations.ts apps/novel-forge-server`; migration via
  `bun scripts/db.ts apps/novel-forge-server generate`.
- Kebab-case filenames with role suffixes; named exports; 2-space; 180-col; comments only for a non-obvious
  constraint.

---

## 16. Worked example — the dark-crime plugin (lives on disk, NOT in this tree)

This is the case the host is designed against. It ships nowhere in this repository; it is written here only
so the decision points can be checked against something real.

The novel is crime fiction with explicit violence. The primary writing model refuses that material; a
permissive model writes it badly everywhere else. The author wants the good writer for 95% of the book and the
permissive writer for the chapters that need it — with the good writer still writing _around_ those events
correctly.

**Settings** (`forms.settings`): the intensity threshold, the list of arcs in scope, and the house rules for
how explicit material should be handled.

**`canon.augment`** emits `fact.upsert` ops for the events that will be depicted explicitly. Each one puts the
sanitized truth in `body`, the POV-safe behaviour in `constraintNote` ("Dara will not enter the east wing and
changes the subject when it is named"), and the give-away strings in `terms`. The author approves them. From
that moment the standard writer has exactly what it needs: it knows something happened, it knows how the cast
behaves because of it, and the leak scan blocks it from naming the specifics.

**`brief.policy`** reads the approved outline, marks the chapters that must depict the material as
`writeMode: 'external'`, attaches guidance, and gives a `rationale` per chapter. The author approves. Those
slots are now skipped by the primary writer's batch loop — core behaviour that already exists.

**`call.route`** returns `permissive` for a generation call on a chapter whose brief is `external`. Core routes
it through the unrestricted map and the resulting draft is isolated.

**`context.contribute`** returns the explicit staging detail — held in `plugin_kv`, never in `canon_facts` —
as a section with `minWriterClass: 'permissive'`. On every standard-model call that section does not exist.

**Return path.** No judge runs on that chapter — `generateUnrestricted` bypasses the chapter-generation graph,
so no review-class model reads the prose. `summarizeChapter` then runs a permissive model over it and returns
`{ summary, state }` **without persisting**, so the author edits what crosses the firewall before saving; the
`CHP_005` finalize gate makes that step unskippable. Chapter 42 sees that edited summary, the continuation
state, and the approved `constraintNote` — nothing else.

**Net effect:** the good model writes the novel and never sees material it would refuse. The permissive model
writes the handful of chapters that need it, with the full detail and the author's own guidance. Downstream
chapters see summary and continuation state only. Nothing explicit is ever in the bible, the vector indexes,
or a reader payload.

A Shakespearean-register plugin uses one decision point: `prompt.contribute` (plus stage 2's `instructions`
knob). A fair-play mystery plugin uses `canon.augment` and `brief.policy`. Neither needs a host change.

---

## 17. Test fixture

`tests/plugins/fixtures/twin-track/` — deliberately abstract, so no production or fixture string describes a
content policy, a genre, or an imprint.

- `manifest.json` — id `twin-track`, decision points `canon.augment`, `brief.policy`, `call.route`,
  `context.contribute`, `prompt.contribute`; `exclusive: ['brief.policy', 'call.route']`.
- Settings form: `markedChapters` (string, comma-separated), `noteText` (string, textarea), `addFact`
  (boolean).
- `index.ts`:
  - `augmentCanon` — one `fact.upsert` when `addFact` is set.
  - `decideBriefPolicy` — a `brief.update` op setting `writeMode: 'external'` for every chapter in
    `markedChapters`, plus a title/body rewrite for any whose brief does not already mention `noteText`.
  - `decideWriterClass` — `permissive` when the call's chapter is in `markedChapters`, else `undefined`.
  - `contributeContextSections` — one section with `minWriterClass: 'permissive'` carrying `noteText`.
  - `contributeSystemMessages` — one message for roles `generation`, `revision`, `fix`; empty otherwise.

Two single-purpose fixtures sit beside it, equally abstract: `route-claim/` claims `call.route` exclusively
and refuses a config no form can express, and `role-route/` raises the class for one configured call role
only — the shape that proves the raise is sticky across the repair ladder rather than keyed on `generation`.

`tests/plugins/plugin-host.spec.ts` and an HTTP e2e beside the other controller specs:

1. `plugins.dir` unset ⇒ `GET /plugins` is `[]`; a generate-path policy is empty; `buildMessages` output is
   byte-identical to the no-plugin baseline.
2. Dir set ⇒ the fixture appears in `GET /plugins`.
3. Enabled on project A only ⇒ A's generate call carries the system message; B's does not.
4. Disable on A ⇒ contribution gone.
5. A marked chapter resolves `writerClass: 'permissive'`; an unmarked one resolves `standard`.
6. **The permissive-only section is present in a marked chapter's pack and absent from an unmarked
   chapter's pack.** This is the containment assertion; it fails loudly if the guard is ever reordered.
7. A permissive-routed generation writes `isolated: true`.
8. `decideBriefPolicy` produces a proposal, not a mutation — briefs are unchanged until it is applied, and an
   applied brief op leaves `handEdited: true` so a later reconciliation pass cannot strip it.
9. A plugin emitting `action.generate_chapters` is refused with `PLG_005`.
10. Enabling a second fixture claiming `call.route` ⇒ `PLG_004`.
11. `PUT` with config failing the form ⇒ `PLG_003`; a plugin whose hook throws ⇒ generation still succeeds
    with that contribution dropped.
12. Two calls that differ only in plugin config produce different `llm_cache` request hashes.

`PluginHost.registerForTest(plugin)` is an allowed in-memory seam; the HTTP e2e covering (2) must still load
from a real directory.

---

## 18. Files to touch

**Server**

- `src/bootstrap.ts` — `plugins.dir`
- `src/database/schemas/plugins.ts` + barrel; `refinement_kind` gains `'plugin'`
- `src/classes/app-error-code.ts` — `PLG_001`–`PLG_005`
- `src/modules/plugins/` — loader, host, policy service, service, controller, DTOs, module, types
- `src/modules/dynamic.modules.ts` — import `PluginsModule`
- `src/modules/ai/model-router.service.ts` — `resolveModel` takes the policy; `buildMessages` appends
  contributions; **`hashRequest` folds in `policy.digest`**; `model_calls` records plugin stamps
- `src/database/schemas/ai.ts` — `model_calls` gains nullable `plugins` (jsonb) and `policy_digest`, the
  columns the amended rule 10 requires; both stay null on a plugin-free call
- `src/modules/ai/graphs/chapter-generation.graph.ts` — resolve the policy once per run and thread it to
  every node's call; apply the isolated-draft invariant where the draft is persisted
- `src/modules/ai/graphs/novel-validation.graph.ts` — thread the policy into its raw `chatFor()` client, so
  §6.1's coverage claim holds without an asterisk
- `src/modules/ai/context/context-assembler.service.ts` — every purpose accepts the policy; `finalize` merges
  plugin sections and enforces `minWriterClass`
- `src/modules/ai/context/plugin-sections.ts` — the `minWriterClass` guard itself; `context/sections.ts` gains
  `CORE_SECTION_KEYS` and `renderPluginSection`
- `src/modules/ai/graphs/chapter-rebrand.graph.ts`, `chapter-reforge.graph.ts`, `span-transform.graph.ts` —
  resolve a scoped policy per run and thread it into both their packs and the calls that read them
- `src/modules/generation/chapter-insert.service.ts`, `src/modules/refinement/{chat,refine}.service.ts`,
  `src/modules/ideation/ideation.service.ts`, `src/modules/rebrand/rebrand.service.ts`,
  `src/modules/reforge/{reforge-plan,reforge-analysis}.service.ts`,
  `src/modules/illustration/illustration.service.ts` — resolve a policy per request and thread the **same**
  object into both the pack and the model call; their modules import `PluginsModule`
- `src/modules/ai/telemetry.handler.ts` — carry plugin stamps onto the `model_calls` row
- `src/modules/generation/generation.service.ts` — resolve the policy once per generation; apply the
  isolated-draft invariant when the class was raised
- `src/modules/refinement/change-set.ts` — `BriefUpdateOp` gains `writeMode`; `OP_SPECS` updated
- `src/modules/refinement/proposal.service.ts` — accept `kind: 'plugin'` with the §12 `allowedOps`
- tests as §17; migration via `bun scripts/db.ts apps/novel-forge-server generate`
- build: emit `dist/plugin.types.d.ts`

**Web**

- `src/lib/apis/plugin.api.ts`
- Settings Plugins tab; plugin badge + `rationale` on the proposal UI
- `api-types.gen.ts` regen

**Do not** add a production plugin, or any genre, imprint, or content-policy copy to
`src/modules/ai/prompts/` or to production web source.

---

## 19. Tasks

Ordered so that every task's verification is runnable when the task lands. The fixture comes early because it
is the harness for everything after it, and the type regeneration precedes the web work that type-checks
against it.

- [x] **PG1** — `plugin.types.ts`, loader, `plugins.dir`, `GET /api/v1/plugins`, `registerForTest`. Unset or
      empty dir ⇒ `[]`. Boot skips a failing plugin. Verify: loader unit tests; HTTP list with dir unset.
- [x] **PG2** — Fixture `tests/plugins/fixtures/twin-track/`. Verify: it loads and lists.
- [x] **PG3** — `project_plugins` + `plugin_kv` + `PLG_001`–`PLG_004` + enable/disable + config validation +
      exclusivity + scoped host + `host.kv` + `host.read`. Verify: migration applies; enable on A invisible to
      B; disable idempotent; `PLG_003` / `PLG_004`; `installed: false` and `needsReview` paths.
- [x] **PG4** — `PluginPolicyService` + `ForgeCallPolicy` + `call.route` + writer-class resolution + the
      isolated-draft invariant + **`hashRequest` digest** + `model_calls` stamps. Verify: fixture test 5, 7,
      12; one `project_plugins` read per run.
- [x] **PG5** — `context.contribute` + `minWriterClass` guard + `prompt.contribute`. Verify: fixture tests 1,
      3, 4, 6; a hook that throws drops its contribution without failing generation.
- [x] **PG6** — `canon.augment` + `brief.policy` + `BriefUpdateOp.writeMode` + `refinement_kind` `'plugin'` +
      the §12 op allowlist + `POST .../augment`. Verify: fixture tests 8, 9; the proposal applies and reverts
      through the existing flow.
- [x] **PG7** — Regen `api-types.gen.ts` from a booted server (dir unset), then the web Plugins tab and
      proposal badge. Verify: `bun scripts/gen-api-types.ts apps/novel-forge-web --check`; web verify clean;
      no plugin-specific strings in production `src/`.

Stop after PG7. Stage 2 — writing knobs, `registerPrompts`, `invoke` ops with `host.jobs`, lifecycle events —
is a separate plan.

---

## 20. Success criteria

**Structural**

- A fresh clone with `plugins.dir` unset behaves exactly as today, byte-identically on the generate path.
- No production prompt or UI string in `apps/novel-forge-*` describes a genre, an imprint, or a content
  policy.
- A plugin-contributed section marked `permissive` cannot appear in a pack resolved as `standard`, and the
  test that proves it fails if the resolution order is changed.
- A plugin cannot enqueue generation, approve a draft, finalize a chapter, or write a domain table.

**Outcome**

- A new per-novel behaviour ships by dropping a directory on disk and enabling it on one novel — no core
  release, no fork, no migration.
- The worked example of §16 is buildable against the stage 1 contract with no host change.

**Guardrails**

- Generate latency and token count with no plugin enabled are unchanged from the pre-host baseline.
- With a plugin enabled, `project_plugins` is read once per workflow run, not once per model call.
- `llm_cache` hit rate on cacheable roles is unchanged for plugin-free projects.
