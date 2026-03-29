/**
 * Importing npm packages
 */
import path from 'node:path';

import { generateApi } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const rootDir = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(rootDir, 'src/lib/api.gen.ts');
const openapiSpecUrl = process.env.OPENAPI_SPEC_URL || 'https://pulse.shadow-apps.com/dev/api-docs/openapi.json';

const contents = await generateApi(openapiSpecUrl);
await Bun.write(outputPath, contents);
// await Bun.$`biome format ${outputPath}`;
console.log(`API generated successfully at ${outputPath}`);
