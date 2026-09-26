# Novel Forge

## Purpose

- AI-assisted authoring workbench for long-form serialized web novels. An author (a project has one owner; bot-owned projects are shared with the owning organisation) develops an idea into a story bible and plan, has AI draft each
  chapter, reviews it against canon, finalizes it into canon, and publishes it to the reader app `web-novel` (`docs/web-novel.md`).
- `novel-forge-server`: Bun/Fastify, Postgres + pgvector, LangGraph/LangChain. Every LLM call goes through OpenRouter; Ollama serves embeddings only.
- `novel-forge-web`: TanStack Start SSR workspace. Authenticates via Identity. Projects are owned by a person or an organisation bot, which reaches only routes that admit it.

## Concepts

- **Every project is the author's own novel** (`kind` is always `new_novel`). A finished manuscript arrives through novel import and lands as locked, human-authored
  chapters. `contentMode` (standard or unrestricted) selects the permissive writer-class baseline.
- **Decision ledger (the Notebook)**: the author's decisions, directions, rejected ideas and backlog, append-only. An entry is superseded (a successor on the same topic)
  or withdrawn (with the author's reason), never edited in place; only the active set is read. A decision's writer line reaches the chapter writer, scrubbed of hidden
  facts; rejected ideas and the alternatives a decision passed over are the do-not-propose list.
- **Volume and chapter brief.** A volume is a goal the story works towards (title, goal, notes, and a state: not started, active, goal met); it holds no chapter range
  and needs no approval. A brief is the plan for one chapter and names its volume; it carries context refs, an ending contract, an optional knowledge contract, a write
  mode (`standard` or `external`), and the chat-first plan: the agreed direction, scenes with their point of view, the milestones it claims, a content mode (null follows
  the project's) and whether it is the planned ending.
- **Milestone**: a stable story event (a rank reached, an event, a lesson learned from someone) that a plan claims and a finalized chapter reaches; fact unlock conditions name it.
- **Draft vs chapter.** A draft is working prose with a human review loop; finalizing writes a locked chapter and advances the story cursor.
- **Canon**: finalized chapters, bible (documents plus entities), trackers. Everything else is intent or working state, labeled as such in prompts.
- **Canon facts and character knowledge**: `canon_facts` hold spoiler-grade truths; the `character_knowledge` ledger records who learned which fact in which chapter.
- **Isolated chapter**: content firewalled from indexes, retrieval and continuity extraction (`isolated`), independent of provenance (`generator`).
- **Proposal** (`refinement_proposals`): a staged change-set of content and action ops; the only way chat, audit, tidy-up, premise and plugin output changes domain data (pipeline graphs write their own results directly).
- **Context pack**: the exact text a model saw, split into a stable (cacheable) and a volatile segment, with a manifest of what was included, cut or unresolved.
- **Review queue**: one inbox — drafts needing review or in contradiction, plus pending continuity and refinement proposals (chat, audit, premise and plugin change-sets). Approval is author-initiated and never auto-applied from a chat turn; the judge only advises.
- **Writing style**: the built-in plain web-novel style always reaches the writer, and a project's `instructions` are additions after it (point of view, tone, content limits)
  that win where the two conflict. The default is never trimmed to fit; additions give up their tail instead. A copy of the current or an earlier default inside stored
  instructions, verbatim or lightly edited, is dropped on read so the default never reaches the writer twice.

## Capabilities

- Bible building, audit and tidy-up (pattern-only: empty placeholders, slug titles, multi-entity pages, notes for the AI; applied as one revertible proposal), volume and chapter planning; chapter generation with judge and repair, revision, review, approval, finalize, amend, insert, unrestricted fill.
- Chat hub (manual or auto), change history with revert, illustrations, export (a `.novel` zip), validation, novel import, per-novel plugins, per-account AI quota.
- Publishing (scheduling, access control, reconcile, spoiler-gated wiki).

## Architecture

- Jobs and most HTTP requests run through `WorkflowRunService` (one run row, `thread_id = run.id`) -> LangGraph graph -> nodes -> services and chains via `ModelRouterService`;
  outline, revise and the standalone judge call the router directly. Checkpoints live in Postgres, pruned at boot after seven days. Jobs are Postgres rows; a duplicate
  (project, kind, target) request returns the active job.
- **One authoring job per project**, held in the database (`authoring_claims`), so it holds across replicas. Authoring jobs (generate, import, and the finalize/plan/organise
  kinds) reserve the claim in the transaction that enqueues them, and a second is refused (`JOB_002`) rather than queued; finalize, unrestricted fill and insert hold it for
  their synchronous run. The holder heartbeats; a claim silent past `jobs.authoring-claim.ttl-ms` (database clock, UTC) may be taken over, and a janitor re-dispatches
  authoring jobs left without a live claim, which is how a crashed worker's job recovers. Heartbeat, release and settle are conditioned on the holder's fencing token, but
  draft writes themselves are not: a job that lost its claim may still land the chapter in flight, then stops at the next chapter and never settles as done.
  Publish and reindex jobs take no claim.
- Model routing: roles map to author-selectable groups, overridable per project; an Unrestricted alternate map with an allowlist exists. A model type (standard or
  unrestricted) and a cost tier (economy, balanced, performant) select a platform model per group from `COST_TIER_DEFAULTS`; Balanced is the pre-tier map. A call resolves
  the project's pin for its role, then the owner's account default (Balanced only), then the tier map. Standard Performant equals Balanced
  for planning and chat, which already run on the strongest registered model. A chat reply takes its type and tier from the turn, then the chat,
  then the project, and a chat pin outranks the project's pick; the turn's selection is recorded in its run input. There is no local chat-model path (embeddings are local,
  via Ollama). AI quota is per owner and fails open on a database read error.
- Retrieval: pgvector indexes of finalized prose and lore, filtered by project; derived data, rebuildable. Realtime: SSE; a dropped client never aborts a chat turn.
- `novel-forge-web` navigation and guards derive from one screen list keyed by project kind. It never renders a containment badge from `generator` (it reads `isolated`; `generator` only drives a provenance chip). `novel-forge:admin` (role `NovelForgeAdmin`,
  never default or bot-grantable) gates run inspection. It is an RBAC permission evaluated per organisation, not a scope, so the web reads it from `GET /api/v1/access`, never the
  session; the `adminOnly` nav flag only hides the entry, and each admin route gates itself in `beforeLoad`. Bots reach almost every project route but cannot publish.

## Flows

- **Generation**: gates (a brief present and not stale, the chapter not final, every earlier chapter drafted or final, no unresolved contradiction elsewhere; a second generate request returns the active job) -> brief -> context pack -> draft ->
  deterministic check -> judge -> route. The judge has read-only tools over prose, lore, entities, summaries, world facts and plot threads (bible, volumes, briefs and drafts are
  chat-hub-only); a contradiction verdict must carry a hard finding, and deterministic checks block acceptance without hardening the verdict; unparseable judge output goes to
  human review, never acceptance. autoFix patches then rewrites up to a cap, then accepts as-is with findings kept. A failed run stops the batch; batches truncate at an
  unfilled `external` slot. A hand-written draft counts toward the next-chapter frontier exactly like a generated one, including in an `external` slot before it is final.
- **Readability** is decided by the judge alone, against the default style as amended by the project's additions. Deterministic measurements (sentence and paragraph length,
  reading grade, ornate constructions per 1,000 words, flagged sentences) reach it as evidence and are kept in the judge note, but never trigger repair themselves. A
  readability-only miss is repaired within the budget and otherwise accepted for normal review: it never marks a draft as a contradiction, halts a batch or blocks the next chapter.
- **Approval** is author-initiated and never auto-applied from chat, binds to the draft revision the author read (a chat approval card to the one current when it
  was staged), may override a contradiction (recorded: every blocking finding still open on the latest judge review of that text becomes an `overridden` remedy "approved
  by the author", and the response says how many), and in the same transaction replaces the chapter's ledger rows with the brief's `learns` as _provisional_
  knowledge bound to that revision, so repeated approvals leave one set, bound to the latest. Any change to the draft's prose, an open blocking review finding, or an
  earlier chapter's change resets it, and until the chapter is final that revokes the reveals it ledgered. A reveal several briefs declare is ledgered at the earliest approved or final
  chapter that claims it, and moves there when a later claim is revoked. A stale draft may be approved as written: the request names the stale reason the author saw,
  only that reason is cleared, the override is recorded, and nothing later goes stale since the prose is unchanged; a draft stale because a reveal in its plan no
  longer holds cannot be approved that way.
- **Chapter review**: judge, editorial, mechanics and readability reviews run on request against any chapter — generated, hand-written or final. The two model kinds run
  as a `review` job; the generation run stores its last judge pass as a review of the revision it produced. The author answers each finding: dismiss (with a reason), "I'll fix
  it myself", or override a blocking one; an answer can be withdrawn.
- **Finalize** runs strictly in order and commits only the approved draft revision it read; refuses when an earlier chapter needs re-validation or the latest validation
  report holds an error for this chapter. The same commit turns the chapter's provisional rows bound to that revision into _committed_ knowledge (dropping any bound to
  another), sets each revealed fact's `disclosedInChapter` unless an earlier chapter set it, and reaches the claimed milestones; a replay finds nothing left to do.
  A writer at chapter N reads what its POV cast learned before N — committed, or provisional from an approved earlier draft — plus N's own reveals, pooled for the
  whole chapter. Any change that revokes an approval (prose, what a plan teaches, reveal rule, deletion) marks every later draft stale; a plan edit that changes only
  the milestones a chapter claims resets that chapter's approval alone. The AI does not write a chapter while an earlier chapter whose plan teaches something is
  neither approved nor final (the author may still write it by hand; planning is not gated), and a batch ends at such a chapter. A chapter with no knowledge contract
  discloses the dated facts that first become showable there, never open canon. The proposed "the reader knows; <POV> does not" section is off unless `KNOWLEDGE_READER_KNOWS_LABEL` is set. The continuity delta goes
  through proposals (auto-applied; low-confidence entries stay pending; isolated chapters are skipped, not extracted).
- **Chat hub**: one conversation over the whole novel. Its context is the novel's durable state, not its text — the story (the ending, ending question and later
  volumes' goals labelled planner-only), the Notebook, open promises, inventories by name and key, and where the story stands. The first model round is budgeted as a
  whole request: the stable sections (plugin sections excepted, which always ride volatile) against a fixed allowance for history and message, so the cached
  prefix holds as a conversation grows, and the optional volatile ones against what is actually sent; the pack never drops below a 6k floor, the handoff is always
  kept, so a request near the history ceiling can run past the budget, and lookup rounds add on top. The author's own words render before, and outrank, any AI summary. Detail
  comes through declared lookups (never native tool binding); a turn that reads the author's notes is held for review like one that reads a planner-only page. Manual
  mode stages a proposal; auto applies it.
- **Regenerate from brief**: once a plan edit lands on a chapter's brief, the author regenerates that chapter through the normal generation job (judge, readability, writer
  scrubs, repairs) rather than having chat rewrite the prose. It keeps generate's gates — chapters in order, no contradiction elsewhere, no unfilled `external` slot at or before
  it, one generation job at a time, finalized chapters change only through amend — and replaces the prose in place. Whatever the draft held, however it was written, stays in
  the revision history; its continuity review is dropped and later drafts are marked stale only when the new draft lands, keeping any more specific stale reason they carry.
- **Plugins**: operator-loaded (off unless `plugins.dir` is set), per project, answering only five fixed decision points (canon augment, brief policy, call routing, context/prompt contribution).

## Publish boundary

- One way, forge -> `web-novel-server`, over an identity M2M token. Reader library and progress stay reader-side; accounts are Identity's.
- The forge owns the publication ledger, access control and slug; the reader holds a rebuildable projection keyed by the project id the forge sends as `sourceRef`, so renaming a slug
  moves the row. Converge order: novel, access, chapters, wiki.
- The ledger row is the outbox: failed pushes are retried, except stale, hash and slug conflicts, which wait for an explicit reconcile; `reconcile` diffs reader against ledger. Wiping the reader and reconverging MUST yield identical state.
- The wiki is derived, never authored on the reader: entities and canon facts are projected into facets gated by `visibleFromOrdinal`. Hidden entities, never-revealed facts and
  fragments of unpublished chapters are never sent.

## Hard rules

### Model, graph and context

- Every model call MUST go through `ModelRouterService`; nodes and services NEVER build model clients, chains NEVER persist, retrieval NEVER calls a chat LLM.
- Authoring calls (draft, revise, repair, builder, planners, outline) MUST have zero tools; write tools NEVER exist. Only verification (judge, validation) and chat-hub lookups use
  the read-only tool registry, and `projectId` NEVER appears in a tool input schema.
- Nothing user-visible MAY exist only in a checkpoint; domain tables win. Node effects MUST be idempotent. Graphs MUST run to a terminal state; NEVER pause one for human review.
- Raw model output MUST be persisted before parsing; structured calls use the repair ladder; domain-invalid output NEVER enters the database as canon.
- Context MUST be assembled once per run, token-budgeted, tier-labeled and persisted as a pack; graph state holds the pack id, NEVER canon text. The stable segment MUST stay
  byte-identical while canon is unchanged; chapter or source prose travels as a template variable, NEVER inside the pack.
- An outlined brief MUST plan enough scenes to fill the project's word target, because the drafter dramatizes and never invents. A span too thin for its chapter
  count is flagged on the brief (`densityRisk`) for the author to merge or enrich, NEVER padded at planning time; a hand edit clears the flag.
- The drafter MUST see only the mandatory serial core plus refs its brief declared; broad canon access belongs to the outliner (a catalog of citable refs, each with a short description) and the judge. Retrieval
  runs only at outline time, in verification and chat-hub tools, and in search.
- The writer's required material is reserved in its budget before anything else and NEVER silently dropped: the plan (brief, scenes, ending contract), the previous
  chapter's ending with the continuation state and the last three summaries, the sheets of the POV cast and of every character the plan cites, what the POV cast
  knows, open canon, the goal of the chapter's volume, a deterministic summary of each earlier volume built from its finalized chapter summaries, the style guide and
  the author's writer lines. Each has a limit. Material that grows with the book — story text, sheets, continuation state, open canon, known facts and behavioural
  constraints — is cut to it (the chapter's own cast first, then open canon, then the latest learned) and NEVER fails a chapter; the plan, its reveals and clues, the
  volume goal and the writer lines are not cut, and a call that writes or revises the chapter fails with a message naming the section and the overage when one is over
  its limit or the required material is over the budget. Readers of the pack (judge, review, previews) take it as it is. Optional material — cited pages first, then
  cast state, other entity sheets and plugin sections — fills what is left, and everything cut is recorded with its size in the stored pack's omitted list.
- Prompt text MUST live in versioned code and the version MUST bump on any wording change; every call logs `promptKey@promptVersion`. Plugin policy digest MUST be in any
  `llm_cache` key; only deterministic roles are cacheable, creative roles NEVER. `runId` MUST correlate runs, model calls, tool calls, packs and messages. Prefer deterministic
  code over AI wherever code can decide.
- A cost tier MUST change models, not reasoning effort (the gateway ignores per-request effort), and MUST never get cheaper from Economy to Performant. Every unrestricted
  tier entry MUST sit on the allowlist, and an unrestricted chat reply MUST go through the unrestricted route, refusing rather than falling back to standard.
- A chat turn's model type applies to its reply only; the actions it starts (write, review, audit, finalize — including their jobs and a later manual apply of its
  proposal) inherit its tier and NEVER its model type. A turn's selection NEVER outlives the turn; a chat's own defaults change only through its model PATCH.
  A standard turn NEVER receives replies or a summary the unrestricted model wrote (placeholders stand in), and chat compaction's model type only rises: it runs
  unrestricted when the novel, the chat, the turn, the prior summary or any folded reply is unrestricted.

### Canon, containment and knowledge

- Draft and isolated content MUST NEVER be indexed or retrieved; the finalize path, the manual continuity and extract-to-bible endpoints all
  skip isolated chapters. Containment MUST key on `isolated`, NEVER on `generator` or `contentMode`. A downstream chapter sees an isolated predecessor only as summary plus
  continuation state; finalizing an isolated draft requires both. An isolated draft's raw prose MUST reach only the unrestricted route: revising, judging or reviewing it routes
  there (refusing rather than falling back when that route resolves off the allowlist) and keeps it isolated, and the chat sees only its header and summary and cannot rewrite its body.
- A call whose writer class a plugin raised (or an unrestricted fill) MUST write `generator: unrestricted` and `isolated: true`; raising and isolating are one act, sticky for the run,
  so every later call in that run that reads its prose (judge, repair, title) stays on the unrestricted route.
- Finalized prose (`chapters.locked`) MUST NEVER change except through amend, which never unlocks, never touches the bible, rewrites the chapter's final draft to match under a new `amended` revision (the replaced prose stays in its history, the judge verdict is cleared), and republishes only when the reader-visible hash moves; the chapter PATCH/DELETE routes refuse a locked chapter.
  Proposals NEVER edit briefs at or before the story cursor or prose of a final draft.
- Generation context MUST NEVER contain an unrevealed canon fact. Spoilers live in `canon_facts`, NEVER in bible prose or entity sheets, and canon facts are NEVER indexed. The
  drafter sees only open canon, facts ledgered to the POV cast, this chapter's planned reveals and hidden facts' `writerNote` — never their text or author-only `constraintNote`,
  and a hidden fact without a `writerNote` is withheld entirely; only the judge sees the forbidden list. Open canon is a fact scheduled from the first chapter, a rule the whole
  book obeys rather than a truth anyone had to learn, so a brief's knowledge contract narrows what its POV cast privately knows and never withholds one; a reveal scheduled later
  stays gated on that cast's ledger even after its chapter has passed. Without a contract, visibility is the schedule alone. A chapter-scoped `fact:` ref obeys the same gate (plus
  the brief's `mustNotResolve`), and outliner-written `fact:` refs are stripped before a brief is stored. Two Story Bible addresses are reserved and planner-only, whoever
  writes to them: the organised timeline (`project/timeline`) and the open questions (`project/open-questions`) say what happens later in the book, and no scheduled canon
  fact backs them for the writer's scrub to withhold. They are left out of the outliner's citable catalog, and the lore index, never resolve
  into a writer pack whatever ref names them, and are dropped from outlined refs. The chat hub may read them, but only with review — the hub's inventory lists them
  by address alone, and a turn that looks one up never auto-applies: its proposal waits for the author with a warning that it may carry later-story material into what the chapter writer reads.
  Every string the chapter writer reads (generation, revision and repair) passes one disclosure policy for that chapter, loaded once per run: the locked facts' text,
  author note, key and give-away terms, the ending and ending question (until the chapter planned as the ending) and later volumes' goals and notes are withheld
  wherever they were copied — previous prose, summaries, continuation state, entity sheets, Bible pages, cited refs and their headings, style, writer lines, the brief,
  feedback, guidance and findings. The planner-only pages' lines are withheld only from what copies authored canon (pages, entity sheets, cited refs, plugin sections),
  because their opening lines are what the chapter's own plan says. It is lexical: it catches copies, not paraphrase, and a passage of one word, of two words
  under twelve characters, or under six characters in a script written without spaces, is caught only by give-away terms. For the writer a `volume:` ref resolves only to the chapter's own or an earlier volume, a `chapter:` ref only to an
  earlier chapter, a thread or mystery only once opened (one with no opening chapter, made by hand or imported, always), and the volume-plan and escalation-map pages never. A locked fact's allowed clues reach the writer
  unscrubbed, and a clue may not name its fact's give-away terms (checked when the clues or terms are written, so an older fact stays editable; one that
  still does is dropped from the writer's clues). A revision is told which locked terms the draft uses and is held as a contradiction if it keeps one.
  Planner and chat packs are not scrubbed.
  Reveals MUST be ledgered deterministically at draft approval, never extracted from model output.
- A fact's unlock condition is a conjunction (milestone reached, volume reached, chapter at least N, at the ending); every writer checks its shape, and only the reveal rule
  decides whether it holds. A fact's `plannedChapter` is provisional; `disclosedInChapter` is set only when the disclosing chapter is finalized, NEVER by planning. The project's
  `ending` is planner-only and MUST NEVER reach a writer pack before the chapter planned as the ending, nor a publish payload.
- **Reveal rule**: a plan for chapter N MAY learn a fact only when every requirement holds for that plan: its dated reveal chapter is at most N, and each unlock term
  holds, where a milestone counts as reached if a finalized chapter at or before N reached it or this plan or an earlier one claims it, and the ending term holds
  from the chapter planned as the ending on (an epilogue included). Milestones carry no order. An undated fact without a condition has no planned reveal, and no
  plan may reveal it. The rule runs on every plan write (hand edit, proposal apply, revert, chapter insert; the insert planner sanitises its own output first)
  against the plans as the whole write leaves them. A plan whose reveal stops holding because something it relied on changed is never silently rewritten: the plan
  and its unfinalized draft are marked stale, the draft's approval and the reveals it ledgered are revoked, and approval and finalize refuse that chapter until the
  plan is fixed; approval ledgers only the learns the rule allows. The writer pack mirrors the rule: a learn it would refuse reveals nothing, and a dated fact past
  its chapter stays hidden while its unlock does not hold. What a POV character already knows stays known whatever the condition.
- A plan at or behind the story cursor or the latest finalized chapter MUST NEVER change. Plan writes, fact writes that reconcile plans, and the finalization commit
  take the project row lock first, so a claim cannot move between a rule check and what it guards.
- A milestone's state is derived, never authored: `planned` at the earliest chapter whose plan claims it, `open` when none does, `reached` only in the finalization
  commit of the chapter whose plan claims it, bound to the committed revision. Rewriting or regenerating that chapter's prose keeps the claim; only a plan change
  moves it. A milestone is claimed by one plan at most and cannot be removed while a plan claims it or a fact's unlock names it. At most one plan is the ending.
- Insert MUST shift every chapter-number column via the explicit `SHIFT_TARGETS` list (an unlisted column is silently not shifted); it is legal only after the last written chapter
  (a draft after the insert point refuses it with `CHP_009`; plans after it shift) and only while it holds the authoring claim (`CHP_004` otherwise).
- Entity canon MUST exist as entity records, not cast narrated in a document. `staleReason` is a signal only, but a stale brief blocks generation and a stale draft cannot be approved.
- A chapter's volume is the one its brief names; an imported chapter keeps the volume its bundle placed it in. A new brief that names none, and an inserted chapter, join the volume of the nearest planned chapter before it (or, ahead of every
  planned chapter, after it). A volume a brief still names cannot be removed, so a change-set's volume removals (and a revert's) run after its other ops; a plan
  reset takes briefs out of the volumes it deletes.

### Chapter review

- A review is bound to the draft revision and the hash of the text it read; it is stale, and its findings describe older text, as soon as either moves. Staleness is computed on
  read, never stored. A remedy is refused on a stale review.
- A review NEVER edits prose; its only draft writes are the judge verdict and the gate below.
- The gate reads only the latest judge review of the current text: an open blocking finding holds the draft as a contradiction (which resets an approval and revokes its reveals)
  and blocks the next chapter. Dismissing or overriding releases the draft only to `needs_review`, never to approved; "I'll fix it myself" releases nothing. An answer to an
  older review gates nothing.
- Severity: a continuity contradiction and any leak of a secret (the deterministic give-away scan or the judge's own finding) are blocking. Plan and ending-contract shortfalls
  are warnings in a review, because a hand-writer may leave their plan on purpose — so a review whose open findings are only warnings lifts a contradiction the generation run set.
- A dismissal or override is remembered for the same text: a re-run carries it to the same finding and tells the model not to raise it again. The newest review that raised a
  finding decides, so a withdrawn answer stops carrying.
- A check the judge left out is never claimed: it is dropped from what was checked and reported as not assessed, so "No issue detected" cannot follow from an omission.
- Reviews of an isolated or unrestricted chapter are marked `isolated`: their findings quote prose a standard model must not read.

### Proposals and chat

- Chat, audit, premise and plugin output MUST NEVER write domain tables directly; only a proposal apply does, in a transaction with a baseline conflict check.
- Every apply MUST capture inverse ops; revert runs through the same engine under a content-hash conflict guard. NEVER add an apply path that skips inverse capture.
- `action.finalize`, `action.approve_draft` and `action.generate_chapter` MUST NEVER be auto-applied, and a chat action MUST NEVER replace an existing draft (regenerating one is
  the author's own request). Action ops run after the content transaction commits and stop at first failure.
- A chat turn MUST NEVER propose a whole-record overwrite for a record it did not fetch in the same turn; every turn is a fresh run, state lives in chat tables.
- Plan edits stay plan edits: a chat turn MUST NEVER rewrite a chapter's prose (`draft.update`, `draft.remove`, `action.revise_draft`) unless the author turned on Edit prose
  for that turn; otherwise it changes the brief and the author regenerates from it. The toggle is the only permission — wording may suggest turning it on, never grant it. A
  prose op without it costs the model one repair and is then withheld with a note, together with the judging, approval or finalize that depended on it.
- To remove something, an AI edit deletes it; it MUST NEVER write the absence ("no X", "without X", "X is not…") unless the author asked for that rule, because a named idea
  re-primes every later writer. Proposals carry a deterministic check for text a change removed and then mentioned only under a negation: a chat turn gets one retry, and what
  survives is kept as a visible warning and never auto-applied.
- Plugins MUST NEVER register routes, hold the database client, write domain tables, change a brief's volume, content mode, claimed milestones or ending flag, or issue
  `action.*` ops; durable changes are allowlisted proposals. Material a safe model would refuse stays in plugin storage and reaches only permissive-class calls via gated
  context, NEVER core artifacts. A failing plugin degrades its decision point and MUST NEVER fail a generation.

### Pipelines

- Generate stops at the first failed chapter.

### Publishing

- Content flows forge -> reader only. `publishedOrdinal` MUST be assigned once, NEVER re-derived from chapter numbers. Only locked, non-empty chapters publish, contiguously.
- Every push MUST be idempotent (`contentHash`). No forge internals or unrevealed facts in a payload; a chapter payload admits only `contentRating` (the novel payload adds blurb, cover, genres, tags, status,
  visibility and three rating dimensions), unrated is never sent as `none`, and a hash change MUST NOT move the digest of a chapter whose reader-visible content is unchanged.
- A novel-level rating MUST NEVER fall below the highest published-chapter rating per dimension (the forge refuses, never raises). Publishing is NEVER automatic on approval (an amend reschedules an already-published chapter).

## Non-goals

- No auth beyond Identity, local chat models, graph interrupts, reader-side editing, reader-account access, or amend retraction.

## Open work

- Bible audit does not flag spoiler prose outside `canon_facts`; nothing scans for it.
- Cancellation is process-local: a cancel reaches only the replica running the work.
- A brief's content mode is stored but not yet routed: chapter writing follows the project's content mode until per-chapter routing lands with its isolation read policy.
