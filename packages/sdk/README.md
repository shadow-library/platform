# @shadow-library/sdk

Shared vocabulary and wire contracts for the Shadow Library novel platform. The package has no runtime
dependencies, and the root entrypoint has no Node built-ins either, so it is safe in a browser bundle.

```ts
import { NOVEL_GENRES, NOVEL_TAG_GROUPS, isRatingAtMost, type ContentRating } from '@shadow-library/sdk';
import { chapterContentHash } from '@shadow-library/sdk/publishing';
```

| Subpath                          | Contents                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `@shadow-library/sdk`            | Genres, tags and their groups, and the three graded content-rating dimensions. Browser-safe. |
| `@shadow-library/sdk/publishing` | The canonical content-hash primitive and the chapter hash derivation. Uses `node:crypto`.    |

Content ratings are three independent ordered dimensions (`sexualContent`, `violence`, `darkContent`). Each
is optional on a novel and an absent dimension means _unrated_, which is never the same as `'none'` — the
comparison helpers accept only a concrete level, so an unrated dimension has to be narrowed first.

## Publishing

The published artifact is the build output, never this directory — the root `.gitignore` excludes `dist/`, and
npm falls back to it without an `.npmignore`, so packing the source directory yields a tarball with every
`exports` path pointing at a file that was ignored. A `prepublishOnly` guard fails that route; publish the
built package instead (`scripts/build.ts` synthesizes `dist/package.json` without the guard):

```sh
bun scripts/build.ts packages/sdk && npm publish packages/sdk/dist
```
