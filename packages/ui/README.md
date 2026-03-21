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
npm install react react-dom @mantine/core @mantine/hooks @tanstack/react-router lucide-react

# bun
bun add react react-dom @mantine/core @mantine/hooks @tanstack/react-router lucide-react
```

## Setup

Wrap your app with Mantine's `MantineProvider` using the exported `shadowTheme`:

```tsx
import { MantineProvider } from '@mantine/core';
import { shadowTheme } from '@shadow-library/ui';

function App() {
  return <MantineProvider theme={shadowTheme}>{/* your app */}</MantineProvider>;
}
```

## What's Included

### Layout

A full application shell with a collapsible sidebar, top navigation bar, and optional footer.

```tsx
import { AppLayout } from '@shadow-library/ui';
import { LayoutDashboard } from 'lucide-react';

const navItems = [{ label: 'Dashboard', path: '/', icon: LayoutDashboard }];

function Shell({ children }) {
  return (
    <AppLayout appName='My App' navItems={navItems} user={{ name: 'Jane Doe', email: 'jane@example.com' }}>
      {children}
    </AppLayout>
  );
}
```

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
