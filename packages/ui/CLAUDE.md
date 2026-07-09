# CLAUDE.md — Shadow UI Development Guide

> Authoritative guide for developing `@shadow-library/ui`. **Read this file in full before making any change.** It is written so a fresh Claude session (or any contributor) can continue development without additional project-specific instructions.

---

## Project Overview

**Purpose.** Shadow UI is an enterprise-grade, reusable React component library for the Shadow Apps ecosystem. It implements the **Shadow UI v1.1** design system (see the imported Claude Design project *Shadow UI Design System*) as accessible, themeable, tree-shakeable components published to npm as `@shadow-library/ui`.

**Supported framework.** React 18.3+ / 19 (declared as a peer dependency). Components are framework-idiomatic React with TypeScript; no application/business logic lives here.

**High-level architecture.**
- A **design-token layer** of CSS custom properties (`--sh-*`) is the single runtime source of truth for all themeable values (colors, type, spacing, radius, elevation, motion, z-index, density). Light and dark are the same tokens with different values; theme flips cascade automatically.
- Each **component** is a self-contained folder pairing a React `.tsx` with a scoped **CSS Module** (`.module.css`) that consumes tokens. No component depends on a global class — see the one documented exception below.
- The **package entry** (`src/index.ts`) imports the global stylesheet and re-exports every public component, hook, and type.
- The **build** (`scripts/build.ts`) bundles ESM with Rollup, extracts all CSS Modules + globals into one `dist/styles.css`, and emits type declarations.

---

## Technology Stack

| Concern | Tool |
| --- | --- |
| Language | TypeScript 5.9 (strict), React 18.3+/19 |
| Styling | **CSS Modules** + CSS custom-property design tokens |
| Build | Bun + Rollup (`rollup-plugin-esbuild`, `rollup-plugin-postcss` with `postcss-import`) |
| Types | `tsc` (declaration emit) + `tsc-alias` |
| Lint / format | Biome |
| Tests | Vitest — `unit` project (happy-dom) + `storybook` project (Playwright/Chromium) + Testing Library |
| Docs / visual QA | Storybook 10 (`@storybook/react-vite`) |
| Composition | `@radix-ui/react-slot` (the sanctioned `asChild` Slot) |
| Overlays / behavior | **Radix UI primitives** (`@radix-ui/react-select`, and the sibling packages added per component: dropdown-menu, popover, dialog, tooltip, …). Overlay, menu, and disclosure components wrap the matching Radix primitive 1:1 and skin it with a CSS Module; Radix owns focus management, positioning/flip, and ARIA. Keep the primitive **external** in the build (declare it a dependency), never fork it. |
| Package manager | Bun (`bun.lock`) |
| Releases | release-it + conventional-changelog; commitlint + Husky |

**Do not introduce Tailwind CSS, CSS-in-JS runtimes, or any other styling system.** Components style exclusively through CSS Modules; the library also ships one hand-authored, token-backed, **unprefixed** global utility layer (`src/styles/utilities.css`) for consumers' own layout markup — see *Styling Guidelines* rule 4.

---

## Folder Structure

```
ui/
├── CLAUDE.md                 # This guide — read first
├── .storybook/               # Storybook config
│   ├── main.ts               # Framework, addons, stories globs, Vite aliases
│   ├── preview.tsx           # Imports global CSS, light/dark theme toolbar
│   └── foundations/          # Token-gallery stories (design docs, not shipped)
├── scripts/
│   └── build.ts              # Rollup + PostCSS build; writes dist/
├── src/
│   ├── components/           # One folder per component (see Component Standards)
│   ├── hooks/                # Shared, reusable hooks; barrel in index.ts
│   ├── lib/                  # Framework-agnostic utilities (cn, api client, …); barrel in index.ts
│   ├── styles/               # The ONLY global CSS
│   │   ├── tokens.css        # --sh-* design tokens (light + dark + compact density)
│   │   ├── reset.css         # Minimal, opinionated reset + base body styles
│   │   ├── utilities.css     # Unprefixed layout/spacing/typography utility classes (consumer opt-in only)
│   │   └── index.css         # Aggregates tokens.css + reset.css + utilities.css (the global entry)
│   ├── types.ts              # Shared public types
│   └── index.ts              # Package entry: imports global CSS, re-exports public API
├── biome.json                # Lint + format config (2-space, single quote, width 180)
├── tsconfig.json             # Base TS config (strict; @/* → src/*)
├── tsconfig.build.json       # Declaration-emit config for the build
└── vitest.config.ts          # unit + storybook test projects
```

Path alias: `@/*` → `src/*` (configured in `tsconfig.json`, the Rollup build, Storybook, and Vitest).

---

## Styling Guidelines

These are **hard rules**, not preferences:

1. **CSS Modules are the only styling approach for components.** Every component has a colocated `ComponentName.module.css`. Class names are scoped by the build; there is no leakage.
2. **Tailwind CSS must never be reintroduced** — no `@tailwind`/`@theme`/`@apply`, no `tailwind-merge`, no Tailwind config, no Tailwind dependency. This was deliberately removed. (The utility classes in `src/styles/utilities.css` are a separate, hand-authored, token-backed layer — see rule 4 — not a reintroduction of Tailwind.)
3. **CSS custom properties are the design tokens.** All themeable values (color, type, spacing, radius, shadow, border, transition, z-index) come from `--sh-*` variables. Never hardcode a hex, px font size, shadow, or duration in a component; reference the token.
4. **Components never depend on a global/utility class.** Every component's own markup is styled exclusively through its CSS Module — this is non-negotiable and keeps components tree-shakeable and stylable in isolation. The one exception is a **consumer-facing** utility layer: `src/styles/utilities.css` ships a small set of layout/spacing/typography/composition helpers (`flex`, `p-16`, `text-h2`, `center`, `stack`, …), documented in the README, for consumers composing layout in their *own* markup around library components. These classes are global CSS the library intentionally ships (alongside tokens + reset) — but no `.tsx` file under `src/components/` may reference one. If you need a class for a component's own layout, that's what the CSS Module is for.
   - **Deliberately unprefixed.** Earlier revisions of this layer used an `sh-` prefix to avoid collisions with a consumer's own global classes; that was dropped by explicit request so app developers reach for these names first rather than rolling their own `.flex`/`.container`/`.center`. This trades collision-safety for ergonomics — know that a consumer app defining its own global `.container` or `.center` will conflict. Consumers who need to de-risk that can import `@shadow-library/ui/styles.layer.css` instead of `styles.css`: it wraps everything (tokens, reset, utilities, components) in `@layer shadow-library`, so any of the consumer's own *unlayered* rules win regardless of source order or specificity.
   - Names that imply a different established behavior than they have here are avoided (e.g. no bare `.row`/`.col`, since those read as a 12-column grid system to anyone who's used Bootstrap; use `.flex-row` / `.grid-cols-*` instead).
5. **Shared styles live in the token layer.** If several components need the same value, it belongs in `tokens.css` as a token, not duplicated or hoisted into a component-facing global class.
6. **Semantic class names inside components** (`.root`, `.icon`, `.label`, `.trailing`) — never utility-style names (`.mt-2`, `.flex`) inside a `.module.css`. (Utility-style names are expected and correct inside `utilities.css` itself.)
7. **Avoid unnecessary nesting.** Prefer flat selectors; express variants/sizes/states with `data-*` attribute selectors on `.root` (see *Variant/Size implementation*).
8. **Ship no `!important`** except the documented reduced-motion reset.
9. **Extending the utility layer:** new utilities must consume an existing `--sh-*` token or the documented 4px spacing scale (never a raw hex/px not already on the scale), stay presentational (layout/spacing/typography/color-from-token — no component behavior), avoid a name that already means something different in a widely-known CSS framework, and be added to the README's utility table. One blank line between every rule; group related rules under a `/* ── Section ── */` comment, matching the existing sections in `utilities.css`.

---

## Component Standards

### File naming & folder structure
Each component is a folder under `src/components/` named in **PascalCase**, containing exactly:

```
Button/
├── Button.tsx           # Implementation (default or named export of the component)
├── Button.module.css    # Scoped styles; consumes --sh-* tokens
├── Button.types.ts      # Public prop types + variant/size unions
├── Button.test.tsx      # Vitest + Testing Library
├── Button.stories.tsx   # Storybook (CSF3)
└── index.ts             # Re-exports the component and its public types
```

Then export the folder from `src/components/index.ts`, and ensure `src/index.ts` re-exports `./components`. (When the first component is added, create `src/components/index.ts` and add `export * from './components';` to `src/index.ts`.)

### Type definitions
- Public props live in `Component.types.ts` as an exported `interface ComponentProps`.
- Extend the correct DOM props (e.g. `ComponentPropsWithoutRef<'button'>`) and **omit** any prop the component redefines.
- Variant/size/intent unions are exported string-literal types, aligned with the Foundations **API standards** (below).
- No `any`. `noUncheckedIndexedAccess` is on — index access yields `T | undefined`; handle it (compose classes through `cn`, which accepts `undefined`).

### Storybook stories
- CSF3, `title: 'Components/ComponentName'`, `satisfies Meta<typeof Component>`.
- Provide, at minimum: **Default**, each **Variant**, each **Size**, and the relevant **states** (disabled, loading, error, dark mode via the toolbar). Add an interactive/controls story.
- Stories double as visual QA and as the `storybook` test project's interaction/a11y source.

### Tests
- Cover: rendering, each variant/size, accessibility basics (role/name/ARIA), keyboard interaction, controlled **and** uncontrolled behavior, disabled behavior, and important edge cases.
- Use Testing Library queries by role/label. **Do not rely on snapshot tests.**
- Unit tests run in happy-dom via `bun run test`.

### Exports
- `Component/index.ts` re-exports the component and its public types.
- Barrels cascade: `Component/index.ts` → `components/index.ts` → `src/index.ts`.
- Keep exports tree-shakeable: no side effects in component modules except the CSS import (CSS is marked side-effectful in `package.json` `sideEffects`).

### Accessibility requirements
Every component must be keyboard-operable, expose correct roles/ARIA, manage focus, and meet WCAG 2.1 AA. See the *Accessibility Checklist*.

### Composition patterns
- `forwardRef` on every component that renders a DOM node; forward the ref to the primary element.
- Support an `asChild`/Slot pattern for trigger-like components when the design calls for it, so consumers can compose (e.g. a button that renders a router link). Use `@radix-ui/react-slot` (`Slot`) — do not hand-roll ref/prop merging.
- Prefer **compound components** (`Tabs`, `Tabs.List`, `Tabs.Trigger`) for multi-part widgets, sharing state via context.
- Always spread a caller's `...props` onto the root and merge `className` via `cn(styles.root, className)` so callers can extend.

### Variant / Size / State implementation (the standard pattern)
Express variants, sizes, and states as **`data-*` attributes on `.root`**, styled with attribute selectors in the module. This keeps one base class, avoids `styles[key]` `undefined` friction, and matches the Foundations rule "state is a data attribute, never className-based."

```tsx
// Button.tsx
import { forwardRef } from 'react';
import { cn } from '@/lib';
import type { ButtonProps } from './Button.types';
import styles from './Button.module.css';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(styles.root, className)}
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {children}
    </button>
  );
});
```

```css
/* Button.module.css */
.root {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: var(--sh-control-height-md);
  padding: 0 12px;
  border: var(--sh-border-width) solid transparent;
  border-radius: var(--sh-radius-md);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color var(--sh-duration-fast) var(--sh-ease-standard),
    border-color var(--sh-duration-fast) var(--sh-ease-standard),
    color var(--sh-duration-fast) var(--sh-ease-standard);
}
.root:focus-visible {
  outline: var(--sh-focus-ring-width) solid var(--sh-focus-ring);
  outline-offset: var(--sh-focus-ring-offset);
}
.root[data-variant='primary'] { background-color: var(--sh-accent); color: var(--sh-on-accent); }
.root[data-variant='primary']:hover { background-color: var(--sh-accent-hover); }
.root[data-size='sm'] { height: var(--sh-control-height-sm); }
.root[data-size='lg'] { height: var(--sh-control-height-lg); }
.root:disabled { opacity: var(--sh-disabled-opacity); cursor: not-allowed; }
```

Never enumerate transition properties as `transition: all` — list each property (Foundations §09).

---

## Design Tokens

All tokens live in `src/styles/tokens.css` as `--sh-*` custom properties. Semantic tokens are defined for **light** (`:root`) and overridden for **dark** (`:root[data-theme='dark'], .dark`). Compact density overrides live under `[data-density='compact']`. Consume the **semantic** token, not a primitive ramp value.

| Category | Token examples | Notes |
| --- | --- | --- |
| **Colors — surfaces** | `--sh-surface-app`, `--sh-surface-card`, `--sh-surface-well`, `--sh-surface-raised`, `--sh-surface-tooltip` | Dark elevates with lighter surfaces, not shadow. |
| **Colors — text** | `--sh-text-primary/secondary/tertiary/placeholder` | |
| **Colors — accent** | `--sh-accent`, `--sh-accent-hover`, `--sh-accent-active`, `--sh-accent-soft`, `--sh-on-accent` | Brand = indigo. |
| **Colors — interactive bg** | `--sh-bg-hover`, `--sh-bg-pressed` | Ghost hover/pressed washes. |
| **Colors — intents** | `--sh-{neutral\|success\|warning\|danger\|info}-{solid,solid-hover,solid-active,on-solid,bg-subtle,text-on-subtle,text,border}` | Status only. Info always pairs with a dot/icon. |
| **Borders** | `--sh-border-{subtle,default,strong,interactive,focus}`, `--sh-border-width` | Containers use `default`; controls use `strong`. All 1px. |
| **Typography** | `--sh-font-sans`, `--sh-font-mono`, `--sh-text-{display,h1,h2,h3,body-lg,body,body-sm,caption,code}` (+ matching `--…--line-height`) | Inter + JetBrains Mono. |
| **Spacing** | 4px grid — use literal multiples of 4 (`4,8,12,16,20,24,32,40,48,64,80`) | Kept as literals per the 4px grid; not tokenized individually. |
| **Radius** | `--sh-radius-{sm,md,lg,xl,2xl,full}` | 4/6/8/12/16/full. |
| **Shadows / elevation** | `--sh-shadow-{e1,e2,e3}` | `none` in dark. |
| **Transitions / motion** | `--sh-duration-{fast,normal,slow}` (+ `-exit`), `--sh-ease-standard`, `--sh-ease-emphasized` | Enumerate transitioned properties; never `transition: all`. |
| **Focus** | `--sh-focus-ring`, `--sh-focus-ring-width`, `--sh-focus-ring-offset`, `--sh-focus-field-ring`, `--sh-focus-field-ring-error` | Two treatments: `focus-ring` (non-text controls) and `focus-field` (editable controls). |
| **Z-index** | `--sh-z-{base,sticky,shell,dropdown,scrim,modal,command-palette,popover,toast,tooltip,dev-overlay}` | Fixed ladder — never invent values. |
| **Density** | `--sh-control-height-{sm,md,lg}`, `--sh-row-height` | Comfortable default; `[data-density='compact']` shrinks. |
| **Breakpoints (reference)** | `--sh-breakpoint-{sm,md,lg,xl,2xl}` | CSS vars can't be used in `@media`; use the literal px and cite the token in a comment. |

**Adding a token:** if a component needs a value that doesn't exist, add it to `tokens.css` **first** (with both light and dark values for semantic colors), then consume it. Components never define their own themeable constants.

**Theming at runtime:** consumers switch theme by toggling `data-theme="dark"` / the `dark` class on `<html>`, and can override any `--sh-*` variable at any scope to retheme.

---

## Coding Standards

**TypeScript**
- Strict mode; no `any` (Biome errors). Prefer precise unions and `ComponentPropsWithoutRef<T>`.
- Inline type imports: `import { type Foo } from 'x'` (Biome `useImportType: inlineType`).
- Respect `noUncheckedIndexedAccess`; compose possibly-undefined class values through `cn`.

**React patterns**
- Function components only. `forwardRef` for DOM-rendering components; set `displayName` implicitly via named function.
- Derive, don't duplicate, state. Use `useId` for generated ARIA ids. Memoize only with measured need.

**Props design**
- Follow the Foundations **API standards**: `variant` (prominence), `size` (`sm|md|lg`, default `md`), `intent` (`neutral|info|success|warning|danger`), `disabled`/`loading`/`invalid` (positive booleans), `prefix`/`suffix` (adornments), `value`/`defaultValue`/`onValueChange`, `open`/`defaultOpen`/`onOpenChange`, `orientation`, `placement` (`side`+`align`), `asChild`, `fullWidth`.
- Handlers for non-native semantics are `onXChange`, never `onChange`.
- Always accept and forward `className` and `...props`.

**Ref forwarding** — forward to the primary interactive/root DOM node; never swallow refs.

**Controlled vs uncontrolled** — support both for value-bearing components: `value` + `onValueChange` (controlled) or `defaultValue` (uncontrolled), resolved with an internal fallback state.

**Performance** — keep components render-cheap; avoid unnecessary context re-renders; no layout thrash. CSS handles interaction states (`:hover`, `:focus-visible`, `data-*`) rather than JS where possible.

**Error handling** — components are presentational; validate props via types, not runtime throws. Fail safe (e.g. unknown `variant` still renders `.root`). Never crash on missing optional children.

---

## Accessibility Checklist

Every component must satisfy:
- **Keyboard support** — fully operable without a mouse; documented key bindings (Enter/Space activate, Arrow navigation for composites, Esc closes overlays); no keyboard traps except intentional modal focus traps.
- **Focus management** — visible focus using the correct treatment (`focus-ring` vs `focus-field`); overlays trap focus and restore it to the trigger on close; focus order follows visual order.
- **ARIA usage** — correct roles, names, and states (`aria-expanded`, `aria-selected`, `aria-busy`, `aria-invalid`, `aria-describedby`); prefer native elements before ARIA.
- **Color contrast** — text and UI boundaries meet WCAG 2.1 AA; never encode meaning with color alone (pair with icon/text — e.g. info always carries a dot/icon).
- **Screen reader compatibility** — meaningful accessible names, live regions for async/toast updates, `sr-only` text where visual context is implicit; icons are `aria-hidden` when decorative.
- **Touch** — interactive targets ≥ 44×44 (extend hit area invisibly for smaller controls and document it).

Storybook's a11y addon and the `storybook` test project are the automated backstop; manual keyboard/SR checks are still required.

---

## Development Workflow

When adding a new component:
1. **Create the folder** `src/components/ComponentName/`.
2. **Write the component** `ComponentName.tsx` (+ `ComponentName.types.ts`) — read the corresponding design file in the *Shadow UI Design System* project first; consume tokens; follow the variant/size/state pattern.
3. **Write the CSS Module** `ComponentName.module.css` using `--sh-*` tokens only.
4. **Add tests** `ComponentName.test.tsx` (rendering, variants, a11y, keyboard, controlled/uncontrolled, disabled, edge cases).
5. **Add the Storybook story** `ComponentName.stories.tsx` (default, variants, sizes, states, dark, interactive).
6. **Export it** — `ComponentName/index.ts` → `components/index.ts` → `src/index.ts`.
7. **Verify accessibility** — roles, keyboard, focus, contrast, a11y addon.
8. **Update documentation** if a new token or convention was introduced (this file + `tokens.css`).

Then run the full gate and fix everything before committing:

```bash
bun lint          # biome check   (bun format to auto-fix)
bun type-check    # tsc
bun run test      # vitest unit project
bun run build     # rollup + postcss + tsc declarations
bun run build-storybook   # optional but recommended for new components
```

Commit as a **single logical unit** using Conventional Commits (`feat: add button component`). Husky runs Biome + `tsc` pre-commit; commitlint enforces the message format.

---

## Future Development Instructions

**This project is developed across multiple, independent Claude sessions.** Every future session must:

- **Read `CLAUDE.md` in full before making any change.**
- **Preserve the existing architecture** — token layer + colocated CSS Modules + barrel exports + Rollup/PostCSS build. Do not restructure it without a compelling, documented architectural reason agreed with the user.
- **Follow the documented folder structure** exactly (the six-file component folder).
- **Follow the documented styling conventions** — semantic classes, token consumption, `data-*` variant/state selectors, no nesting bloat.
- **Use CSS Modules exclusively for component styling.** Never add Tailwind or any other styling system, and never make a component reach into `utilities.css`. The unprefixed utility layer exists only for consumers' own layout markup (Styling Guidelines rule 4) — if you find a component reaching for a utility class, stop.
- **Reuse existing design tokens.** Need a value? Add a token to `tokens.css` first (light + dark), then consume it — don't hardcode.
- **Avoid introducing new patterns** unless there is a compelling architectural reason; when in doubt, mirror the most recently shipped, reviewed component.
- **Keep APIs consistent** with existing components and the Foundations API standards (`variant`/`size`/`intent`/`onXChange`/`asChild`/…).
- **Prefer extending existing abstractions** (`cn`, hooks in `src/hooks`, shared types) over creating duplicates.
- **Maintain backwards compatibility** — treat shipped prop names and exports as public API; deprecate with aliases rather than breaking.

The intent: a brand-new session should be able to implement the next component correctly using only this file, `tokens.css`, and the corresponding design file.
