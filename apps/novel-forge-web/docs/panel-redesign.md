# Removing the Second Rail

> Approved from the mockups at `claude.ai/artifact/LMMr3FB8Ew8NvqHcREYdnT` on 2026-09-20. Eight artboards,
> drawn against real project data. This document is the implementation contract, not a re-design.

## 1. What is wrong

Every list-detail page renders `.nf-splitpane` → `.nf-rail` + `.nf-detail`, a 240px left column, regardless
of what the page holds. Measured across the screens the author sent:

| Page              | Items in the rail | What the rail does                                                                     |
| ----------------- | ----------------- | -------------------------------------------------------------------------------------- |
| Review Queue      | **0**             | says "Nothing awaiting review" beside a detail pane that also says nothing is selected |
| Illustrations     | **1**             | wraps one label onto three lines                                                       |
| Canon Facts       | 7                 | works — but truncates identifiers (`families_survived_me…`)                            |
| Story Bible       | 39                | duplicates the type cards the detail pane also renders                                 |
| Ideas (`$seedId`) | n/a               | a right panel holding long prose at a ~28-character measure                            |

Three separate faults, one cause: **a fixed column chosen by route rather than by content.**

Narrowing it 380px → 240px (commit `c9bd797e` and the rail/stop/admin run) fixed the hierarchy symptom —
the rail no longer out-ranked the 254px sidebar — but kept the column. A width rule cannot fix a structural
problem: the next page that needs an index reintroduces it and the argument restarts.

## 2. Decisions

| #   | Decision                                                                                                                                                         | Rationale                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **There is exactly one left column in the app: the 254px sidebar.** No page adds a second.                                                                       | A rule that cannot be satisfied badly. "Narrower than the sidebar" can.                                                                                                                                                                                                          |
| D2  | A list-detail page has **two states**: a full-width directory, or a full-width detail.                                                                           | The rail existed to be both at once, which is what made it redundant on Story Bible and empty on Review Queue.                                                                                                                                                                   |
| D3  | Moving between items is **back-link + prev/next + ⌘K**, never a column.                                                                                          | The ⌘K command bar already exists in the chrome. A persistent index was a second, worse implementation of a feature that shipped.                                                                                                                                                |
| D4  | Panels that remain live on the **right**, and are never navigation.                                                                                              | Context for the centre. No rank competition with the sidebar; `ideas/$seedId` already establishes that side's meaning.                                                                                                                                                           |
| D5  | Right-panel width contract: **≤260px** chips and counts only · **280–360px** labels and clamped summaries · **≥560px** for prose, otherwise it opens in a sheet. | 280px of prose is a 28-character measure. The panel's job is glancing; reading happens at 640px over the content area.                                                                                                                                                           |
| D6  | **Chat keeps a persistent conversation list — inside the sidebar**, nested under Refinement Chat.                                                                | A chat list is genuinely persistent navigation, unlike the other rails. It does not need its own column; ChatGPT and Claude both nest it. This is also the real fix for the reported white space: three titles in a 254px nav read as a list, in a 380px rail as an empty panel. |
| D7  | An empty collection renders **one** centred state naming the action that resolves it, plus counts.                                                               | Review Queue currently renders two empty states that answer each other.                                                                                                                                                                                                          |

### 2.1 Accepted consequences

- **No page shows an index and a detail simultaneously.** Working through Canon Facts or the Review Queue
  relies on prev/next with a position indicator rather than a visible list. This was chosen deliberately;
  if it proves worse in use, the fix is a transient ⌘K-style overlay, **not** the column coming back.
- `runs.tsx` (admin) and `translation.tsx` were not drawn in the mockups. They adopt the same primitives,
  but translation is a pipeline page rather than list-detail — **R8 reads it before assuming the pattern fits**
  and reports if it does not.

## 3. The primitives

All under `src/components/nf/`. Each replaces hand-rolled markup currently repeated across routes.

| Component        | Shape                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `CollectionPage` | header (title, count, actions) · toolbar (filter field + segmented control) · body slot · `empty` slot. Full width, no rail. |
| `DetailPage`     | header strip (back link, identity slot, `ItemPager`, jump, actions) · body (main column, `aside` slot). Full width.          |
| `ItemPager`      | `‹ n of m ›` over an ordered id list, plus a jump button that opens the existing ⌘K palette scoped to the collection.        |
| `SidePanel`      | right-hand, 300–340px, collapsible, `title` + children. Never used for navigation.                                           |
| `EmptyState`     | centred icon, heading, one paragraph, actions, optional counts strip.                                                        |
| `FieldCard`      | label + provenance chip + 2–3 line clamp + "Read all N words" → opens `ReadingSheet`.                                        |
| `ReadingSheet`   | 640px centred overlay for prose, with the field's own actions.                                                               |

## 4. Task breakdown

Tiers per `plan-orchestrator`. Groups are serial; within a group, tasks are serial unless stated.

### Group L — primitives

| id  | Task                                                                                                                                            | Tier   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| L1  | `CollectionPage` + `EmptyState` + their CSS modules. Reach for `@shadow-library/ui` before hand-rolling the segmented control and filter field. | Medium |
| L2  | `DetailPage` + `ItemPager`. The pager needs the ordered, **filtered** id list — decide where that state lives before writing it.                | High   |
| L3  | `SidePanel` + `FieldCard` + `ReadingSheet`. Focus trap and Escape on the sheet; clamp via `-webkit-line-clamp` with a non-clamped fallback.     | Medium |
| L4  | Wire the ⌘K palette to accept a scoped collection (jump to entity / fact / illustration) and expose it to `ItemPager`.                          | High   |

### Group R — route migrations, one commit each

| id  | Route                   | Notes                                                                                                                       | Tier   |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------ |
| R1  | `story-bible.tsx`       | Directory groups by type with "See all N"; drops the six category cards **and** the "or use the type selector" copy.        | High   |
| R2  | `canon-facts.tsx`       | Keys are identifiers: never truncate, never ellipsise. Detail = reading column + `SidePanel` (ledger, reveal, attachments). | Medium |
| R3  | `illustrations.tsx`     | Directory is a thumbnail grid. Detail puts the image beside its controls; draw the empty second candidate slot.             | Medium |
| R4  | `review.tsx`            | `EmptyState` with counts. Queue list when non-empty. This is the double-empty-state page.                                   | Medium |
| R5  | `proposals.tsx`         | Not drawn — closer to a review inbox than a directory. Read it first and report if the pattern does not fit.                | Medium |
| R6  | `chat.tsx` + `AppShell` | Conversation list nested in the sidebar (D6); transcript centred ≤720px; right `SidePanel` = changes in this chat.          | High   |
| R7  | `ideas/$seedId.tsx`     | Centre the transcript; seed panel becomes `FieldCard`s + `ReadingSheet`. Keep the multi-select work from `a391f61b`.        | High   |
| R8  | `translation.tsx`       | 1,618 lines, pipeline rather than list-detail. **Read before assuming.** Report if the pattern does not fit.                | High   |
| R9  | `runs.tsx`              | Admin. Keeps `provider/model` (operator surface, `3dceb001`). Lowest priority — may be deferred.                            | Medium |

### Group C — cleanup

| id  | Task                                                                                                                                                                                   | Tier   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| C1  | Delete `.nf-splitpane`, `.nf-rail`, `.nf-railhead`, `--nf-rail-width`, `--nf-detail-min` and `PageSkeleton`'s rail variant once nothing references them. Grep `src/` **and** `tests/`. | Medium |
| C2  | Full verify of both workspaces plus the api-types drift check.                                                                                                                         | Medium |

## 5. Ordering

```
L1 → L2 → L3 → L4        (nothing to migrate onto until these exist)
R1 → R2 → R3 → R4        (the four drawn list-detail pages, simplest contract first)
R6 → R7                  (the two centred-transcript pages)
R5 → R8 → R9             (the three undrawn pages, each reporting before it assumes)
C1 → C2
```

`R9` may be dropped without affecting the rest; it is an admin surface and the last consumer of the old
classes, so `C1` depends on it.

## 6. Verification, every task

`bun scripts/verify.ts apps/novel-forge-web` — baseline **210 pass / 0 fail**, zero warnings.
`bun scripts/verify.ts apps/novel-forge-server` — baseline **2420 pass / 1 skip / 0 fail**. The skip
baseline is **1**, not 10. Hundreds of skips means the k3d dev cluster dropped and is not a valid green.

No route migration may change an API contract. If one appears to need a server change, stop and report.

## 7. Open risk

`ItemPager` needs the ordered id list the directory was filtered to, across a route change into the detail.
If that state is not already available it must be derived from the same query the directory uses rather
than refetched, or prev/next will disagree with the list the author was just looking at. **L2 decides this
explicitly.**
