# Novel Forge

## Purpose

- AI-assisted authoring workbench for long serialized web novels, built around one conversation. An author starts a novel from a title and optional notes, lands in a chat that
  designs the Story Bible with them, plans each chapter just before it is written, has AI draft it (or writes it by hand), reviews it, finalizes it into canon and publishes it to
  the reader app `web-novel` (`docs/web-novel.md`). A project has one owner; bot-owned projects are shared with the owning organisation.
- `novel-forge-server`: Bun/Fastify, Postgres + pgvector, LangGraph/LangChain. Every LLM call goes to an OpenRouter-compatible endpoint (OpenRouter or the host's AI CLI gateway);
  Ollama serves embeddings only.
- `novel-forge-web`: TanStack Start SSR workspace. Authenticates via Identity. The chat is every novel's home; Story Bible, Chapters, Review Queue, Illustrations, Publish, Usage
  and Settings sit beside it, from one screen list. A link to a retired screen opens the novel's home.

## Concepts

- **Every project is the author's own novel** (`kind` is always `new_novel`). A finished manuscript arrives through novel import as locked, human-authored final chapters.
- **The story** (premise, ending, ending question, theme, reader promise, protagonist, opposition) says where the book is going. The ending, the ending question and later
  volumes' goals are planner-only.
- **Volume**: a goal the story works towards (title, goal, notes, state: not started, active, goal met). It holds no chapter count or range and needs no approval; its range and
  word count are derived from the chapters that name it.
- **Chapter plan** (a brief): the plan for one chapter, written just before it — direction, scenes each with a point of view, how it ends, the milestones it claims, its content
  mode, the Story Bible pages the writer gets, a knowledge contract, whether it is the planned ending, and a write mode (`standard` or `external`).
- **Canon**: finalized chapters, the Story Bible (pages plus entity records), canon facts and trackers. Everything else is intent or working state, labelled as such in prompts.
- **Secret** (a canon fact): a truth the reader must not learn yet, held apart from Story Bible prose, with a writer note, optional allowed clues, give-away terms and an unlock
  condition. A fact keeps four states apart: world truth, planned reveal, reader disclosure (`disclosedInChapter`), and character knowledge (`character_knowledge`, provisional or
  committed).
- **Milestone**: a stable story event (a rank reached, an event, a lesson learned from someone) that a plan claims and a finalized chapter reaches; unlock conditions name it.
- **Promise**: a plot thread or mystery the reader is waiting for, with its opening, last advance, intended payoff (a chapter, a milestone, a volume or none) and status.
- **Notebook** (the decision ledger): the author's decisions, directions, turned-down ideas and backlog, append-only; also the home of the author's notes and the progress
  checklist under reserved topics.
- **Draft vs chapter**: a draft is working prose; finalizing writes a locked chapter and advances the story cursor.
- **Isolated chapter**: content walled off from indexes, retrieval, search and standard-route reads (`isolated`), independent of provenance (`generator`).
- **Proposal** (`refinement_proposals`): a staged change-set of content and action ops; the only way chat, organise, audit, tidy-up, premise and plugin output changes domain data
  (pipeline graphs write their own results directly).
- **Context pack**: the exact text a model saw, split into a stable (cacheable) and a volatile segment, with a manifest of what was included, cut or unresolved.
- **Writing style**: the built-in plain web-novel style always reaches the writer, and a project's `instructions` are additions after it that win where the two conflict. The
  default is never trimmed to fit; additions give up their tail instead. A copy of the current or an earlier default inside stored instructions is dropped on read.

## Architecture

- Jobs and most HTTP requests run through `WorkflowRunService` (one run row, `thread_id = run.id`) -> LangGraph graph -> nodes -> services and chains via `ModelRouterService`;
  planning, revise and the standalone judge call the router directly. Checkpoints live in Postgres, pruned at boot and daily: a settled run's after seven days, and a
  thread whose run row is gone on the next sweep. Jobs are Postgres rows; a duplicate (project, kind, target) request returns the active job.
- **One authoring job per project**, held in the database (`authoring_claims`), so it holds across replicas. Authoring jobs (generate, import, organise, plan, finalize kinds)
  reserve the claim in the transaction that enqueues them, and a second is refused (`JOB_002`) rather than queued; finalize, unrestricted fill and insert hold it for their
  synchronous run. The holder heartbeats; a claim silent past `jobs.authoring-claim.ttl-ms` (database clock, UTC) may be taken over, and a janitor re-dispatches authoring jobs
  left without a live claim. Heartbeat, release and settle are conditioned on the holder's fencing token, but draft writes are not: a job that lost its claim may still land the
  chapter in flight, then stops and never settles as done. Publish and reindex jobs take no claim.
- **Durable chat actions**: accepting an organise, plan or write card starts a job (one per accepted op) and never runs the work inline. A job started from a chat carries its
  origin (session, message, card, op) from the transaction that queues it. Organise and plan retry once on a transient model failure (timeout, rate limit, 5xx, lost connection
  after the router's own retries), never on a refusal the request caused, after a backoff kept under half the claim TTL; a cancel that lands first settles the job as cancelled. A
  retry never stages a second card: one card per run is enforced by a unique index.
- **Job events**: every transition of a chat-started job writes a `job_events` row in the same transaction, numbered by a per-session `seq` taken under the session row's lock, so
  `seq` follows commit order and a cursor never skips a late commit; a failed event insert never undoes the transition, and a transition is published only after it commits. The
  session's job stream (`GET …/chat/sessions/:sessionId/jobs/stream`, SSE id = `seq`) resumes after `Last-Event-ID` or `?after=`; with no cursor it replays the running jobs'
  events and how jobs settled in the last hour. A follower polls so a job another replica starts is still seen; events of jobs settled over a week ago are swept.
- **Model routing**: roles map to author-selectable groups, overridable per project; an unrestricted alternate map with an allowlist exists. A model type (standard or
  unrestricted) and a cost tier (economy, balanced, performant) select a platform model per group from `COST_TIER_DEFAULTS`. A call resolves the project's pin for its role, then
  the tier map; an unrestricted call takes the pin only when the unrestricted allowlist carries it. A chat reply takes its type and tier from the turn, then the chat, then the
  project, and a chat pin outranks the project's pick. There is no local chat-model path. There are no account-level model defaults: an author's only account setting is the
  default cost tier a new project starts on when its creation request names none (Balanced until set; a bot holds no settings and always gets Balanced), and a clone keeps its source's tier.
- **Usage and cost**: every model call records its tokens, its chapter when it has exactly one, and a cost frozen when written, with its source: `provider` (OpenRouter reported
  it), `gateway` (the CLI gateway reported it) or `estimate` (registry list prices). Every source is shown as the real charge. Runs link to their parent run, so a chat turn's
  figure includes its title and compaction calls; costs roll up per turn, chapter, run, job, project and account through one pricing path, so a legacy row is priced the same
  everywhere and a call is never counted twice. The AI quota is a rolling window per owner, enforced before dispatch for requests and jobs alike;
  projects with no owner share one window, and a read error refuses the call (fails closed).
- Retrieval: pgvector indexes of finalized, non-isolated prose and lore, filtered by project; derived data, rebuildable. Realtime: SSE; a dropped client never aborts a chat turn.
- The web never renders a containment badge from `generator` (it reads `isolated`; `generator` only drives a provenance chip). `novel-forge:admin` (role `NovelForgeAdmin`, never
  default or bot-grantable) gates run inspection; it is an RBAC permission evaluated per organisation, so the web reads it from `GET /api/v1/access`, never the session, and each
  admin route gates itself in `beforeLoad`. Bots reach almost every project route but cannot publish.

## The chat

- **One conversation over the whole novel.** Its context is the novel's durable state, not its text: the story (planner-only parts labelled), the progress map, the Notebook,
  inventories of Story Bible pages and entities by name and key, the chapter list, open promises, the last chapter's ending and the next chapter's plan, a compaction summary and
  recent messages. The stable sections get a fixed reservation so the cached prefix stays byte-identical across a session; the handoff is always kept, so a request near the
  history ceiling can run past the budget. The author's own words render before, and outrank, any AI summary.
- Detail comes through declared lookups (never native tool binding): Story Bible pages, entities, canon facts, threads and promises, chapter summaries, a plan, a draft, a
  character timeline, a volume, lore and prose search, the author's notes, usage and a chapter's reviews. A turn that reads the notes or a planner-only page holds for review
  every change the chapter writer or a reader can see; only planner-side records (milestones) still apply (see the write policy).
- **Start**: a new novel is a title (never blank; the web names an untitled one) plus notes of at most 10,000 words, created with its first chat in one transaction. The progress
  map ("Ready for chapter 1") is advice, never a gate; an item marked undecided or dismissed is recorded under a reserved Notebook topic that never reads as an author decision or
  a do-not-propose rule. An answer the author picks is written to the story field its question settles, which closes the item, and the chat moves on to the next one.
  Opposition is whatever pushes back — a person or faction, or the situation itself — and a story with no antagonist is a shape the chat supports, not a gap it fills.
- A turn streams its reply and, as each proposed change is written, that change's name and Story Bible group (never its body). Both are provisional and belong to the reply
  being written: a replaced reply (a retry, repair or lookup round) voids them, and only the settled turn says what was applied or carded.
- **A running turn is a chronological timeline** (reading, thinking, the reply, changes as they are written) whose live status is always its last line. The settled turn result is
  the authority: nothing claims "saved", applied or carded before it arrives, and a replaced or failed reply leaves no streamed change standing. Thinking time is measured, not
  shown: the gateway does not forward the model's reasoning, so there is no reasoning summary.
- **A settled reply keeps its turn's trace**: the sources it read, named by only the arguments their labels use (never what a lookup returned), and each step's time, so a
  reload shows the turn as its watcher saw it. A reply that streamed nothing has no write timings, and a reply older than the trace has none at all. The trace never enters a
  model prompt.
- **The mode is the author's choice in the composer**, and its label always names what the next turn will do: Edit freely (session `auto`, the default), Ask first (session
  `manual`) or Just discuss (this turn only; every op is a card, and the session's mode is untouched). Edit prose is a separate per-turn permission, never implied by a mode, and
  prose always arrives as a card. The chat model is told the session's mode, but it never decides what applies.
- **The changes panel** lists a turn's Story Bible changes (each applied value beside its quote, ideas flagged, each undone and redone on its own) and the sources it read;
  the turn's progress lives only on its last line in the thread. It opens by itself only when a turn leaves changes waiting for the author's OK, and otherwise only from the
  turn's receipt; closed, it stays closed on those changes. It docks beside the chat where the thread keeps its full column and otherwise opens as a sheet from the receipt,
  never by itself; the chat header is unchanged. Wherever the
  expanded app sidebar would leave it too little room, the sidebar folds to its icon rail on every screen, and the author's own toggle holds only until the window crosses
  that width again. Its undo refuses rather than cascades, as the write policy below requires. A turn's suggestions are answered there too, never as cards in the thread:
  the turn's one receipt carries Undo all for what it saved, Add all for what waits and why a hold kept it. An action, prose or a plan edit keeps its own card in the thread
  and is never added in bulk.
- **One message may be queued while a turn runs**, and it is sent only after this tab's own turn settles cleanly. A failed or stopped reply, a turn started in another tab or a
  locked chat holds it for the author, who can edit it or send it now. A message released on its own keeps the settings it was queued with.
- A chat turn MUST NEVER propose a whole-record overwrite for a record it did not fetch in the same turn; every turn is a fresh run, and state lives in chat tables.
- A chat turn's model type applies to its reply only; the actions it starts inherit its tier and NEVER its model type. A turn's selection NEVER outlives the turn. A standard turn
  NEVER receives replies or a summary an unrestricted model wrote (placeholders stand in; the author's own messages stay verbatim), and compaction's model type only rises: it
  runs unrestricted when the novel, the chat, the turn, the prior summary or any folded reply is unrestricted.

### Write policy and the quote rule

- A session is Edit freely (`auto`, the default for new chats) or Ask first (`manual`, every op a card). The server decides what applies, never the model: a model-declared
  quote or origin never authorises a write on its own.
- Under Edit freely, with Just discuss off and no hold covering it, every op no always-card rule holds applies within the turn and can be undone, including what
  the AI invents. Each applied op carries its source: `quoted` when its kind is allowlisted (Story Bible page, entity, fact, volume title or goal, an empty story field, a
  promise's label) and its `quote` supports it, `idea` otherwise, so the author sees which changes are the AI's and can undo them. Only a chat turn applies ideas, and only of
  the kinds classified as idea-eligible (Story Bible page, entity, volume title, an empty story field, milestone, a promise or its label); an idea that truncates a filled field
  beyond the removal budget stays a card. Secrets and planner-only content stay cards even under Edit freely: an unbacked fact, new or existing, and an invented volume goal
  are never ideas. A turn that drew on the notes or a planner-only page holds every op the chapter writer or a reader can see — the premise, story brief and themes
  reach readers as the published description, tags and illustration prompts, so they are held with the style guide, and the other story fields travel in the same op and are
  held with them; only planner-side records (milestones) apply as usual, unless
  one leans on a held op. Just discuss, Ask first or any other warning on the turn makes every op a card.
- Always cards, whatever the mode or quote: removals and cleared fields, including a `someday` that empties a payoff target; plans; prose; actions; planner-only and
  writer-excluded pages; replacing a filled story field; a secret's truth once it exists and its gating (writer note, clues, unlock, reveal chapter, give-away terms) at any
  time; a volume's order and notes; a promise's disposition (status, payoff target, dormant), progress or reuse of a settled one. The apply engine refuses an always-card kind
  in an automatic apply, whatever the split decided.
- A quote supports an op when at least three content words (character bigrams in scripts written without spaces) are found verbatim, whitespace-, case- and typography-normalised,
  in the author's message of that turn, in a sentence stated rather than asked, hedged, negated before the quote or turned down after it; no word the op writes comes only from a
  sentence the author asked or hedged; no field drops more than max(4, 25%) of the content words it held; and the whole op adds at most max(4, 25%) content words that are neither
  in the author's stated sentences nor already in the record. A new record's identifying key counts as written content. An op naming a record only a card creates follows it to
  the cards; an idea that does keeps its quote-rule reason, so a turned-down idea is still filtered. An idea the author turned down in scope is dropped unless an op the
  author's own words back leans on it; if the turned-down ideas cannot be read, every idea stays a card.
- The checks are lexical: a stated goal rewritten as an outcome in the same words passes them, so the changes panel's change list shows each written value beside its quote
  and undo stays one click away. Applied ops form one revertible proposal (`chat_messages.applied_proposal_id`, linked when it commits), applied before the cards, which form a
  second, pending one; a failed apply turns every op back into cards. AI-staged chain proposals (audit, premise) always wait.
- Undo lists what relies on the change first — everything that names a record it created; for an updated record, unfinalized plans and drafts, knowledge about a changed fact and
  pending suggestions, with finalized plans and drafts only counted — and never rewrites finalized history.
- Each change a turn applied, with its source, is undone and redone on its own, only for a chat turn's applied proposal. Undo runs that change's own inverse under the whole
  revert's conflict guard, and is refused (`RFN_018`) unless its records come back exactly as the apply found them — a field the change filled comes back empty. The
  proposal stays applied with the change marked `reverted`, and whole revert then undoes only what is still applied. Undo and redo are idempotent and never touch another
  proposal.
- A change another applied change of the same turn relies on — one naming a record it created or needing its entity type, or a later change to the same record — is refused
  (`RFN_015`) with those changes listed, never undone with them: the author takes back only what they chose. Redo mirrors it (`RFN_016`), so each record's changes stay a
  stack. Redo needs the rest of the turn applied and the records exactly as the undo left them.
- Undoing an idea turns it down in the Notebook as declining its card does (default `not_now`); redoing it withdraws that rejection. Either commits with the change or not
  at all, and a call that moves nothing writes nothing. Undoing the author's own words records nothing.
- `action.finalize`, `action.approve_draft` and `action.generate_chapter` MUST NEVER be auto-applied, and a chat action MUST NEVER replace an existing draft. Action ops run after
  the content transaction commits and stop at first failure.
- Plan edits stay plan edits: a chat turn MUST NEVER rewrite prose (`draft.update`, `draft.remove`, `action.revise_draft`) unless the author turned on Edit prose for that turn;
  the toggle is the only permission, and only the latest non-final draft may be revised. A prose op without it costs the model one repair and is then withheld with a note,
  together with the judging, approval or finalize that depended on it.
- To remove something, an AI edit deletes it; it MUST NEVER write the absence ("no X", "without X") unless the author asked for that rule, because a named idea re-primes every
  later writer. A deterministic check catches text a change removed and then mentioned under a negation: a chat turn gets one retry, and what survives is a visible warning, never
  auto-applied.

### Suggestions, idea ids and rejection scopes

- Every content op carries a server-assigned idea id: a hash of its kind and declared fields with text normalised as quotes are, metadata left out, so the same change proposed
  twice has the same id and a reworded one is a new idea. Actions carry none.
- Turning down a card op records a Notebook rejection keyed by its idea with a scope: `never` (until the author withdraws it), `not_now` (while the volume active when it was
  recorded stays active) or `not_this_version` (while every record the idea would change is exactly as it was). Rejecting the same idea again replaces the earlier scope.
- The chat's decline on a suggestion card goes through that route with the author's scope. Declining an action suggestion ("Don't run it") records nothing, since an action
  offers no idea. A finalize the chat cannot run points the author to the chapter's finalize review.
- A model-authored op — a card, or an idea Edit freely would apply — whose idea is rejected in scope is dropped before staging, with every op that cannot stand without it. An
  op the author's own words back (quoted, just discuss, manual mode, held for review, depending on another card) is never filtered, nor is anything it leans on. Lapsed
  rejections stop steering the model; similar ideas are avoided only best-effort.
- A rejection's label names the record only: a secret's truth, its tells and a planner-only page's body never appear in it, so it can ride in any prompt.

### Notebook and notes

- Entries are append-only: superseded by a successor on the same topic or withdrawn with a reason, never edited in place; only the active set is read. An author rewords a
  decision or overrules a system entry into one; they never write a decision from nothing. The active ledger is required context and never evicted to fit a budget.
- A decision's writer line reaches the chapter writer, scrubbed by the chapter's disclosure policy; rejected ideas and the alternatives a decision passed over reach models only
  as things never to offer again.
- The author's notes are stored whole under a reserved topic, read and written only through the notes store (one lock, one 10,000-word cap on every path). An author message of
  600 words or more that the notes do not hold, and could take within the cap, is offered as notes; saving appends it as paragraphs of its own. Reserved topics (notes, progress,
  idea rejections) are never written by the generic ledger routes.

### Organise

- Organising the notes is a chat action that runs as a job. Its output follows the quote rule with the notes standing in for the author's message: an entry applies at once "from
  your notes" only when its quote is found in the notes, stated, and it adds little the paragraphs it cites do not say; in an auto-mode chat those entries apply as one revertible
  proposal. Everything else — no quote, a quote not found or hedged, inferred sections, the model's own suggestions, what relies on a suggestion, the planner-only timeline and
  open questions, removals of what an earlier run wrote, and the notes' rules — waits on one card, even under Edit freely: the card is where the author adopts a
  suggestion. A page mixing both is offered as its notes-backed sections, then the whole page; a card keeping both halves is refused (`NTS_007`). A rule becomes a Notebook
  direction only when the author keeps it.
- Each organise proposal carries its own record (`organise_record`) and records the organise decision from the writes actually applied, so the next run rewrites what organising
  still owns in place. A write the author declined leaves the earlier claim at its ref. A rule or suggestion an earlier answer kept is taken out only when a later round offers it
  again and the author declines it. If the card fails to save after the notes-backed part applied, the whole stage rolls back and the job retries.
- Undoing an organise proposal puts the ledger back as that apply found it, leaving no "kept, then undone" trail in the Notebook; a row the author has since withdrawn or reworded
  stays theirs. Undo is refused (`NTS_010`) while a later organise change builds on a row it wrote. A card without its record is refused (`NTS_009`). Starting organise is refused
  (`NTS_004`) while an organise card is pending or a card staged before records existed stays applied; a round that stages while another card still waits supersedes it.
- Every entry cites the notes paragraphs it draws on; the receipt lists the paragraphs nothing draws on as "not used yet", with the notes digest they refer to. Notes longer than
  one pass's word limit are organised in several passes, each told what the passes before it wrote. On an unrestricted project, what the model inferred or suggested is held to
  the hard line before it reaches a card.

### Plan cards

- Only the next writable chapter is planned: the lowest with neither a draft nor finalized prose, one rule shared with generation, hand writing and chat ops. Planning always
  produces a card, never a direct write.
- A plan starts from a direction the chat offered, from what the author says happens (which must be found in their own message, or it becomes a direction), or empty for the
  author to fill; an empty plan is refused over an existing one. The recap surfaces two or three obligations: the previous chapter's hook, the most pressing promise, and what the
  volume goal needs.
- The planner (the `outline` role) proposes milestone claims; the reveal rule cuts every claim the plan may not make and every reveal whose unlock does not hold, from the
  contract and from every text field, so a card never proposes what the author could not apply. A scene's point of view must be a character of the novel. The writer's knowledge
  is pooled over the scenes' points of view for the whole chapter, and the card warns when they differ in what they know.
- A plan never carries a content mode from the planner: the chapter keeps its own, or starts from the project's when the plan is created, until the author changes it on the card.
  A replan sets every field explicitly, so nothing of the replaced plan survives. The body the writer reads is rendered from the scenes at apply.
- The card shows typed diagnostics and a preview of what the writer would read; it names a secret by its title, never its truth. Scene density is diagnostic: a span too thin for
  the word target is flagged (`densityRisk`), never padded, and a hand edit clears the flag.

## Story model

### Secrets and disclosure

- Generation context MUST NEVER contain an unrevealed canon fact. Spoilers live in `canon_facts`, NEVER in Story Bible prose or entity sheets, and canon facts are NEVER indexed.
  The drafter sees only open canon, facts ledgered to the POV cast, this chapter's planned reveals and hidden facts' `writerNote` — never their text or author-only
  `constraintNote`; a hidden fact without a `writerNote` is withheld entirely. Only the judge sees the forbidden list.
- Open canon is a fact scheduled from the first chapter, a rule the whole book obeys; a knowledge contract narrows what the POV cast privately knows and never withholds one. A
  reveal scheduled later stays gated on that cast's ledger even after its chapter has passed. Without a contract, visibility is the schedule alone.
- A locked fact's allowed clues reach the writer unscrubbed, and a clue may not name its fact's give-away terms (checked when the clues or terms are written; an older clue that
  still does is dropped from the writer's clues).
- **Disclosure policy**: every string the chapter writer reads (generation, revision, repair, passage rewrite) passes one policy for that chapter, loaded once per run: locked
  facts' text, author note, key and give-away terms, the ending and ending question (until the chapter planned as the ending) and later volumes' goals and notes are withheld
  wherever copied — previous prose, summaries, continuation state, entity sheets, pages, cited refs, style, writer lines, the plan, feedback and findings. It is lexical: it
  catches copies, not paraphrase, and a passage of one word, of two words under twelve characters, or under six characters in a script without spaces is caught only by give-away
  terms. A revision is told which locked terms the draft uses and is held as a contradiction if it keeps one. Planner and chat packs are not scrubbed.
- Plugin system messages reach the writer beside the pack rather than in it, and pass the same scrub at every writer call.
- Reader-facing art (a cover, a chapter's subject, an entity drawn as of a chapter) reads under the art disclosure policy of the chapter it is drawn as of — the latest final
  chapter for a cover — which is that chapter's writer policy with the ending and the ending question always withheld. Reference labels, notes and names and the vision
  description are scrubbed before both the compose call and the image call; the author's own per-image instructions are not, by the author's choice.
- Planner-only pages — the organised timeline (`project/timeline`) and open questions (`project/open-questions`) — are left out of the planner's citable catalog and the lore
  index, never resolve into a writer pack whatever ref names them, and are dropped from planned refs. Their lines are withheld only from what copies authored canon (pages, entity
  sheets, cited refs, plugin sections), because the chapter's own plan legitimately repeats them.
- For the writer, a `volume:` ref resolves only to the chapter's own or an earlier volume, a `chapter:` ref only to an earlier chapter, a thread or mystery only once opened (one
  with no opening chapter always), and the volume-plan and escalation-map pages never. A chapter-scoped `fact:` ref obeys the fact gate plus the plan's `mustNotResolve`, and
  planner-written `fact:` refs are stripped before a plan is stored.
- The project's `ending` is planner-only and MUST NEVER reach a writer pack before the chapter planned as the ending, nor a publish payload. At most one plan is the ending.

### Reveal rule and milestones

- A fact's unlock condition is a conjunction (milestone reached, volume reached, chapter at least N, at the ending); every writer checks its shape, and only the reveal rule
  decides whether it holds. Milestones carry no order.
- **Reveal rule**: a plan for chapter N MAY reveal a fact only when its dated reveal chapter is at most N and each unlock term holds, where a milestone counts as reached if a
  finalized chapter at or before N reached it or this plan or an earlier one claims it, and the ending term holds from the chapter planned as the ending on. A fact with neither a
  reveal chapter nor an unlock condition may not be revealed by any plan. The rule runs on every plan write (hand edit, proposal apply, revert, insert) against the plans as the
  whole write leaves them. The writer pack mirrors it: a learn it would refuse reveals nothing.
- A plan whose reveal stops holding because something it relied on changed is never silently rewritten: the plan and its unfinalized draft are marked stale, the draft's approval
  and the reveals it ledgered are revoked, and approval and finalize refuse that chapter until the plan is fixed.
- A milestone's state is derived, never authored: `planned` at the earliest chapter whose plan claims it, `open` when none does, `reached` only in the finalization commit of the
  claiming chapter. Rewriting or regenerating that chapter's prose keeps the claim; only a plan change moves it. A milestone is claimed by one plan at most and cannot be removed
  while a plan claims it or an unlock names it.
- A plan at or behind the story cursor or the latest finalized chapter MUST NEVER change. Plan writes, fact writes that reconcile plans and the finalization commit take the
  project plan lock first, so a claim cannot move between a rule check and what it guards.

### Knowledge lifecycle

- Reveals MUST be ledgered deterministically at draft approval, never extracted from model output. Approval replaces the chapter's ledger rows with the plan's `learns` as
  provisional knowledge bound to that revision; finalize commits the rows bound to the committed revision, drops any bound to another, sets `disclosedInChapter` unless an earlier
  chapter set it, and reaches the claimed milestones. `plannedChapter` is provisional; `disclosedInChapter` is NEVER set by planning.
- A reveal several plans declare is ledgered at the earliest approved or final chapter that claims it, and moves when a later claim is revoked. What a POV character already knows
  stays known whatever the condition.
- A writer at chapter N reads what its POV cast learned before N — committed, or provisional from an approved earlier draft — plus N's own reveals, pooled for the whole chapter.
  The AI does not write a chapter while an earlier chapter whose plan teaches something is neither approved nor final (hand writing and planning are not gated). The "the reader
  knows; <POV> does not" section is off unless `KNOWLEDGE_READER_KNOWS_LABEL` is set.
- Each character keeps a per-chapter event history ("how they changed"), written from what a chapter's finalize review kept.

### Promises

- A promise is built on the thread and mystery records. Its standing is derived, never stored, by one function shared by the plan recap and the promises list: overdue once an
  authored payoff chapter has passed or its payoff volume has met its goal; due once its payoff milestone is reached or its payoff volume is the active one; otherwise not due. A
  promise dormant on purpose is never an obligation; "quiet for a long time" is a reminder, not an error.
- The promises list can be ordered by standing (`sort=due`: overdue, then due, then not due).
- Continuity never overwrites a disposition the author set (dormant, dropped), and a chat op that changes a promise's status or progress is always a card. A promise never carries
  a mystery's truth or its key.

### Volumes

- A chapter's volume is the one its plan names; an imported chapter keeps the volume its bundle placed it in. A new plan that names none, and an inserted chapter, join the volume
  of the nearest planned chapter before it (or, ahead of every planned chapter, after it). A volume a plan still names cannot be removed (`VOL_002`), so a change-set's volume
  removals run after its other ops.
- State is server-owned. After any volume insert, if none is active, the lowest-ordinal not-started volume after every goal-met one becomes active, under the project lock. "Goal
  met — start the next" is the author's click, never automatic: it completes only the currently active volume (two concurrent clicks complete one) and activates the next
  not-started volume, or none.

## Chapter lifecycle

- Statuses run planned -> drafted (ready to read) -> approved (bound to a revision) -> final (locked). Only the next writable chapter can be planned, written or started by hand.
- **Generation** gates: a plan present and not stale, the chapter not final, every earlier chapter drafted or final, no unresolved contradiction elsewhere, the authoring claim; a
  second request returns the active job. Then plan -> context pack -> draft -> deterministic check -> judge -> route. The judge's contradiction verdict must carry a hard finding;
  deterministic checks block acceptance without hardening the verdict; unparseable judge output goes to human review, never acceptance. Repair patches then rewrites up to a cap,
  then accepts with findings kept. A failed run stops the batch; batches truncate at an unfilled `external` slot. The last judge pass is stored as a review of the revision it
  produced.
- **Readability** is decided by the judge alone, against the default style as amended by the project's additions. Deterministic measurements reach it as evidence and never
  trigger repair themselves; a readability-only miss never marks a contradiction, halts a batch or blocks the next chapter.
- **Regenerate from plan**: after a plan edit, the author regenerates through the normal generation job with generate's gates, replacing the prose in place. Whatever the draft
  held stays in its revision history; later drafts are marked stale only when the new draft lands.
- **Writing by hand**: "Write it myself" asks the server to start the next writable chapter and never while a generate job targets it; an existing draft stays editable wherever
  it sits. A save names the draft, revision and save sequence it read (all three or none) and is refused (`DRF_013`, answered with the draft as it stands) once another write
  moved on. No hand save lands while the AI is writing the chapter. An autosave folds into the revision it continues only while that revision is the author's own hand edit, under
  ten minutes old, never approved, reviewed or stale; the cascade (later drafts stale, reveals revoked) runs on every save. A plan is optional for a hand-written chapter.
- Finalized prose (`chapters.locked`) MUST NEVER change except through amend. Every write to draft or chapter prose — generation, revision, chat apply, import, restore, passage
  apply, job replay — carries a predicate on non-final status, so a delayed model call cannot overwrite a finalized draft. Proposals NEVER edit plans at or before the story
  cursor or prose of a final draft.
- Prose is stored with LF line endings on every write path, so a body's line count and every hash taken over it are platform-independent. A scheduled or failed publication
  whose ledgered hash predates that normalisation is repaired once at boot, and only when its chapter has not been edited since.
- A draft carries one stale reason — the earliest ancestor change, which replaces a reveal mark so fixing the plan cannot hide it. Any change that revokes an approval (prose,
  what a plan teaches, reveal rule, deletion) marks every later draft stale; a plan edit that changes only a chapter's claimed milestones resets that chapter's approval alone.
- **Approve** is the author's act, never auto-applied from chat, and binds to the draft id, revision and save sequence the author read (a chat approval card to the one current
  when staged). It may override open blocking findings, only with the author's confirmation: each becomes an `overridden` remedy "approved by the author". A stale draft may be
  approved as written: the request names the stale reason the author saw, only that reason is cleared, the override is recorded, and nothing later goes stale; a draft stale
  because a reveal in its plan no longer holds cannot be approved that way. Any prose change, an open blocking finding or an earlier chapter's change resets approval and, until
  final, revokes its reveals. `approvedRevision` keeps the last approved revision through later edits and finalize.
- **Checks** (chapter reviews): judge, editorial, mechanics and readability reviews run on request against any chapter; the two model kinds run as a `review` job. A review is
  bound to the revision and text hash it read and is stale as soon as either moves (computed on read); a remedy is refused on a stale review. A review never edits prose. The gate
  reads only the latest judge review of the current text: an open blocking finding holds the draft as a contradiction and blocks the next chapter; dismissing or overriding
  releases it only to `needs_review`; "I'll fix it myself" releases nothing. A continuity contradiction and any leak of a secret are blocking; plan and ending-contract shortfalls
  are warnings, because a hand-writer may leave their plan on purpose. A dismissal is remembered for the same text. A check the judge left out is reported as not assessed, so "No
  issue detected" cannot follow from an omission. Reviews of an isolated chapter are marked `isolated`.
- **Review before finalize**: approval binds a finalize review to the exact revision, prose and plan approved, and a job reads the Story Bible updates out of that revision.
  Consequential updates (rules, payoffs, knowledge, milestones in doubt, anything inferred) are answered one by one; routine ones as a batch, or kept automatically per category
  when the author opted in. Keep, edit (the record it is about never changes) or skip (with a reason, never asked again). Re-approving the same revision, prose and plan keeps the
  answers; anything else sends the review back to be prepared, carrying answers over only onto the same proposed change.
- **Finalize** runs strictly in order and commits only the approved revision it read; it refuses when an earlier chapter needs re-validation, the latest validation report holds
  an error for this chapter, the draft is stale, a blocking finding is open, the review no longer matches the prose (`FRV_004`), is still reading or failed, has unanswered items
  (`FRV_005`), or leaves a claimed milestone unreached while the plan reveals something that needs it (`FRV_006`). Readiness answers from the same checks. The commit applies only
  the kept items, recording each row's before and after, drops claims the review says the prose did not reach, and commits knowledge; a replay finds nothing left to do. A chapter
  approved before reviews existed finalizes on the direct continuity path.
- **Revert** of a finalize review puts back every row its kept set changed as one unit, only for the latest final chapter, refusing when any of those rows changed since
  (`FRV_007`) or when it would un-reach a milestone one of the chapter's reveals depends on (`FRV_013`); otherwise it drops the milestones it reached and marks later
  drafts stale. Proposal apply and revert are separate: every apply captures inverse ops, and revert runs through
  the same engine under a content-hash conflict guard.
- **Amend** never unlocks and never touches the Story Bible; it rewrites the final draft to match under a new `amended` revision (the replaced prose stays in history, the judge
  verdict is cleared) and republishes only when the reader-visible hash moves. The chapter PATCH/DELETE routes refuse a locked chapter.
- **Insert** MUST shift every chapter-number column via the explicit `SHIFT_TARGETS` list (an unlisted column is silently not shifted); it is legal only after the last written
  chapter (`CHP_009`) and only while it holds the authoring claim (`CHP_004`). The insert planner sanitises its own output against the reveal rule.

### Passage rewrite and versions

- "Ask for changes" on a selection runs on the chapter's writer route (revise role, disclosure policy, a writer snapshot as a `passage` attempt) and stores a suggestion anchored
  to the draft id, revision, save sequence, UTF-16 offsets, a SHA-256 of the selected text and up to 32 characters either side, with the containment it ran under; nothing touches
  the draft until it is applied.
- The passage is fresh where its offsets still hold that text between that context, and relocated only when text and context together occur exactly once elsewhere; anything else
  — an edit in or around it, an ambiguous copy — is stale and refused (`PSG_004`).
- Applying and restoring decide under the draft's row lock and write through the hand-save path as a new revision (`passage_rewritten`, `restored`), so they never fold into an
  autosave, never rewrite history, and reset approval and mark later drafts stale as an edit does. Restoring the approved revision needs approving again; restoring text the draft
  already holds changes nothing. A final chapter refuses both (`PSG_006`, `VER_002`).
- An applied rewrite keeps the unrestricted containment it was written under, and one that brings in a locked secret the passage did not already give away is held as a
  contradiction, judged by the disclosure policy at apply time.
- History is bounded to a draft's newest 50 revisions plus the approved one; each draft keeps its newest 20 suggestions.

### Writer's context and snapshots

- The drafter MUST see only the mandatory serial core plus refs its plan declared; broad canon access belongs to the planner (a catalog of citable refs) and the judge. Retrieval
  runs only at planning time, in verification, chat lookups and search.
- The writer's required material is reserved first and NEVER silently dropped: the plan (scenes, ending contract), the previous chapter's ending with the continuation state and
  the last three summaries, the sheets of the POV cast and of the characters the plan cites (the first few required, the rest optional), what the POV cast knows, open canon, the
  volume goal, a deterministic summary of each earlier volume, the style guide and the author's writer lines. Material that grows with the book is cut to its limit (the chapter's
  own cast first, then open canon, then the latest learned) and recorded in the pack's omitted list, NEVER failing a chapter; the plan, its reveals and clues, the volume goal and
  the writer lines are not cut, and a call that writes or revises fails with a message naming the section when one is over. Readers of the pack (judge, review, previews) take it
  as it is. Optional material (cited pages, cast state, other sheets, plugin sections) fills what is left.
- Every writer attempt (draft, repair, rewrite, revision, passage) stores a snapshot: the exact messages sent, what was kept back and why, the plan revision, the Story Bible
  hash, the prompt version and the model route. The Writer's view reads the snapshot, never regenerates it from today's state, and walls off the messages of an attempt that was
  isolated or whose chapter is isolated now. A snapshot write never fails the generation it captures; attempts are kept for the current revision and the two before it.

## Content modes and isolation

- A chapter's content mode is its plan's, copied from the project's when the plan is created (a plan with none routes standard; an isolated draft counts as unrestricted), so
  changing the project's mode never re-routes an existing chapter. It MUST route every call on that chapter's prose — draft, title, judge, repair, revise, review, summary,
  continuity, extraction — through the one role table in `chapter-route.ts`. An unrestricted chapter runs the normal writer -> judge -> repair graph on the unrestricted route, is
  written isolated, and NEVER falls back to a standard model: an off-allowlist resolution refuses (`AI_003`).
- Containment MUST key on `isolated`, NEVER on `generator` or `contentMode`. A call whose writer class a plugin raised (or an unrestricted fill) writes `generator: unrestricted`
  and `isolated: true`, sticky for the run. Draft and isolated content MUST NEVER be indexed, retrieved or searched.
- **Read policy**: raw isolated prose is readable only by the author, the unrestricted route and the Amend editor. Author HTTP routes (the draft, its versions and compare,
  passage suggestions) read it raw; every model-bound, chat, plugin, publish and search read goes through `isolation-read-policy.ts` and sees only what the author approved in the
  bridge — never prose, free-text state, judge notes or review evidence, on any route. Every revision records whether it was isolated, and restoring one keeps the draft isolated.
- **Bridge**: what a standard call may know about an isolated chapter is only the items its author approved against its current revision — a short non-graphic summary and
  positions of roster characters (places of at most 60 characters) — never lines that cross the hard line. The summary is always asked, and positions one by one. Editing the
  chapter invalidates the bridge until a new one is answered; undoing the chapter's Story Bible updates leaves the approved bridge standing, and a bridge is read again after an
  amend.
- Continuity and canon extraction of an isolated chapter run on the unrestricted route, told to describe non-graphically, with every quoted excerpt withheld and `sourceIsolated`
  stamped; the result is staged for the author, never applied by finalize.
- **Hard line**: every unrestricted call passes a deterministic screen (`hard-line.ts`) before it is sent and its output before it is kept. Author- and plan-supplied text and
  what creative roles wrote are held to the full rule; background context and derived roles' output to a narrow list. A refusal is `AI_015` naming the record, never quoting it;
  no model is called and nothing is saved; a streamed reply is released a screened sentence at a time. Every unrestricted request also carries a system line forbidding such
  content. Standard calls are not screened.

## Story Bible audit

- Two passes stored as one report — coverage against the manifest and a contradiction check of pages, entity records, canon facts and the summaries of finalized, non-isolated
  chapters — always run as an `audit` job. A report claims only what was read; isolated chapters are never read, not even their summaries.
- Evidence cites only a source the audit read, and a quote only when three or more of its words are found there; a contradiction with no such quote is dropped, and one that does
  not quote both sides is reported without a card.
- The audit reads secrets but never stages a fix that adds a secret where the chapter writer reads it, nor one that changes a secret's reveal, unlock or give-away terms. Material
  and baseline are read in one repeatable-read snapshot. The server enforces Keep and Skip: applying applies only what was kept, and a card with nothing kept is refused.

## Proposals and pipelines

- Chat, organise, audit, premise and plugin output MUST NEVER write domain tables directly; only a proposal apply does, in a transaction with a baseline conflict check. Every
  apply MUST capture inverse ops; NEVER add an apply path that skips inverse capture.
- Every model call MUST go through `ModelRouterService`; nodes and services NEVER build model clients, chains NEVER persist, retrieval NEVER calls a chat LLM.
- Authoring calls (draft, revise, repair, planners, bible builder) MUST have zero tools; write tools NEVER exist. Only verification (judge, validation) and chat lookups use the
  read-only tool registry, and `projectId` NEVER appears in a tool input schema.
- Nothing user-visible MAY exist only in a checkpoint; domain tables win. Node effects MUST be idempotent. Graphs MUST run to a terminal state; NEVER pause one for human review.
- Raw model output MUST be persisted before parsing; structured calls use the repair ladder; domain-invalid output NEVER enters the database as canon.
- Context MUST be assembled once per run, token-budgeted, tier-labelled and persisted as a pack; graph state holds the pack id, NEVER canon text. The stable segment MUST stay
  byte-identical while canon is unchanged; chapter prose travels as a template variable, NEVER inside the pack.
- Prompt text MUST live in versioned code and the version MUST bump on any wording change; every call logs `promptKey@promptVersion`. The plugin policy digest MUST be in any
  `llm_cache` key; only deterministic roles are cacheable. `runId` MUST correlate runs, model calls, tool calls, packs and messages. Prefer deterministic code over AI wherever
  code can decide.
- A cost tier MUST change models, not reasoning effort (the gateway ignores per-request effort), and MUST never get cheaper from Economy to Performant. Every unrestricted tier
  entry MUST sit on the allowlist.
- Entity canon MUST exist as entity records, not cast narrated in a document.
- **Plugins** are operator-loaded (off unless `plugins.dir` is set), per project, answering only fixed decision points (canon augment, brief policy, call routing, context/prompt
  contribution). They MUST NEVER register routes, hold the database client, write domain tables, change a plan's volume, content mode, claimed milestones or ending flag, or issue
  `action.*` ops; durable changes are allowlisted proposals. A failing plugin degrades its decision point and MUST NEVER fail a generation.

## Publishing

- One way, forge -> `web-novel-server`, over an Identity M2M token. The forge owns the publication ledger, access control and slug; the reader holds a rebuildable projection
  keyed by the project id sent as `sourceRef`. Converge order: novel, access, chapters, wiki. The ledger row is the outbox: failed pushes are retried, except stale, hash and slug
  conflicts, which wait for an explicit reconcile. Wiping the reader and reconverging MUST yield identical state.
- `publishedOrdinal` MUST be assigned once, NEVER re-derived from chapter numbers. Only locked, non-empty chapters publish, contiguously. Every push MUST be idempotent
  (`contentHash`); no forge internals or unrevealed facts in a payload; unrated is never sent as `none`. A novel-level rating MUST NEVER fall below the highest published-chapter
  rating per dimension (the forge refuses, never raises). Publishing is NEVER automatic on approval; an amend reschedules an already-published chapter.
- The wiki is derived, never authored on the reader: entities and canon facts are projected into facets gated by `visibleFromOrdinal`. Hidden entities, never-revealed facts and
  fragments of unpublished chapters are never sent.
- **Portraits as of a chapter**: every new image is dated with the chapter it depicts (0 is before chapter 1; unstated means the latest final chapter). A generated image draws
  from canon, so it may not pass the latest final chapter (`ILL_016`), and its references may not depict a later chapter than it does; an author-supplied image may name a later
  chapter and stays withheld until that chapter publishes. Each image reaches readers, caption included, only from its chapter. Rows from before dating keep their old visibility.
- A portrait later than its entry stays the top-level `imageRef` under its own `imageVisibleFromOrdinal`: a reader short of it gets the latest gallery image they have reached as
  the list thumbnail and no portrait on the entry page. The forge sends that gate only to a reader that advertises the headline-gate capability; otherwise the portrait joins the
  gated gallery. Capability and gate are part of drift detection, so an upgrade or rollback heals on the next converge, and a rolled-back reader hides a gated headline rather
  than leaking it (`docs/architecture.md`, `docs/packages.md`).

## Non-goals

- No auth beyond Identity, local chat models, graph interrupts, reader-side editing, reader-account access, amend retraction, advance chapter planning or chapter counts per
  volume, scene-by-scene writing with separate packages, or portraits of a future look.

## Open work

- The disclosure policy and the audit's secret check are lexical: a paraphrase of a secret in other words passes both, and the audit does not flag spoiler prose already on a page
  outside `canon_facts`.
- Cancellation is process-local: a cancel reaches only the replica running the work.
- The stale cascade locks later drafts in whatever order its update visits them, so two saves cascading over overlapping chapters can deadlock; the loser is answered `DRF_013`
  until the cascade locks them in chapter order.
- The hard line is a lexical screen, so it refuses conservatively and can be evaded by wording. By a standing conservative policy, "sex" and "molest" paired with a minor on the
  author's own text are refused, so a survivor's backstory written in plain words on the unrestricted route is refused.
