# @shadow-library/ui

Shared UI components, layout primitives, and utilities for all Shadow Library apps. Full component/export
list: `.claude/skills/shadow-library-ecosystem/references/api-catalog.md`. Development conventions: this
package's `CLAUDE.md`.

## Setup

Import the stylesheet once at your app root:

```ts
import '@shadow-library/ui/styles.css';
```

### Theming

Switch theme by toggling `data-theme` (or the `dark` class) on `<html>`, and set density with `data-density`:

```html
<html data-theme="dark" data-density="compact"></html>
```

An `@layer`-wrapped variant (`@shadow-library/ui/styles.layer.css`) is also published for consumers who want to de-prioritize the library's styles in the cascade.

## Server-side rendering (SSR)

The package ships one universal ESM build with no runtime style injection, so there is nothing to collect or flush during SSR. Components server-render to stable markup and hydrate without mismatches, provided you observe these notes:

- **Deterministic formatting.** Number/date components (`Statistic`, `Pagination`, `Calendar`, `DatePicker`, `DateRangePicker`, and `formatLongDate`) format with a pinned **`en-US`** default so the server and the browser always produce identical text. Pass a `locale` prop to localize — use the **same** locale on the server and the client.
- **Time-dependent UI resolves after mount.** `Calendar` (the "today" marker) and `NotificationList` ("Today"/"Yesterday" headers) read the wall clock, which differs between server and client, so they render a clock-free result on the server and resolve the current day after hydration. Pass `today` / `now` to make them fully deterministic during SSR.
- **Platform detection resolves after mount.** `Kbd` renders the non-Mac form (`Ctrl`) on the server and switches to `⌘` on macOS after hydration. Pass `mac` to pin it.
- **Imperative overlays are client-only.** `toast`, `bannerStore`, and their outlets (`<Toaster />`, `<BannerOutlet />`) are client-side imperative APIs. Their state is never emitted into server HTML — render `<Toaster />` / `<BannerOutlet />` at your app root and drive them from client code. (They are module singletons; treat them as client-only and never call `toast()` during server render.)
- **Router-bound UI lives on a subpath.** `NavProgress` is exported from `@shadow-library/ui/router` (it depends on the optional `@tanstack/react-router` peer); importing the package root never pulls that peer in.

### App Shell

`Shell` owns the whole frame — not just the sidebar. The content region beside it comes with responsive gutters (16 → 24 → 32px as the viewport grows, clearing display cutouts and the home indicator) and a centered reading column, so pages render their content and nothing else:

```tsx
<Shell sidebar={<Sidebar>…</Sidebar>} topbar={<TopNavigation>…</TopNavigation>} contentWidth={1040}>
  <Outlet />
</Shell>
```

| Prop             | Effect                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `contentWidth`   | Reading-column cap, centered once the region outgrows it. `'fluid'` fills. Default `1200` |
| `contentPadding` | Gutter scale: `'none' \| 'sm' \| 'md' \| 'lg'`. Each step is responsive. Default `'md'`   |
| `bottomNav`      | Phone-only bar (e.g. `BottomNavigation`), pinned bottom and hidden from `768px` up        |

Below `768px` the persistent sidebar becomes a modal nav drawer. `TopNavigation` surfaces the hamburger automatically; a bespoke top bar wires its own trigger with the `useShellNav()` hook. From `768px` up the chrome is pinned and only the content region scrolls; below it the document scrolls so mobile browsers keep their URL-bar auto-hide.

`bottomNav` is always rendered and removed by CSS alone, so it is present in server-rendered HTML instead of appearing after hydration. The content region reserves `--sh-shell-bottom-nav-height` (56px, overridable) plus one safe-area inset — the bar already pads itself past that inset, so don't add it again.

`TopNavigation` is the `banner` landmark; only its destinations sit inside the `nav` landmark, so the brand and the utility cluster stay out of it. Its `search` slot takes the space between the two.

### Router links

Nav items take the router's own link through `asChild`, keeping the link's children as the label:

```tsx
<Sidebar.Item asChild icon={<Icon />}>
  <Link to="/services">Services</Link>
</Sidebar.Item>
```

No `active` prop is needed when the router marks its own links — the active treatment also keys off `data-status="active"`, which TanStack Router sets alongside `aria-current="page"`. Where a _parent_ has to know which child is current (a bottom bar's `value`, an overflow menu), use `matchPath(pathname, to)` rather than a hand-rolled `startsWith`.

`Sidebar` can own its rail state: pass `defaultCollapsed` and/or `storageKey` to get a working collapse toggle that survives reloads. The stored value is adopted after mount, so server-rendered apps hydrate against `defaultCollapsed`.

A `Page` inside a shell contributes only its header — the shell already supplied the gutters and column. Pass `Page`'s `maxWidth` to narrow a single page (a settings form inside a wide shell); standalone, a `Page` still frames itself.

## Utility Classes

Alongside components, Shadow UI ships a small, hand-authored set of utility classes for composing layout in your **own** markup around library components (e.g. spacing a `Card` and a `Button` apart, or laying out a form grid). Every value is drawn from the same `--sh-*` design tokens as the components themselves — no ad hoc pixel values.

These are additive and optional: no component depends on them internally. **This table is the authoritative list — `CLAUDE.md` requires any new utility to be added here.**

```tsx
<div className="flex items-center justify-between gap-16 p-24">
  <span className="text-h3 text-secondary">Total</span>
  <Statistic value={128} />
</div>
```

> **Naming.** These classes are intentionally **unprefixed** (`flex`, `p-16`, `center`, …) so they're the first thing you reach for, not `sh-flex` vs. your own `.flex`. That means a global class of the same name in your app _will_ collide. If that's a concern, import `@shadow-library/ui/styles.layer.css` instead of `styles.css` — it wraps the whole library (tokens, reset, utilities, components) in `@layer shadow-library`, so any unlayered rule in your own app wins automatically regardless of source order.

### Layout Primitives

Small, composite, component-like patterns for the layouts every app needs. Combine with the atomic classes below (a `gap-*` class on `.stack`/`.cluster`, for example) rather than reaching past them.

| Class       | Behavior                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------- |
| `center`    | Flex container, centered on both axes                                                         |
| `center-x`  | Flex row, centered horizontally only                                                          |
| `center-y`  | Flex row, centered vertically only                                                            |
| `stack`     | Vertical flex layout — pair with `gap-*`                                                      |
| `cluster`   | Horizontal, wrapping flex layout for same-height groups (tags, chip lists, action bars)       |
| `container` | Centered, max-width page container (`max-width: var(--sh-breakpoint-xl)`) with `24px` gutters |

### Layout

| Class                                                                                                 | CSS              |
| ----------------------------------------------------------------------------------------------------- | ---------------- |
| `block`, `inline-block`, `inline`, `flex`, `inline-flex`, `grid`, `inline-grid`, `contents`, `hidden` | `display`        |
| `relative`, `absolute`, `fixed`, `sticky`, `static`                                                   | `position`       |
| `inset-0`, `top-0`, `right-0`, `bottom-0`, `left-0`                                                   | offset shorthand |
| `overflow-hidden`, `overflow-auto`, `overflow-scroll`, `overflow-visible`                             | `overflow`       |
| `w-full`, `w-auto`, `w-screen`, `min-w-0`, `max-w-full`                                               | width            |
| `h-full`, `h-auto`, `h-screen`, `min-h-0`, `max-h-full`                                               | height           |

### Flexbox & Grid

| Class                                                                                      | CSS                                            |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `flex-row`, `flex-row-reverse`, `flex-col`, `flex-col-reverse`                             | `flex-direction`                               |
| `flex-wrap`, `flex-wrap-reverse`, `flex-nowrap`                                            | `flex-wrap`                                    |
| `items-{start,center,end,baseline,stretch}`                                                | `align-items`                                  |
| `justify-{start,center,end,between,around,evenly}`                                         | `justify-content`                              |
| `self-{start,center,end,stretch,auto}`                                                     | `align-self`                                   |
| `flex-1`, `flex-auto`, `flex-initial`, `flex-none`, `grow`, `grow-0`, `shrink`, `shrink-0` | `flex` shorthand / `flex-grow` / `flex-shrink` |
| `grid-cols-{1,2,3,4,5,6,12}`, `grid-cols-none`                                             | `grid-template-columns`                        |
| `grid-rows-{1,2,3,4}`                                                                      | `grid-template-rows`                           |
| `col-span-{1..6,full}`, `row-span-{1..4,full}`                                             | `grid-column` / `grid-row`                     |

> No bare `row`/`col` classes — those names imply a Bootstrap-style 12-column grid system this library doesn't have. Use `flex-row` / `grid-cols-*` instead.

### Spacing

Padding (`p-*`), horizontal/vertical padding (`px-*`/`py-*`), per-side padding (`pt-*`, `pr-*`, `pb-*`, `pl-*`), and the equivalent margin classes (`m-*`, `mx-*`, `my-*`, `mt-*`, `mr-*`, `mb-*`, `ml-*`, plus `*-auto` variants) are all generated from the same 4px grid the design tokens use:

`0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`

e.g. `p-16` → `padding: 16px`, `mt-24` → `margin-top: 24px`, `mx-auto` → `margin-inline: auto`.

Gap classes follow the same scale: `gap-*`, `gap-x-*`, `gap-y-*`.

### Typography

| Class                                                                         | Purpose                                            |
| ----------------------------------------------------------------------------- | -------------------------------------------------- |
| `text-{display,h1,h2,h3,body-lg,body,body-sm,caption,code}`                   | Font size + line height from the type scale tokens |
| `font-{sans,mono}`                                                            | Font family                                        |
| `font-{normal,medium,semibold,bold}`                                          | Font weight (400/500/600/700)                      |
| `text-{left,center,right,justify}`                                            | Text alignment                                     |
| `italic`, `not-italic`, `uppercase`, `lowercase`, `capitalize`, `normal-case` | Style / transform                                  |
| `truncate`, `whitespace-nowrap`                                               | Overflow text handling                             |
| `text-{primary,secondary,tertiary,placeholder}`                               | Text color from the semantic text tokens           |

### Other

| Class                                  | CSS                                                |
| -------------------------------------- | -------------------------------------------------- |
| `rounded-{none,sm,md,lg,xl,2xl,full}`  | `border-radius` from the radius tokens             |
| `cursor-pointer`, `cursor-not-allowed` | `cursor`                                           |
| `select-none`, `pointer-events-none`   | `user-select` / `pointer-events`                   |
| `sr-only`                              | Visually hidden, still available to assistive tech |

## Relationship to `@shadow-library/web`

The HTTP client (`APIRequest`), error model (`ApiError`), OpenAPI code generation (`generateApi`), and router hooks (`useSearchParams`) live in `@shadow-library/web` — Shadow UI is a component + design-token library only.
