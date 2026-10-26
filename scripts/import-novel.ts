import { ForgeClient, type ImportReport, NovelImporter, readManuscript, STATE_FILE } from './novel-import/index.ts';
import { log, reportError, ShadowError } from './utils/index.ts';

const DEFAULT_BASE_URL = 'https://novelforge.shadow-apps.test';
const BOT_KEY_ENV = 'NOVEL_FORGE_BOT_KEY';
const BASE_URL_ENV = 'NOVEL_FORGE_URL';
const BOT_KEY_SHAPE = /^sl_bot_\S+$/;

const USAGE = `Usage: bun scripts/import-novel.ts <folder> [--base-url <url>] [--approve] [--overwrite] [--insecure]

Imports a manuscript folder into Novel Forge as an organisation bot, chapter by chapter, with no AI calls.

  <folder>/novel.json       optional: { "title", "name", "notes", "contentMode": "standard" | "unrestricted" }
  <folder>/cover.png        optional (.jpg, .jpeg or .webp too); needs the NovelForgeIllustrator role
  <folder>/chapters/        one file per chapter, numbered 1, 2, 3, … with no gaps: 001-arrival.md, 002-the-storm.txt
                            a first line "# Title" becomes the chapter title; the rest is the prose

  --base-url <url>   Novel Forge origin (env ${BASE_URL_ENV}; default ${DEFAULT_BASE_URL})
  --approve          approve each chapter after importing it (still no finalize: that is an AI step a person runs)
  --overwrite        replace a chapter whose prose in Novel Forge differs from the file; without it, those are reported and left alone
  --insecure         accept a self-signed certificate (implied for *.test hosts)

The bot key is read from ${BOT_KEY_ENV}, never from the command line. Create the bot in Identity under the organisation's bots,
grant it NovelForgeProjectsWriter (plus NovelForgeIllustrator for a cover), and issue a key there.

The project id is recorded in <folder>/${STATE_FILE}, per Novel Forge origin, so running the import again resumes the same project:
chapters already there are compared with the files, and only the missing ones are sent.`;

interface Args {
  folder: string;
  baseUrl: string;
  approve: boolean;
  overwrite: boolean;
  insecure: boolean;
}

function parseArgs(argv: readonly string[]): Args | null {
  if (argv.includes('--help') || argv.includes('-h')) return null;
  const positional: string[] = [];
  const flags = new Set<string>();
  let baseUrl = process.env[BASE_URL_ENV]?.trim() || DEFAULT_BASE_URL;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] ?? '';
    if (arg === '--base-url') {
      const value = argv[++index];
      if (!value) throw new ShadowError('--base-url needs a value');
      baseUrl = value;
    } else if (arg.startsWith('--')) flags.add(arg);
    else positional.push(arg);
  }
  const unknown = [...flags].filter(flag => !['--approve', '--overwrite', '--insecure'].includes(flag));
  if (unknown.length > 0) throw new ShadowError(`unknown option ${unknown.join(', ')}\n\n${USAGE}`);
  const [folder, ...extra] = positional;
  if (!folder || extra.length > 0) throw new ShadowError(`name exactly one manuscript folder\n\n${USAGE}`);
  return { folder, baseUrl: baseUrl.replace(/\/+$/, ''), approve: flags.has('--approve'), overwrite: flags.has('--overwrite'), insecure: flags.has('--insecure') };
}

function list(numbers: number[]): string {
  return numbers.length > 8 ? `${numbers.slice(0, 8).join(', ')} … (${numbers.length})` : numbers.join(', ');
}

function printReport(report: ImportReport, target: string): void {
  log.success(`${report.projectCreated ? 'Created' : 'Resumed'} project ${report.projectId} on ${target}`);
  const { imported, updated, unchanged, conflict } = report.chapters;
  log.info(`  chapters  ${imported.length} imported, ${updated.length} updated, ${unchanged.length} already there`);
  if (report.approved.length > 0) log.info(`  approved  ${list(report.approved)}`);
  if (report.cover !== 'absent') log.info(`  cover     ${report.cover}`);
  if (conflict.length > 0)
    log.warn(`  differs from Novel Forge and was left alone: chapters ${list(conflict)} — re-run with --overwrite to replace them (a finalized chapter is never replaced)`);
  if (report.extraOnForge.length > 0) log.warn(`  Novel Forge holds chapters the folder does not: ${list(report.extraOnForge)}`);
  for (const warning of report.warnings) log.warn(`  ${warning}`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    log.info(USAGE);
    return 0;
  }
  const botKey = process.env[BOT_KEY_ENV]?.trim();
  if (!botKey) throw new ShadowError(`set ${BOT_KEY_ENV} to the bot's sl_bot_… key`);
  if (!BOT_KEY_SHAPE.test(botKey)) throw new ShadowError(`${BOT_KEY_ENV} is not a bot key — it starts with sl_bot_`);

  const manuscript = readManuscript(args.folder);
  const insecureTls = args.insecure || new URL(args.baseUrl).hostname.endsWith('.test');
  const client = new ForgeClient({ baseUrl: args.baseUrl, botKey, insecureTls });
  log.info(`Importing "${manuscript.title}" (${manuscript.chapters.length} chapters) into ${args.baseUrl}`);
  const report = await new NovelImporter(client, { approve: args.approve, overwrite: args.overwrite }).run(manuscript);
  printReport(report, args.baseUrl);
  return report.chapters.conflict.length > 0 ? 3 : 0;
}

if (import.meta.main) {
  main().then(
    code => process.exit(code),
    (error: unknown) => process.exit(reportError(error)),
  );
}
