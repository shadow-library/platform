/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Declaring the constants
 */

/**
 * Splits argv (already stripped of `node`/script path and the command name) into positional arguments
 * and flags. Supports `--flag value`, `--flag=value`, and boolean `--flag`. No CLI framework — five
 * commands with at most one optional string flag each don't need one.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const equalsIndex = arg.indexOf('=');
    if (equalsIndex !== -1) {
      flags[arg.slice(2, equalsIndex)] = arg.slice(equalsIndex + 1);
      continue;
    }

    const name = arg.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next;
      index++;
    } else {
      flags[name] = true;
    }
  }

  return { positionals, flags };
}
