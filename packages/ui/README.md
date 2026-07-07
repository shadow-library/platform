# @shadow-library/ui

Shared UI components, layout primitives, and utilities for all Shadow Library apps.

## Installation

```sh
# npm
npm install @shadow-library/ui

# bun
bun add @shadow-library/ui
```

### Peer Dependencies

```sh
# npm
npm install react react-dom

# bun
bun add react react-dom
```

`@tanstack/react-router` is an optional peer, required only if you use the `useSearchParams` hook.

## Setup

Shadow UI is styled with **CSS Modules and CSS-variable design tokens** — there is no provider to mount. Import the stylesheet once at your app root:

```ts
import '@shadow-library/ui/styles.css';
```

This ships the `--sh-*` design tokens, a minimal reset, and every component's scoped styles.

### Theming

Switch theme by toggling `data-theme` (or the `dark` class) on `<html>`, and set density with `data-density`:

```html
<html data-theme="dark" data-density="compact">
```

Retheme by overriding any token at any scope — the tokens are the single source of truth:

```css
:root {
  --sh-accent: #7c3aed;
}
```

An `@layer`-wrapped variant (`@shadow-library/ui/styles.layer.css`) is also published for consumers who want to de-prioritize the library's styles in the cascade.

## What's Included

### API Client

A chainable HTTP client with pre/post hooks and typed errors.

```ts
import { APIRequest, ApiError } from '@shadow-library/ui';

const data = await APIRequest.get('/users')
  .query({ limit: 20 })
  .header('X-Tenant', 'acme')
  .then((res) => res.json());
```

### OpenAPI Code Generation

Generate typed API clients from an OpenAPI spec URL.

```ts
import { generateApi } from '@shadow-library/ui';

await generateApi('https://api.example.com/openapi.json');
```

### Hooks

| Hook              | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `useSearchParams` | Read and update URL query params via TanStack Router |

## Full Documentation

Component props, usage examples, and visual previews are available in Storybook.

```sh
npm run storybook
```

## License

MIT
