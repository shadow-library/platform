# Shadow Library Platform

The Shadow Library platform monorepo: every first-party application and shared package, built and operated as one system on Bun workspaces.

## Layout

```text
apps/        8 applications — identity, novel-forge, pulse, and web-novel (server + web each)
packages/    8 shared packages the apps build on
e2e/         whole-platform Playwright suite, run against the local compose deployment
scripts/     root tooling
```

## Status

The polyrepo → monorepo migration is in progress: workspace histories are being imported and wiring is landing phase by phase. This README becomes the full platform overview when the migration completes.

## License

Copyright © Leander Paul. All rights reserved. The source is available for reading and evaluation; no license is granted for use, modification, or redistribution.
