/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AuthErrorCode } from '../errors';
import { BotGrantLevel, RoleCatalogManifest, RoleManifest } from '../interfaces';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const BOT_GRANT_LEVELS: readonly BotGrantLevel[] = ['read', 'write'];

const invalid = (reason: string): never => {
  throw AuthErrorCode.CONFIG_INVALID.create({ reason });
};

/**
 * Refuses a bot grant identity could only reject or, worse, accept in a shape an organisation admin
 * cannot reason about: one role per (resource, level), a valid level, and `write` implying `read`.
 */
export function assertValidRoleCatalog(manifest: RoleCatalogManifest): void {
  const grants = new Map<string, Partial<Record<BotGrantLevel, RoleManifest>>>();
  for (const role of manifest.roles) {
    const bot = role.bot;
    if (bot === undefined) continue;
    if (typeof bot.resource !== 'string' || bot.resource === '') invalid(`role '${role.name}' declares a bot grant without a resource`);
    if (bot.resource.trim() !== bot.resource) invalid(`role '${role.name}' declares a bot grant resource with surrounding whitespace`);
    if (!BOT_GRANT_LEVELS.includes(bot.level)) invalid(`role '${role.name}' declares an unknown bot grant level '${String(bot.level)}'`);
    if (bot.sensitive !== undefined && typeof bot.sensitive !== 'boolean') invalid(`role '${role.name}' declares a non-boolean bot grant sensitivity`);

    const levels = grants.get(bot.resource) ?? {};
    const duplicate = levels[bot.level];
    if (duplicate) invalid(`roles '${duplicate.name}' and '${role.name}' both declare the ${bot.level} bot grant on '${bot.resource}'`);
    grants.set(bot.resource, { ...levels, [bot.level]: role });
  }

  for (const [resource, { read, write }] of grants) {
    const missing = read && write ? read.permissions.filter(permission => !write.permissions.includes(permission)) : [];
    if (write && missing.length > 0) invalid(`bot write role '${write.name}' on '${resource}' lacks the read role's permissions: ${missing.join(', ')}`);
  }
}
