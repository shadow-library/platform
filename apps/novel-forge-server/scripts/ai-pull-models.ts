/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Ollama } from 'ollama/browser';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const host = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';

// Pinned model set: all models referenced by LOCAL_TEST_DEFAULTS.
// Pulled in order: embedding first (smaller), then the two LLM sizes.
const models = ['qwen3-embedding:8b', 'qwen3:8b', 'qwen3:14b'];

const client = new Ollama({ host });

// Verify that Ollama is reachable before attempting pulls.
try {
  await client.list();
} catch (err) {
  console.error(`Ollama unreachable at ${host}: ${err}`);
  process.exit(1);
}

console.log(`Ollama reachable at ${host}`);
console.log(`Pulling ${models.length} model(s)...`);
console.log('');

for (const model of models) {
  process.stdout.write(`  Pulling ${model}...`);
  try {
    const stream = await client.pull({ model, stream: true });
    for await (const part of stream) {
      if (part.status === 'success') break;
      // Print a dot every N bytes so the terminal shows progress without flooding it.
      if (part.completed && part.completed % (50 * 1024 * 1024) < 1024 * 1024) process.stdout.write('.');
    }
    console.log(` done`);
  } catch (err) {
    console.error(`\n  Failed to pull ${model}: ${err}`);
    process.exit(1);
  }
}

console.log('');
console.log(`All models pulled successfully.`);
