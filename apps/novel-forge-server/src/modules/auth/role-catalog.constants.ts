import { type RoleCatalogManifest } from '@shadow-library/auth';

import {
  ADMIN_PERMISSION,
  CURATE_PERMISSION,
  GENERATION_RUN_PERMISSION,
  ILLUSTRATIONS_WRITE_PERMISSION,
  PROJECTS_READ_PERMISSION,
  PROJECTS_WRITE_PERMISSION,
} from '@server/constants';

/**
 * Pushed to identity on boot as the complete truth for this application, so a permission or role
 * dropped from here is deleted there, cascading into its assignments.
 *
 * `NovelForgeAuthor` is the default role because an organisation admin may only grant a bot what they
 * themselves hold: without it, every admin would need an explicit assignment before they could hand a
 * bot the everyday permissions people already exercise. It is deliberately not bot-grantable — a bot
 * is granted one resource at a time, never the whole everyday set.
 *
 * Each bot-grantable role is the sole claimant of its (resource, level) pair, and the `projects` write
 * role carries the read role's permissions, both of which identity enforces server-side.
 *
 * `NovelForgeIllustrator` and `NovelForgeGenerator` are add-ons, not standalone grants: every content route
 * takes `novel-forge:projects:read` as its floor, so a bot holding either one alone reaches nothing until it
 * is paired with a projects role.
 *
 * `NovelForgeAdmin` opens run inspection — prompts, raw model output, cost — so it is neither default nor
 * bot-grantable: a platform role admin assigns it to a person, in the organisation their session acts in.
 */
const EVERYDAY_PERMISSIONS = [PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION, ILLUSTRATIONS_WRITE_PERMISSION, GENERATION_RUN_PERMISSION];

export const NOVEL_FORGE_ROLE_CATALOG: RoleCatalogManifest = {
  permissions: [
    { name: PROJECTS_READ_PERMISSION, description: 'Read projects and the chapters, bible, planning and export material under them' },
    { name: PROJECTS_WRITE_PERMISSION, description: 'Create and edit projects and the chapters, bible, planning and pipeline material under them' },
    { name: ILLUSTRATIONS_WRITE_PERMISSION, description: 'Upload, attach and manage project illustrations' },
    { name: GENERATION_RUN_PERMISSION, description: 'Run AI generation — drafting, planning, ideation and image generation — which incurs model spend' },
    { name: CURATE_PERMISSION, description: 'Publish third-party novels under their original author and push them through the curated-ingest surface' },
    { name: ADMIN_PERMISSION, description: 'Inspect workflow runs: prompt anatomy, context packs, per-call latency and raw model output' },
  ],
  roles: [
    {
      name: 'NovelForgeAuthor',
      description: 'Everyday authoring: read and write projects, illustrate them, and run AI generation',
      permissions: EVERYDAY_PERMISSIONS,
      default: true,
    },
    {
      name: 'NovelForgeProjectsReader',
      description: 'Reads projects and everything under them, and writes nothing',
      permissions: [PROJECTS_READ_PERMISSION],
      bot: { resource: 'projects', level: 'read' },
    },
    {
      name: 'NovelForgeProjectsWriter',
      description: 'Reads and writes projects, chapters, bible and planning material',
      permissions: [PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION],
      bot: { resource: 'projects', level: 'write' },
    },
    {
      name: 'NovelForgeIllustrator',
      description: 'Uploads and attaches project illustrations',
      permissions: [ILLUSTRATIONS_WRITE_PERMISSION],
      bot: { resource: 'illustrations', level: 'write' },
    },
    {
      name: 'NovelForgeGenerator',
      description: 'Runs AI generation, which incurs model spend',
      permissions: [GENERATION_RUN_PERMISSION],
      bot: { resource: 'generation', level: 'write', sensitive: true },
    },
    {
      name: 'NovelForgeCurator',
      description: 'Internal platform admin who brings third-party novels into the platform',
      permissions: [CURATE_PERMISSION],
      bot: { resource: 'curated-ingest', level: 'write' },
    },
    {
      name: 'NovelForgeAdmin',
      description: 'Platform operator who inspects workflow runs, their prompts and raw model output',
      permissions: [ADMIN_PERMISSION],
    },
  ],
};
